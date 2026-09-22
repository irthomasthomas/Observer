# remote.py
"""
Remote control: talk to the browser's MCP chat from WhatsApp or Telegram.

The user's whitelist code (the 4-word passphrase minted in the browser, see
app/src/utils/whitelistCode.ts) doubles as the session id. The server is only a
mailbox: messages from a bound phone/chat are queued for the owner's browser tab,
which long-polls /remote/inbox, runs them through its MCP, and answers through
/remote/reply. The conversation itself never leaves the browser.

Trust chain, each link keyed by the code:
  owner   - the first authenticated user to poll /tools/is-whitelisted with it
  pairing - a short window the owner's polls keep open; a code only binds inside it
  bind    - the first address (phone / chat_id) to send the code while pairing,
            kept permanently, one per channel
Only the owner reads the inbox and only the bound address feeds it. Codes get baked
into shared agent code, so knowing one must not be enough to take over either end.

This module only depends on Redis. The channel adapters (the Twilio webhook in
messaging.py, the Telegram webhook in tools_router.py) pass in how to reply and
how to record WhatsApp consent, which keeps the import graph acyclic.
"""

import json
import logging
import re
import time
from typing import Awaitable, Callable, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from auth import AuthUser
from redis_client import get_redis
from whitelist_words import WORDS

logger = logging.getLogger('remote')
remote_router = APIRouter()

Channel = Literal["whatsapp", "telegram"]

PAIRING_TTL = 600    # 10 min: how long after the owner's last whitelist poll a code can still bind
ALIVE_TTL = 45       # a tab re-polls the inbox every ~25s, so this lapses ~20s after the last tab closes
INBOX_TTL = 600      # an unread inbox evaporates on its own
INBOX_MAX_AGE = 120  # older messages are dropped rather than run: stale commands are worse than lost ones
INBOX_WAIT = 25      # long-poll hold, comfortably under proxy idle timeouts
BLPOP_SLICE = 2      # each blocking read stays well under any client socket timeout
SEEN_TTL = 3600      # provider retry dedupe
MAX_TEXT = 4000

_WORDS = frozenset(WORDS)

CONNECTED = "✅ Connected! Reply here any time to talk to your Observer session."
LINKED_ELSEWHERE = "This code is already linked to another account. Rotate it in Observer to link this one instead."
NOT_PAIRING = "Got your code, but Observer isn't waiting for it. Open the connect QR in Observer and send it again to chat from here."
NO_SESSION = {
    "whatsapp": "Hi! Your phone is whitelisted but no Observer session is active. Open Observer on your computer and try again.",
    "telegram": "Hi! This chat is linked but no Observer session is active. Open Observer on your computer and try again.",
}
TEXT_ONLY = "I can only read text messages for now."

Reply = Callable[[str], Awaitable[None]]
# WhatsApp only: record the sender's inbound consent, optionally under a code key.
Consent = Callable[[str | None], Awaitable[None]]


def normalize_code(text: str | None) -> str | None:
    """The canonical code if `text` is one ("Tree Book-shower golden" counts), else None."""
    if not text:
        return None
    parts = [p for p in re.split(r"[\s\-]+", text.strip().lower()) if p]
    if len(parts) == 4 and all(p in _WORDS for p in parts):
        return "-".join(parts)
    return None


def _owner_key(code: str) -> str: return f"remote:owner:{code}"
def _pairing_key(code: str) -> str: return f"remote:pairing:{code}"
def _bind_key(code: str, channel: str) -> str: return f"remote:bind:{code}:{channel}"
def _addr_key(channel: str, address: str) -> str: return f"remote:addr:{channel}:{address}"
def _alive_key(code: str) -> str: return f"remote:alive:{code}"
def _inbox_key(code: str) -> str: return f"remote:inbox:{code}"


async def claim(code: str, user_id: str) -> bool:
    """
    Called from the authenticated whitelist poll. Claims an unowned code for
    user_id and, if they own it, (re)opens its pairing window. Returns ownership.
    """
    r = await get_redis()
    await r.set(_owner_key(code), user_id, nx=True)
    if await r.get(_owner_key(code)) != user_id:
        return False
    await r.setex(_pairing_key(code), PAIRING_TTL, "1")
    return True


async def owned_address(code: str, channel: str, user_id: str) -> str | None:
    """The address bound to `code` on `channel`, but only for the code's owner."""
    r = await get_redis()
    if await r.get(_owner_key(code)) != user_id:
        return None
    return await r.get(_bind_key(code, channel))


async def first_delivery(msg_id: str | None) -> bool:
    """False if this provider message id was already processed (webhook retries)."""
    if not msg_id:
        return True
    r = await get_redis()
    return bool(await r.set(f"remote:seen:{msg_id}", "1", nx=True, ex=SEEN_TTL))


