# usage_log.py
"""
Best-effort usage event log.

This is the *reporting* half of usage tracking. Redis owns enforcement - the
current window's counters, read on the hot path by known user id - and this
owns history: one row per consumption, queried with SQL for dashboards.

Nothing here is allowed to affect a request. `log_usage` never awaits, never
raises and never blocks: it drops a row onto a bounded queue and returns. A
single background task drains the queue in batches. If Postgres is down, slow,
or absent entirely (POSTGRES_DSN unset), the queue fills, rows are dropped, and
the API serves traffic exactly as it does today. Losing a slice of analytics is
an acceptable outcome; adding a second database to the critical path is not.

Why a queue and not `asyncio.create_task(insert(...))`: create_task is passive
only when the database is *down*, where the task raises immediately and the
exception is swallowed. When the database is merely *slow* - the case worth
designing for - one task per request accumulates at request rate, each parked
on an exhausted connection pool, and the process walks into its memory limit
while holding open sockets. A bounded queue degrades by dropping rows, which is
what "best effort" has to mean under load.
"""

import asyncio
import logging
import os
import time
from datetime import datetime, timezone

logger = logging.getLogger('usage_log')

# Rows buffered before we start dropping. At the batch sizes below this is a
# few seconds of very heavy traffic, which is the right amount of slack: enough
# to ride out a checkpoint or a brief network stall, not enough to hide an
# outage or accumulate meaningful memory.
QUEUE_MAXSIZE = int(os.getenv("USAGE_LOG_QUEUE_MAXSIZE", "10000"))
BATCH_SIZE = int(os.getenv("USAGE_LOG_BATCH_SIZE", "500"))
BATCH_INTERVAL = float(os.getenv("USAGE_LOG_BATCH_INTERVAL", "2.0"))

# Identifies which box wrote the row. The primary and the failover backup each
# run their own container, so without this a period spanning a failover reads
# as a single incomplete series instead of two partial ones. See
# failover_watchdog.py for the promotion path.
HOST_ID = os.getenv("USAGE_LOG_HOST", os.uname().nodename)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS usage_events (
    id      BIGSERIAL PRIMARY KEY,
    ts      TIMESTAMPTZ NOT NULL,
    user_id TEXT        NOT NULL,
    service TEXT        NOT NULL,
    host    TEXT        NOT NULL
);
-- Every dashboard query is a time range, usually narrowed to one user, so the
-- composite index serves both shapes and the ts-only index serves the
-- all-users rollup.
CREATE INDEX IF NOT EXISTS usage_events_user_ts_idx ON usage_events (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS usage_events_ts_idx      ON usage_events (ts DESC);
"""

_pool = None
_queue: asyncio.Queue | None = None
_writer_task: asyncio.Task | None = None
_dropped = 0
_dropped_logged_at = 0.0

# Drops are reported at most this often. A sustained overload drops at request
# rate, so a per-N-rows warning would put thousands of lines in the log for one
# incident and push out whatever else was happening.
DROP_LOG_INTERVAL = 60.0


def enabled() -> bool:
    return _pool is not None


async def start() -> None:
    """
    Called from the FastAPI lifespan startup hook.

    Failure to connect is logged and swallowed - the API must start whether or
    not the analytics database is reachable.
    """
    global _pool, _queue, _writer_task

    dsn = os.getenv("POSTGRES_DSN")
    if not dsn:
        logger.info("POSTGRES_DSN not set; usage logging disabled")
        return

    try:
        import asyncpg
        # Small pool on purpose: this writes in batches from one task, so more
        # connections buy nothing and the API already shares the box with
        # whatever else Postgres is serving.
        _pool = await asyncpg.create_pool(
            dsn, min_size=1, max_size=4, command_timeout=10,
        )
        async with _pool.acquire() as conn:
            await conn.execute(_SCHEMA)
    except Exception as e:
        logger.error(f"Usage logging disabled - could not connect to Postgres: {e}")
        _pool = None
        return

    _queue = asyncio.Queue(maxsize=QUEUE_MAXSIZE)
    _writer_task = asyncio.create_task(_writer_loop())
    logger.info("Usage logging started")


async def stop() -> None:
    """Called from the FastAPI lifespan shutdown hook. Flushes what it can."""
    global _pool, _queue, _writer_task

    if _writer_task is not None:
        _writer_task.cancel()
        try:
            await _writer_task
        except asyncio.CancelledError:
            pass
        _writer_task = None

    if _pool is not None:
        await _pool.close()
        _pool = None

    _queue = None
    if _dropped:
        logger.warning(f"Usage logging dropped {_dropped} rows this run")


def log_usage(user_id: str, service: str) -> None:
    """
    Record one consumption. Synchronous, non-blocking, never raises.

    Deliberately not a coroutine: callers cannot accidentally await it and pick
    up the database's latency on the request path.
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


async def _writer_loop() -> None:
    """Drain the queue into Postgres in batches until cancelled."""
    assert _queue is not None

    while True:
        try:
            batch = [await _queue.get()]
            # One blocking get above, then take whatever else has piled up
            # without waiting. Under light traffic this writes a single row
            # immediately; under load it fills whole batches.
            deadline = asyncio.get_running_loop().time() + BATCH_INTERVAL
            while len(batch) < BATCH_SIZE:
                timeout = deadline - asyncio.get_running_loop().time()
                if timeout <= 0:
                    break
                try:
                    batch.append(await asyncio.wait_for(_queue.get(), timeout))
                except asyncio.TimeoutError:
                    break

            try:
                async with _pool.acquire() as conn:
                    await conn.executemany(
                        "INSERT INTO usage_events (ts, user_id, service, host) "
                        "VALUES ($1, $2, $3, $4)",
                        batch,
                    )
            except Exception as e:
                # The batch is gone. Retrying risks unbounded growth behind a
                # database that is not coming back, and these rows are not
                # worth that.
                logger.error(f"Usage log write failed, dropped {len(batch)} rows: {e}")

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Usage log writer error: {e}")
            await asyncio.sleep(1)


async def get_usage_history(
    user_ids: list[str],
    days: int = 30,
    bucket: str = "day",
) -> list[dict]:
    """
    Historical counts per user, per service, per time bucket.

    Approximate by construction - rows dropped under load or lost to a failover
    are simply not here. Suitable for reporting, never for anything shown
    alongside a limit; that number has to come from Redis so it matches what
    the limiter will actually do.
    """
    if _pool is None or not user_ids:
        return []
    if bucket not in ("day", "week", "month"):
        raise ValueError(f"invalid bucket: {bucket}")

    try:
        async with _pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT date_trunc('{bucket}', ts) AS period,
                       user_id, service, count(*) AS count
                FROM usage_events
                WHERE user_id = ANY($1::text[])
                  AND ts >= now() - ($2 || ' days')::interval
                GROUP BY period, user_id, service
                ORDER BY period DESC
                """,
                user_ids, str(days),
            )
    except Exception as e:
        logger.error(f"Usage history query failed: {e}")
        return []

    return [
        {
            "period": r["period"].date().isoformat(),
            "user_id": r["user_id"],
            "service": r["service"],
            "count": r["count"],
        }
        for r in rows
    ]
