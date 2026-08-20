import datetime
import logging
import os
import asyncio
import httpx
from typing import Dict

from redis_client import get_redis
from usage_log import log_usage

logger = logging.getLogger('quota_manager')

# --- Configuration ---
QUOTA_LIMITS = {
    "monitor": 60,
    "agent_creator": 45,   # 3 agent sessions × ~15 msgs
    "sms": 5,
    "whatsapp": 5,
    "email": 2880,
    "pushover": 5,
    "discord": 5,
    "telegram": 2880,
    "slack": 5,
    "teams": 5,
    "voice_call": 5,
}

# Plus user limits (unlimited alerts, limited chat)
PLUS_QUOTA_LIMITS = {
    "monitor": 60,
    "agent_creator": 1000,  # plus legacy tier
    "sms": 100,
    "whatsapp": 100,
    "email": 2880,
    "pushover": 2880,
    "discord": 2880,
    "telegram": 2880,
    "slack": 100,
    "teams": 100,
    "voice_call": 100,
}

# Pro user limits (anti-abuse measure)
PRO_QUOTA_LIMITS = {
    "monitor": 480,
    "agent_creator": 1000,
    "sms": 100,
    "whatsapp": 100,
    "email": 2880,
    "pushover": 2880,
    "discord": 2880,
    "telegram": 2880,
    "slack": 2880,
    "teams": 2880,
    "voice_call": 100,
}

# Max user limits (highest tier)
MAX_QUOTA_LIMITS = {
    "monitor": 2880, # 30s interval for 24h = 2/minx60x24=2880
    "agent_creator": 1000,
    "sms": 100,
    "whatsapp": 100,
    "email": 2880,
    "pushover": 2880,
    "discord": 2880,
    "telegram": 2880,
    "slack": 2880,
    "teams": 2880,
    "voice_call": 100,
}

# Rate limiting configuration (requests per minute)
RATE_LIMIT_PER_MINUTE = 30

# Audio second limits per provider per tier
CHIRP_SECOND_LIMITS = {
    "free":   2_700,   # 45 min
    "plus":   2_700,   # 45 min
    "pro":   10_800,   # 3 hours
    "max":   10_800,   # 3 hours
}
GEMINI_SECOND_LIMITS = {
    "free":   2_700,   # 45 min
    "plus":   2_700,   # 45 min
    "pro":   54_000,   # 15 hours
    "max":   54_000,   # 15 hours
}

def _seconds_until_midnight() -> int:
    """
    Seconds until the next UTC midnight.

    Explicitly UTC so daily quota resets do not depend on the container's
    ambient timezone - they line up with the UTC day keys used by
    observability, and setting TZ on the container cannot silently shift
    every user's reset.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    midnight = datetime.datetime.combine(
        now.date() + datetime.timedelta(days=1),
        datetime.time.min,
        tzinfo=datetime.timezone.utc,
    )
    return int((midnight - now).total_seconds())

async def _send_abuse_alert_async(user_id: str, service: str):
    try:
        telegram_bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
        if not telegram_bot_token:
            logger.warning("Cannot send abuse alert: TELEGRAM_BOT_TOKEN not configured")
            return

        admin_chat_id = os.getenv("ADMIN_TELEGRAM_CHAT_ID")
        message = f"⚠️ Rate limit exceeded!\n\nUser ID: {user_id}\nService: {service}\nTime: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        url = f"https://api.telegram.org/bot{telegram_bot_token}/sendMessage"

        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(url, json={"chat_id": admin_chat_id, "text": message})
        logger.info(f"Sent abuse alert for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to send abuse alert: {e}")

# Rate limit and quota are checked and consumed in a single Lua script so the
# two cannot interleave. The previous check_usage()/increment_usage() pair read
# the counter, decided, then incremented in a separate round trip: with four
# uvicorn workers two concurrent requests could both read 59 against a limit of
# 60, both pass, and both increment to 61. It also collapses six sequential
# round trips into one, which matters once Redis is not on localhost.
_CONSUME_LUA = """
local rl = tonumber(redis.call('GET', KEYS[1]) or '0')
if rl >= tonumber(ARGV[1]) then return {-1, rl} end

local used = tonumber(redis.call('GET', KEYS[2]) or '0')
if used >= tonumber(ARGV[2]) then return {-2, used} end

local nrl = redis.call('INCR', KEYS[1])
if nrl == 1 then redis.call('EXPIRE', KEYS[1], 60) end

local nq = redis.call('INCR', KEYS[2])
if nq == 1 then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3])) end

