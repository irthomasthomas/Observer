# usage_log.py
"""
Best-effort usage event log.

This is the *reporting* half of usage tracking. Redis owns enforcement - the
current window's counters, read on the hot path by known user id - and this
owns history.

Nothing here is allowed to affect a request. `log_usage` never awaits, never
raises and never blocks: it drops a row onto a bounded queue and returns. A
single background task drains the queue in batches. If a sink is down, slow, or
absent entirely, the queue fills, rows are dropped, and the API serves traffic
exactly as it does today. Losing a slice of analytics is an acceptable outcome;
putting a second datastore on the critical path is not.

Why a queue and not `asyncio.create_task(write(...))`: create_task is passive
only when the sink is *down*, where the task raises immediately and the
exception is swallowed. When the sink is merely *slow* - the case worth
designing for - one task per request accumulates at request rate, each parked
on an exhausted connection pool, and the process walks into its memory limit
while holding open sockets. A bounded queue degrades by dropping rows, which is
what "best effort" has to mean under load.

Two sinks, written from the same batch:

  * R2 gets gzipped NDJSON, one object per flush, under a key namespaced by
    date and host. This is the durable archive, read offline (DuckDB over the
    bucket), never by the API. Because each box writes only its own keys there
    is no coordination of any kind between boxes.

  * Redis gets the batch rolled up into per-user, per-service, per-day
    counters, and that is what `get_usage_history` serves. The dashboard cannot
    read the archive directly: thirty days of history is on the order of a
    hundred thousand objects, which is a background job, not a request.

The rollup happens here, in the writer, rather than in `log_usage`, and it goes
out as a single Lua script rather than a pipeline. That distinction is the
whole cost of this feature: managed Redis bills per command, and at any real
traffic mix a minute's batch is spread across almost as many distinct users as
it has events, so per-event HINCRBY/EXPIRE pipelining would roughly triple the
command volume enforcement already spends. One EVALSHA per flush is one
command, whatever it contains. quota_manager makes the same trade for the same
reason.

Both sinks fail independently. A batch that cannot reach R2 is still counted
into Redis, and vice versa.
"""

import asyncio
import gzip
import json
import logging
import os
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import r2_store
from redis_client import get_redis

logger = logging.getLogger('usage_log')

# Rows buffered before we start dropping. At the batch sizes below this is a
# few seconds of very heavy traffic, which is the right amount of slack: enough
# to ride out a network stall, not enough to hide an outage or accumulate
# meaningful memory. Sized to sit comfortably above BATCH_SIZE so a full batch
# in flight still leaves room for the next one to accumulate.
QUEUE_MAXSIZE = int(os.getenv("USAGE_LOG_QUEUE_MAXSIZE", "50000"))

# Every flush is one billed R2 write, so the interval is a cost decision, not
# just a latency one: at a couple of seconds a handful of boxes generate
# millions of PUTs a month and the ops bill dwarfs the storage bill. At a
# minute it is cents. BATCH_SIZE is set above the number of events a minute of
# heavy traffic produces, so the interval - not the size - is what normally
# triggers the flush, and it is the size that caps memory when it does not.
BATCH_SIZE = int(os.getenv("USAGE_LOG_BATCH_SIZE", "5000"))
BATCH_INTERVAL = float(os.getenv("USAGE_LOG_BATCH_INTERVAL", "60.0"))

# How long the rolled-up history counters live. Past this the archive in R2 is
# the only copy, which is the intended split: Redis serves the dashboard's
# recent window, R2 keeps everything.
ROLLUP_TTL_DAYS = int(os.getenv("USAGE_LOG_ROLLUP_TTL_DAYS", "400"))

# Distinct (user, month) hashes per script invocation. The rollup is not on the
# request path, but it runs against the same Redis that enforcement reads on
# every request, and Redis executes a script to completion on its single
# thread. An unbounded script is therefore a latency spike on the hot path,
# proportional to whatever the batch happened to contain. Chunking bounds that
# to a predictable few hundred operations, and bounds the request size with it,
# for a handful of commands per flush instead of one.
ROLLUP_CHUNK = int(os.getenv("USAGE_LOG_ROLLUP_CHUNK", "200"))

# Identifies which box wrote the row, and namespaces that box's archive keys so
# concurrent writers never collide. With the API stateless and running from
# several boxes at once, a period without this reads as one incomplete series
# instead of N partial ones.
HOST_ID = os.getenv("USAGE_LOG_HOST", os.uname().nodename)

# Disambiguates writers that share a HOST_ID. The API runs several uvicorn
# workers per box, each with its own queue, writer task and _seq, so host plus
# timestamp plus sequence is *not* unique: four workers flushing in the same
# second would all produce key ...-000001 and three of those PUTs would
# silently overwrite the others. Re-rolled per process, which also covers a
# restart resetting _seq back to zero.
RUN_TOKEN = secrets.token_hex(3)

_queue: asyncio.Queue | None = None
_writer_task: asyncio.Task | None = None
_seq = 0
_dropped = 0
_dropped_logged_at = 0.0

