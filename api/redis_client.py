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

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        url = os.getenv("REDIS_URL", "redis://localhost:6379")
        _redis = aioredis.from_url(url, decode_responses=True)
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