return {0, nq}
"""

_consume_script = None


def limit_for(service: str, is_pro: bool = False, is_max: bool = False, is_plus: bool = False) -> int:
    """The daily limit that applies to this user's tier for this service."""
    if is_max:
        return MAX_QUOTA_LIMITS[service]
    if is_pro:
        return PRO_QUOTA_LIMITS[service]
    if is_plus:
        return PLUS_QUOTA_LIMITS[service]
    return QUOTA_LIMITS[service]


async def try_consume(
    user_id: str, service: str,
    is_pro: bool = False, is_max: bool = False, is_plus: bool = False,
) -> tuple[bool, int, str | None]:
    """
    Atomically check the rate limit and daily quota, and consume one unit if
    both allow it.

    Returns (allowed, count, reason). On success reason is None and count is
    the new daily total. On refusal reason is "rate_limit" or "quota" and
    count is the value that blocked it. Nothing is consumed when refused, so
    a rejected request does not eat rate-limit budget - same as the behaviour
    of the check/increment pair this replaces.
    """
    global _consume_script
    r = await get_redis()
    if _consume_script is None:
        # register_script sends EVALSHA and falls back to EVAL on NOSCRIPT, so
        # this stays one round trip and re-loads itself after a Redis restart.
        _consume_script = r.register_script(_CONSUME_LUA)

    limit = limit_for(service, is_pro=is_pro, is_max=is_max, is_plus=is_plus)

    code, count = await _consume_script(
        keys=[f"ratelimit:{user_id}", f"quota:{user_id}:{service}"],
        args=[RATE_LIMIT_PER_MINUTE, limit, _seconds_until_midnight()],
    )
    code, count = int(code), int(count)

    if code == -1:
        asyncio.create_task(_send_abuse_alert_async(user_id, service))
        return False, count, "rate_limit"
    if code == -2:
        return False, count, "quota"

    # Every service routes its consumption through here, so this one call
    # covers monitor, agent_creator and all eight messaging channels. It is
    # synchronous and non-blocking by design - see usage_log.
    log_usage(user_id, service)
    return True, count, None


async def get_usage_for_service(user_id: str, service: str) -> int:
    r = await get_redis()
    val = await r.get(f"quota:{user_id}:{service}")
    return int(val) if val else 0

async def get_all_usage_data() -> dict:
    r = await get_redis()
    usage_data: Dict[str, Dict[str, int]] = {}
    chirp_data: Dict[str, float] = {}
    gemini_data: Dict[str, float] = {}

    async for key in r.scan_iter("quota:*"):
        parts = key.split(":", 2)
        if len(parts) == 3:
            _, user_id, service = parts
            val = await r.get(key)
            if val:
                usage_data.setdefault(user_id, {})[service] = int(val)

    async for key in r.scan_iter("audio:*"):
        parts = key.split(":", 2)
        if len(parts) == 3:
            _, user_id, provider = parts
            val = await r.get(key)
            if val:
                if provider == "chirp3":
                    chirp_data[user_id] = float(val)
                else:
                    gemini_data[user_id] = float(val)

    from auth0_manager import get_email_by_id

    all_user_ids = set(usage_data) | set(chirp_data) | set(gemini_data)
    enriched_data = {}
    for user_id in all_user_ids:
        try:
            email = get_email_by_id(user_id)
            key = email if email else user_id
        except Exception as e:
            logger.error(f"Error fetching email for {user_id}: {e}")
            key = user_id

        entry = dict(usage_data.get(user_id, {}))
        chirp_secs = chirp_data.get(user_id, 0.0)
        gemini_secs = gemini_data.get(user_id, 0.0)
        if chirp_secs:
            entry["chirp_seconds"] = round(chirp_secs)
        if gemini_secs:
            entry["gemini_seconds"] = round(gemini_secs)
        enriched_data[key] = entry

    return enriched_data

async def check_provider_seconds_quota(
    user_id: str, audio_seconds: float, provider: str,
    is_pro: bool = False, is_max: bool = False, is_plus: bool = False,
) -> bool:
    tier = "max" if is_max else "pro" if is_pro else "plus" if is_plus else "free"
    limits = CHIRP_SECOND_LIMITS if provider == "chirp3" else GEMINI_SECOND_LIMITS
    limit = limits[tier]

    r = await get_redis()
    val = await r.get(f"audio:{user_id}:{provider}")
    current = float(val) if val else 0.0
    return current + audio_seconds > limit

async def increment_provider_seconds(user_id: str, audio_seconds: float, provider: str) -> float:
    r = await get_redis()
    key = f"audio:{user_id}:{provider}"
    new_total = await r.incrbyfloat(key, audio_seconds)
    # Only set TTL on first write
    if new_total == audio_seconds:
        await r.expire(key, _seconds_until_midnight())
    return new_total
