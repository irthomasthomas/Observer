import datetime
import logging
import os
import asyncio
import httpx
import redis.asyncio as aioredis
from typing import Dict

logger = logging.getLogger('quota_manager')

# --- Configuration ---
QUOTA_LIMITS = {
    "monitor": 60,
    "agent_creator": 50,
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
    "agent_creator": 1000,
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
    "agent_creator": 2880,
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
RATE_LIMIT_PER_MINUTE = 20

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

# --- Redis client ---
_redis: aioredis.Redis | None = None

async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        url = os.getenv("REDIS_URL", "redis://localhost:6379")
        _redis = aioredis.from_url(url, decode_responses=True)
    return _redis

def _seconds_until_midnight() -> int:
    now = datetime.datetime.now()
    midnight = datetime.datetime.combine(
        now.date() + datetime.timedelta(days=1), datetime.time.min
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

async def increment_usage(user_id: str, service: str) -> int:
    r = await get_redis()
    ttl = _seconds_until_midnight()

    # Increment rate limit counter (fixed 60s window)
    rl_key = f"ratelimit:{user_id}"
    rl_count = await r.incr(rl_key)
    if rl_count == 1:
        await r.expire(rl_key, 60)

    # Increment daily quota counter
    quota_key = f"quota:{user_id}:{service}"
    new_count = await r.incr(quota_key)
    if new_count == 1:
        await r.expire(quota_key, ttl)

    return new_count

async def get_usage_for_service(user_id: str, service: str) -> int:
    r = await get_redis()
    val = await r.get(f"quota:{user_id}:{service}")
    return int(val) if val else 0

async def is_rate_limited(user_id: str) -> bool:
    r = await get_redis()
    val = await r.get(f"ratelimit:{user_id}")
    return int(val) >= RATE_LIMIT_PER_MINUTE if val else False

async def check_usage(
    user_id: str, service: str,
    is_pro: bool = False, is_max: bool = False, is_plus: bool = False
) -> bool:
    if await is_rate_limited(user_id):
        asyncio.create_task(_send_abuse_alert_async(user_id, service))
        return True

    r = await get_redis()
    val = await r.get(f"quota:{user_id}:{service}")
    current_usage = int(val) if val else 0

    if is_max:
        limit = MAX_QUOTA_LIMITS[service]
    elif is_pro:
        limit = PRO_QUOTA_LIMITS[service]
    elif is_plus:
        limit = PLUS_QUOTA_LIMITS[service]
    else:
        limit = QUOTA_LIMITS[service]

    return current_usage >= limit

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