async def route_inbound(
    channel: Channel,
    address: str,
    text: str,
    reply: Reply,
    consent: Consent | None = None,
) -> bool:
    """
    Handle an inbound message if it is remote-control business: a code (pairing),
    or anything from an address that is bound to one. Returns False otherwise, and
    the adapter falls back to its legacy behavior.
    """
    r = await get_redis()

    code = normalize_code(text)
    if code:
        bind_key = _bind_key(code, channel)
        bound = await r.get(bind_key)
        if bound is None and await r.exists(_pairing_key(code)):
            # SETNX: two phones racing for the same code, exactly one wins.
            await r.set(bind_key, address, nx=True)
            bound = await r.get(bind_key)

        if bound == address:
            await r.set(_addr_key(channel, address), code)
            if consent:
                await consent(code)
            logger.info(f"Remote: {channel} {address} connected")
            await reply(CONNECTED)
        elif bound is not None:
            # Whitelist the sender, but never let them take over the code's key.
            if consent:
                await consent(None)
            logger.warning(f"Remote: {channel} {address} sent a code bound to another address")
            await reply(LINKED_ELSEWHERE)
        else:
            if consent:
                await consent(code)
            await reply(NOT_PAIRING)
        return True

    code = await r.get(_addr_key(channel, address))
    if not code:
        return False

    # Any inbound message is renewed consent (and reopens WhatsApp's 24h window).
    if consent:
        await consent(code)

    if not await r.exists(_alive_key(code)):
        await reply(NO_SESSION[channel])
        return True

    if not text.strip():
        await reply(TEXT_ONLY)
        return True

    item = json.dumps({"channel": channel, "text": text[:MAX_TEXT], "ts": time.time()})
    inbox = _inbox_key(code)
    await r.rpush(inbox, item)
    await r.expire(inbox, INBOX_TTL)
    return True


async def _require_owner(code: str, user_id: str) -> str:
    normalized = normalize_code(code)
    if not normalized:
        raise HTTPException(status_code=400, detail="Not a valid whitelist code.")
    r = await get_redis()
    if await r.get(_owner_key(normalized)) != user_id:
        raise HTTPException(status_code=403, detail="This code isn't linked to your account.")
    return normalized


@remote_router.get("/remote/inbox", tags=["Remote"])
async def remote_inbox(code: str, current_user: AuthUser):
    """
    Long-poll for messages sent from the user's bound phone/chat. Every call also
    marks the session as active, which is what lets the webhooks tell "queue it"
    apart from "no Observer session is open".
    """
    code = await _require_owner(code, current_user.id)
    r = await get_redis()
    await r.setex(_alive_key(code), ALIVE_TTL, "1")

    # RPUSH + BLPOP = FIFO, and each message goes to exactly one polling tab.
    # Blocks in short slices rather than one long BLPOP: the shared client may carry a
    # socket read timeout (5s in prod), and a blocking call longer than it fails.
    deadline = time.monotonic() + INBOX_WAIT
    popped = None
    while popped is None and time.monotonic() < deadline:
        popped = await r.blpop([_inbox_key(code)], timeout=BLPOP_SLICE)
    if not popped:
        return {"messages": []}
    raw = [popped[1]] + (await r.lpop(_inbox_key(code), 20) or [])

    now = time.time()
    messages = []
    for entry in raw:
        item = json.loads(entry)
        if now - item["ts"] <= INBOX_MAX_AGE:
            messages.append({"channel": item["channel"], "text": item["text"]})
    return {"messages": messages}


@remote_router.get("/remote/status", tags=["Remote"])
async def remote_status(code: str, current_user: AuthUser):
    """
    Which channels this code is linked to, for the settings card. Answers the question the
    whitelist check can't: whitelisted means "we may message this number", linked means
    "this phone can talk to my Observer session".
    """
    code = await _require_owner(code, current_user.id)
    r = await get_redis()
    linked = {channel: bool(await r.get(_bind_key(code, channel))) for channel in ("whatsapp", "telegram")}
    return {"code": code, "linked": linked}


class RemoteReplyRequest(BaseModel):
    code: str = Field(..., description="The whitelist code the message arrived on.")
    channel: Channel
    text: str = Field(..., min_length=1, max_length=MAX_TEXT)


@remote_router.post("/remote/reply", tags=["Remote"])
async def remote_reply(request_data: RemoteReplyRequest, current_user: AuthUser):
    """Send the MCP's answer back to the bound phone/chat. Charges that channel's quota."""
    # Imported here: both modules import this one for their webhooks.
    from messaging import assert_content_allowed, send_whatsapp_text
    from tools_router import send_telegram_text
    from quota_manager import try_consume_for

    code = await _require_owner(request_data.code, current_user.id)
    r = await get_redis()
    address = await r.get(_bind_key(code, request_data.channel))
    if not address:
        raise HTTPException(status_code=404, detail=f"No {request_data.channel} linked to this code.")

    assert_content_allowed(request_data.text)

    allowed, _usage_count, _reason = await try_consume_for(current_user, request_data.channel)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "message": f"Daily {request_data.channel} quota has been exceeded.",
                "quota_type": request_data.channel,
            },
        )

    if request_data.channel == "whatsapp":
        send_whatsapp_text(address, request_data.text[:1600])
    else:
        await send_telegram_text(address, request_data.text[:4096])
    return {"success": True}
