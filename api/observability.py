# observability.py
"""
Observability for the Observer API.

Three concerns live here, deliberately kept apart:

  1. Ops telemetry     - per-model, per-hour success counters. No PII.
                         Feeds the public /status endpoint.
  2. Product analytics - anonymised prompt/response records on a short TTL.
                         Feeds the admin-only /admin/metrics endpoint that the
                         nightly digest routine reads.
  3. Diagnostics       - plain stdlib logging to stdout. NOT handled here; see
                         logging_config.setup_logging().

Everything is stored in Redis so the numbers stay correct across all uvicorn
workers. Previously this state lived in module globals, which meant each of the
4 workers held its own partial view: /status returned whichever worker answered
and /admin/metrics returned roughly a quarter of traffic.

Nothing in this module may raise into the request path. Every write is
best-effort; failures are logged and swallowed.

All time keys are UTC. The digest routine is expected to run shortly after
00:00 UTC and ask for the previous day, e.g.

    GET /admin/metrics?date=2026-08-10     # run at 2026-08-11T00:15Z
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone

from redis_client import get_redis

logger = logging.getLogger("observability")

# --- Tunables ---------------------------------------------------------------

# One hour of slack past the 24h window the status page renders.
STATS_TTL_SECONDS = 25 * 3600

# 32h: the digest routine runs at ~00:15 UTC and reads the previous day, so the
# key survives ~32h past its last write. That leaves roughly a day and a half of
# retry slack if a run fails.
DIGEST_TTL_SECONDS = int(os.getenv("OBS_DIGEST_TTL_HOURS", "32")) * 3600

# Hard ceiling per day. LTRIM keeps the newest, so overflow drops the *morning* -
# we emit a once-per-day warning when that starts happening.
DIGEST_MAX_ENTRIES = int(os.getenv("OBS_DIGEST_MAX_ENTRIES", "20000"))

PROMPT_MAX_CHARS = 500
RESPONSE_MAX_CHARS = 500

STATUS_WINDOW_HOURS = 24
STATUS_CACHE_SECONDS = 10

# Agents can be configured to skip the LLM call entirely; never show on /status.
SKIP_MODEL = "Skip Model Call"

# Model names use dots and dashes, never pipes.
_FIELD_SEP = "|"

# How often a given failure site may log a full traceback. Redis being down
# would otherwise emit one stack trace per request, per worker, and blow through
# the container's log retention in minutes.
_ERROR_LOG_INTERVAL_SECONDS = 60
_last_error_log: dict[str, float] = {}


def _log_failure(site: str, msg: str, *args) -> None:
    """Log an exception with a traceback at most once per minute per site."""
    now = time.monotonic()
    last = _last_error_log.get(site, 0.0)
    if now - last >= _ERROR_LOG_INTERVAL_SECONDS:
        _last_error_log[site] = now
        logger.exception(msg, *args)
    else:
        logger.debug(msg, *args)


# --- Keys and identifiers ---------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hour_bucket(dt: datetime) -> datetime:
    return dt.replace(minute=0, second=0, microsecond=0)


def _stats_key(dt: datetime) -> str:
    return f"obs:stats:{_hour_bucket(dt).strftime('%Y-%m-%dT%H')}"


def _digest_key(day: str) -> str:
    return f"obs:digest:{day}"


def hash_user(user_id: str | None) -> str | None:
    """
    Stable handle for a user, so raw Auth0 ids stay out of the analytics store.

    Deliberately unsalted: the digest's real sensitivity is the prompt text
    (screen content), not this column, so a salt would buy little while adding a
    secret that must survive forever - lose or rotate it and every saved digest
    stops lining up with new ones. Unsalted means the mapping is reproducible
    from any deployment with no stored state.

    The lookup only runs forwards. Given a user_id from an abuse alert you can
    compute the hash and find that user's digest entries; the digest alone does
    not tell you who someone is.
    """
    if not user_id:
        return None
    return hashlib.sha256(user_id.encode()).hexdigest()[:12]


# --- Request-shape helpers --------------------------------------------------

def extract_prompt(messages: list | None) -> tuple[str, int]:
    """
    Text and image count of the final message. Used for monitoring agents, whose
    prompts are standalone rather than conversational.
    """
    if not messages:
        return "", 0

    content = messages[-1].get("content")
    if isinstance(content, str):
        return content, 0

    text_parts: list[str] = []
    image_count = 0
    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text":
                text_parts.append(item.get("text", ""))
            elif item.get("type") == "image_url":
                image_count += 1

    text = " ".join(text_parts)
    if image_count > 0:
        text += f" ({image_count} images)"
    return text, image_count


def extract_latest_user_message(messages: list | None) -> str:
    """The most recent user turn, for Agent Creator conversations."""
    for msg in reversed(messages or []):
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return " ".join(
                item.get("text", "")
                for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            )
        return ""
    return ""


# --- Write path -------------------------------------------------------------

async def record_request(
    *,
    user_id: str | None,
    model: str | None,
    handler: str | None,
    status_code: int,
    prompt_text: str = "",
    response_text: str = "",
    image_count: int = 0,
    ttft_ms: float | None = None,
    chunks_per_second: float | None = None,
    tier: str | None = None,
    service: str | None = None,
    truncate: bool = True,
) -> None:
    """
    Record one request into both the ops counters and the product digest.

    Six commands in a single pipeline, so one round trip to a Redis on the same
    Docker network. Called after the response has already been delivered, so it
    is off the user-visible latency path.

    `truncate=False` keeps the full prompt and response - used for Agent Creator
    conversations, where the digest wants the whole exchange.
    """
    now = _utcnow()
    day = now.strftime("%Y-%m-%d")

    if truncate:
        prompt = prompt_text[-PROMPT_MAX_CHARS:] if prompt_text else ""
        response = response_text[:RESPONSE_MAX_CHARS] if response_text else ""
    else:
        prompt = prompt_text or ""
        response = response_text or ""

    entry = {
        "ts": now.isoformat(),
        "user": hash_user(user_id),
        "model": model,
        "handler": handler,
        "status": status_code,
        "prompt": prompt,
        "response": response,
        "images": image_count,
        "ttft_ms": ttft_ms,
        "cps": chunks_per_second,
        "tier": tier,
        "service": service,
    }

    digest_key = _digest_key(day)

    try:
        r = await get_redis()
        pipe = r.pipeline(transaction=False)

        # 1. Ops telemetry: one hash per hour, fields "{model}|total" and
        #    "{model}|success". Keying by hour rather than by model means
        #    /status reads 24 keys no matter how many models exist.
        if model and model != SKIP_MODEL:
            stats_key = _stats_key(now)
            pipe.hincrby(stats_key, f"{model}{_FIELD_SEP}total", 1)
            if status_code < 400:
                pipe.hincrby(stats_key, f"{model}{_FIELD_SEP}success", 1)
            pipe.expire(stats_key, STATS_TTL_SECONDS)

        # 2. Product analytics: one list per UTC day, newest first.
        pipe.lpush(digest_key, json.dumps(entry, ensure_ascii=False))
        pipe.ltrim(digest_key, 0, DIGEST_MAX_ENTRIES - 1)
        pipe.expire(digest_key, DIGEST_TTL_SECONDS)

        results = await pipe.execute()
    except Exception:
        _log_failure(
            "record_request",
            "Failed to record request telemetry (model=%s, status=%s)",
            model, status_code,
        )
        return

    # LPUSH is always third from the end and returns the post-push length.
    try:
        new_length = results[-3]
    except IndexError:
        return

    if isinstance(new_length, int) and new_length > DIGEST_MAX_ENTRIES:
        try:
            # SET NX so this warns once per day rather than on every request.
            first = await r.set(
                f"obs:digestfull:{day}", "1", nx=True, ex=DIGEST_TTL_SECONDS
            )
            if first:
                logger.warning(
                    "Digest %s hit its %d entry cap; the oldest entries of the "
                    "day are now being dropped. Raise OBS_DIGEST_MAX_ENTRIES.",
                    digest_key, DIGEST_MAX_ENTRIES,
                )
        except Exception:
            pass


# --- Read path: ops telemetry ----------------------------------------------

_status_cache: dict = {"at": 0.0, "payload": None}


async def get_hourly_status(known_models: list | set | None = None) -> dict:
    """
    Model availability over the last 24h, for the public /status endpoint.

    Reads 24 hour-hashes in one pipelined round trip. `known_models` seeds the
    model list so a model with no traffic still appears with null rates instead
    of vanishing from the status page.

    Timestamps are emitted as naive UTC isoformat, matching the previous
    on-the-wire format exactly.
    """
    now_mono = time.monotonic()
    cached = _status_cache["payload"]
    if cached is not None and now_mono - _status_cache["at"] < STATUS_CACHE_SECONDS:
        return cached

    now = _utcnow()
    current_hour = _hour_bucket(now)
    hours = [
        current_hour - timedelta(hours=i)
        for i in range(STATUS_WINDOW_HOURS - 1, -1, -1)
    ]

    degraded = False
    try:
        r = await get_redis()
        pipe = r.pipeline(transaction=False)
        for hour in hours:
            pipe.hgetall(_stats_key(hour))
        buckets = await pipe.execute()
    except Exception:
        _log_failure("get_hourly_status", "Failed to read hourly status from Redis")
        if cached is not None:
            return cached
        # No data and nothing cached: fall through with empty buckets so the
        # page still lists every known model with null rates rather than going
        # blank. Not cached, so it recovers as soon as Redis does.
        buckets = [{} for _ in hours]
        degraded = True

    models = {m for m in (known_models or ()) if m and m != SKIP_MODEL}
    for bucket in buckets:
        for field in bucket:
            name = field.rsplit(_FIELD_SEP, 1)[0]
            if name != SKIP_MODEL:
                models.add(name)

    models_status = []
    for name in sorted(models):
        hourly_stats = []
        total_success = 0
        total_requests = 0

        for hour, bucket in zip(hours, buckets):
            total = int(bucket.get(f"{name}{_FIELD_SEP}total", 0) or 0)
            success = int(bucket.get(f"{name}{_FIELD_SEP}success", 0) or 0)

            if total > 0:
                success_rate = round((success / total) * 100, 1)
                total_requests += total
                total_success += success
            else:
                success_rate = None

            hourly_stats.append({
                "hour": hour.replace(tzinfo=None).isoformat(),
                "success_rate": success_rate,
            })

        # Real counts, so this is an honest weighted average. The previous
        # implementation discarded counts when freezing an hour and guessed
        # "assume 10 requests per hour" to reconstitute this number.
        overall = (
            round((total_success / total_requests) * 100, 1)
            if total_requests > 0 else None
        )

        models_status.append({
            "name": name,
            "overall_success_rate": overall,
            "hourly_stats": hourly_stats,
        })

    payload = {
        "checked_at": now.replace(tzinfo=None).isoformat(),
        "window_hours": STATUS_WINDOW_HOURS,
        "models": models_status,
    }
    if not degraded:
        _status_cache["at"] = now_mono
        _status_cache["payload"] = payload
    return payload


# --- Read path: product analytics ------------------------------------------

async def get_digest(day: str | None = None, limit: int | None = None) -> list[dict]:
    """
    All digest entries for a UTC day, newest first. Defaults to today; the
    nightly routine should pass yesterday.
    """
    day = day or _utcnow().strftime("%Y-%m-%d")
    stop = (limit - 1) if limit and limit > 0 else -1

    try:
        r = await get_redis()
        raw = await r.lrange(_digest_key(day), 0, stop)
    except Exception:
        _log_failure("get_digest", "Failed to read digest for %s", day)
        return []

    entries = []
    for item in raw:
        try:
            entries.append(json.loads(item))
        except json.JSONDecodeError:
            continue
    return entries
