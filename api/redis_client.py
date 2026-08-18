# redis_client.py
"""
Shared Redis connection pool.

Both quota_manager and observability need Redis. Owning the client here keeps
them from building a pool each, and keeps observability from having to import
quota_manager just to get a handle (a strange dependency direction: analytics
should not depend on billing limits).
"""

import os

import redis.asyncio as aioredis

# Redis is a managed service reached over the public internet, not a container
# on the same host. That changes three defaults:
#
#   - No localhost fallback. A missing REDIS_URL used to land on the local
#     container and quietly work; now it would either fail on every request
#     with a confusing connection error, or - worse, on a box that still has a
#     local Redis - succeed against the wrong database and split quota in two.
#   - Timeouts. Without them a dropped connection hangs a request forever
#     instead of failing it.
#   - A connection cap. redis-py defaults to 100 per pool and the API runs four
#     uvicorn workers, so the process group can open 400 - more than most
#     managed plans allow.
#   - A blocking pool. redis-py's default pool *raises* once max_connections
#     is reached, so a burst would 500 rather than queue. BlockingConnectionPool
#     waits POOL_TIMEOUT seconds for a free connection first, which is what a
#     web API wants: a little latency under burst, not an error.
MAX_CONNECTIONS = int(os.getenv("REDIS_MAX_CONNECTIONS", "40"))
POOL_TIMEOUT = float(os.getenv("REDIS_POOL_TIMEOUT", "5"))

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        url = os.getenv("REDIS_URL")
        if not url:
            raise RuntimeError(
                "REDIS_URL is not set. Expected the native TCP endpoint "
                "(rediss://default:<password>@<host>:6379), not the REST URL."
            )
        pool = aioredis.BlockingConnectionPool.from_url(
            url,
            decode_responses=True,
            max_connections=MAX_CONNECTIONS,
            timeout=POOL_TIMEOUT,
            socket_connect_timeout=5,
            socket_timeout=5,
            socket_keepalive=True,
            # Managed Redis drops idle connections; without this the first
            # command on a stale one fails instead of transparently reconnecting.
            health_check_interval=30,
            retry_on_timeout=True,
        )
        _redis = aioredis.Redis(connection_pool=pool)
    return _redis


async def close_redis() -> None:
    """Called from the FastAPI lifespan shutdown hook."""
    global _redis
    if _redis is None:
        return
    # aclose() is redis-py >= 5.0.1; close() on older releases.
    closer = getattr(_redis, "aclose", None) or _redis.close
    await closer()
    _redis = None