# Drops are reported at most this often. A sustained overload drops at request
# rate, so a per-N-rows warning would put thousands of lines in the log for one
# incident and push out whatever else was happening.
DROP_LOG_INTERVAL = 60.0


def enabled() -> bool:
    return _queue is not None


async def start() -> None:
    """
    Called from the FastAPI lifespan startup hook.

    Failure to configure is logged and swallowed - the API must start whether
    or not the analytics sinks are reachable.
    """
    global _queue, _writer_task

    if not os.environ.get("R2_ACCOUNT_ID"):
        logger.info("R2 not configured; usage logging disabled")
        return

    _queue = asyncio.Queue(maxsize=QUEUE_MAXSIZE)
    _writer_task = asyncio.create_task(_writer_loop())
    logger.info(
        f"Usage logging started (host={HOST_ID}, "
        f"batch={BATCH_SIZE}/{BATCH_INTERVAL}s)"
    )


async def stop() -> None:
    """Called from the FastAPI lifespan shutdown hook. Flushes what it can."""
    global _queue, _writer_task

    if _writer_task is not None:
        _writer_task.cancel()
        try:
            await _writer_task
        except asyncio.CancelledError:
            pass
        _writer_task = None

    # Whatever is still queued at shutdown gets one attempt. A box being
    # restarted is the common case and it is cheap to not lose that minute.
    if _queue is not None:
        tail = []
        while not _queue.empty():
            tail.append(_queue.get_nowait())
        if tail:
            try:
                await _flush(tail)
            except Exception as e:
                logger.error(f"Final usage flush failed, dropped {len(tail)} rows: {e}")

    _queue = None
    if _dropped:
        logger.warning(f"Usage logging dropped {_dropped} rows this run")


def log_usage(user_id: str, service: str) -> None:
    """
    Record one consumption. Synchronous, non-blocking, never raises.

    Deliberately not a coroutine: callers cannot accidentally await it and pick
    up a sink's latency on the request path.
    """
    global _dropped, _dropped_logged_at
    if _queue is None:
        return
    try:
        _queue.put_nowait(
            (datetime.now(timezone.utc), user_id, service, HOST_ID)
        )
    except asyncio.QueueFull:
        # The passive failure. Counted rather than silent so a persistently
        # overloaded writer is visible in the logs instead of showing up as
        # analytics that are quietly, unaccountably low.
        _dropped += 1
        now = time.monotonic()
        if now - _dropped_logged_at >= DROP_LOG_INTERVAL:
            _dropped_logged_at = now
            logger.warning(f"Usage log queue full; dropped {_dropped} rows so far")


# --- sinks -------------------------------------------------------------------

def _rollup_key(user_id: str, month: str) -> str:
    """One hash per user per month, so a year of history is a few reads."""
    return f"usage:hist:{user_id}:{month}"


# HINCRBY every (user, service, day) in the batch, then refresh the TTL on each
# hash touched. Refreshed on every flush rather than set once on create: inside
# a script it is free, and it means a key can never be left without a TTL
# because the write that created it lost its EXPIRE.
_ROLLUP_LUA = """
local ttl = tonumber(ARGV[1])
for i = 2, #ARGV, 3 do
  redis.call('HINCRBY', KEYS[tonumber(ARGV[i])], ARGV[i + 1], tonumber(ARGV[i + 2]))
end
for i = 1, #KEYS do
  redis.call('EXPIRE', KEYS[i], ttl)
end
return #KEYS
"""

_rollup_script = None


def _rollup_field(service: str, day: str) -> str:
    # Day last and separator-delimited from the right, so a service name
    # containing the separator still parses.
    return f"{service}|{day}"


def _encode_batch(batch: list[tuple]) -> bytes:
    lines = [
        json.dumps(
            {"ts": ts.isoformat(), "user_id": user_id, "service": service, "host": host},
            ensure_ascii=False,
        )
        for ts, user_id, service, host in batch
    ]
    return "\n".join(lines).encode("utf-8") + b"\n"


async def _write_archive(batch: list[tuple]) -> None:
    global _seq
    _seq += 1
    # Keyed by flush time, not by the events' own timestamps: a batch spans up
    # to BATCH_INTERVAL and can straddle midnight, so an object dated today may
    # hold up to a minute of yesterday. Every row carries its own `ts`, so a
    # reader filtering on that is exact; a reader filtering on the key prefix
    # should widen the range by a day at each end.
    now = datetime.now(timezone.utc)
    body = await asyncio.to_thread(
        lambda: gzip.compress(_encode_batch(batch), compresslevel=6)
    )
    key = r2_store.usage_key(
        now.strftime("%Y-%m-%d"), HOST_ID, now.strftime("%H%M%S"), RUN_TOKEN, _seq
    )
    await r2_store.put_bytes(
        key, body, content_type="application/x-ndjson", content_encoding="gzip"
    )


async def _write_rollup(batch: list[tuple]) -> None:
    counts: dict[tuple[str, str, str, str], int] = defaultdict(int)
    for ts, user_id, service, _host in batch:
        counts[(user_id, ts.strftime("%Y-%m"), service, ts.strftime("%d"))] += 1

    # Group the batch by hash first, so chunking splits between hashes rather
    # than through the middle of one and every EXPIRE lands with its HINCRBYs.
    by_key: dict[str, list] = defaultdict(list)
    for (user_id, month, service, day), n in counts.items():
        by_key[_rollup_key(user_id, month)] += [_rollup_field(service, day), n]

    global _rollup_script
    redis = await get_redis()
    if _rollup_script is None:
        _rollup_script = redis.register_script(_ROLLUP_LUA)

    items = list(by_key.items())
    for start in range(0, len(items), ROLLUP_CHUNK):
        chunk = items[start:start + ROLLUP_CHUNK]
        # Keys are addressed by index from ARGV so each hash is named once,
        # however many of its fields the batch touches.
        keys = [k for k, _ in chunk]
        argv: list = [ROLLUP_TTL_DAYS * 86400]
        for i, (_key, fields) in enumerate(chunk, start=1):
            for j in range(0, len(fields), 2):
                argv += [i, fields[j], fields[j + 1]]
        # Each chunk is independent. A failure part-way through leaves earlier
        # chunks applied, which is the same partial-batch outcome the caller
        # already tolerates - these counters are explicitly approximate, and
        # HINCRBY is not idempotent so retrying would double-count.
        await _rollup_script(keys=keys, args=argv)


async def _flush(batch: list[tuple]) -> None:
    """
    Write one batch to both sinks. Failures are independent and swallowed: a
    batch is never retried, because retrying risks unbounded growth behind a
    sink that is not coming back and these rows are not worth that.
    """
    results = await asyncio.gather(
        _write_archive(batch), _write_rollup(batch), return_exceptions=True
    )
    for name, result in zip(("archive", "rollup"), results):
        if isinstance(result, Exception):
            logger.error(
                f"Usage {name} write failed, dropped {len(batch)} rows: {result}"
            )


async def _writer_loop() -> None:
    """Drain the queue into the sinks in batches until cancelled."""
    assert _queue is not None

    while True:
        try:
            batch = [await _queue.get()]
            # One blocking get above, then take whatever else has piled up
            # without waiting. Under light traffic this writes a single row
            # after the interval; under load it fills whole batches.
            deadline = asyncio.get_running_loop().time() + BATCH_INTERVAL
            while len(batch) < BATCH_SIZE:
                timeout = deadline - asyncio.get_running_loop().time()
                if timeout <= 0:
                    break
                try:
                    batch.append(await asyncio.wait_for(_queue.get(), timeout))
                except asyncio.TimeoutError:
                    break

            await _flush(batch)

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Usage log writer error: {e}")
            await asyncio.sleep(1)


# --- history -----------------------------------------------------------------

def _period_for(day: datetime, bucket: str) -> str:
    if bucket == "day":
        return day.strftime("%Y-%m-%d")
    if bucket == "week":
        return (day - timedelta(days=day.weekday())).strftime("%Y-%m-%d")
    return day.strftime("%Y-%m-01")


async def get_usage_history(
    user_ids: list[str],
    days: int = 30,
    bucket: str = "day",
) -> list[dict]:
    """
    Historical counts per user, per service, per time bucket.

    Approximate by construction - rows dropped under load, or written by a box
    that died before its flush, are simply not here. Suitable for reporting,
    never for anything shown alongside a limit; that number has to come from
    the enforcement counters so it matches what the limiter will actually do.

    Served from the Redis rollups, not the R2 archive. Anything older than
    ROLLUP_TTL_DAYS is in the archive only and will not appear.
    """
    if not enabled() or not user_ids:
        return []
    if bucket not in ("day", "week", "month"):
        raise ValueError(f"invalid bucket: {bucket}")

    today = datetime.now(timezone.utc)
    since = today - timedelta(days=days)

    # The months the window touches. A hash per user per month means the
    # read is a handful of HGETALLs even for a year-long window.
    months, cursor = [], since
    while cursor <= today:
        stamp = cursor.strftime("%Y-%m")
        if stamp not in months:
            months.append(stamp)
        cursor += timedelta(days=1)

    try:
        redis = await get_redis()
        pipe = redis.pipeline(transaction=False)
        pairs = [(u, m) for u in user_ids for m in months]
        for user_id, month in pairs:
            pipe.hgetall(_rollup_key(user_id, month))
        hashes = await pipe.execute()
    except Exception as e:
        logger.error(f"Usage history query failed: {e}")
        return []

    totals: dict[tuple[str, str, str], int] = defaultdict(int)
    for (user_id, month), fields in zip(pairs, hashes):
        for field, count in (fields or {}).items():
            service, _, day = field.rpartition("|")
            if not service:
                continue
            try:
                stamp = datetime.strptime(f"{month}-{day}", "%Y-%m-%d").replace(
                    tzinfo=timezone.utc
                )
            except ValueError:
                continue
            if stamp < since:
                continue
            totals[(_period_for(stamp, bucket), user_id, service)] += int(count)

    return [
        {"period": period, "user_id": user_id, "service": service, "count": count}
        for (period, user_id, service), count in sorted(
            totals.items(), key=lambda kv: kv[0][0], reverse=True
        )
    ]
