import json
import redis.asyncio as redis
from typing import Callable, Any
from app.config import REDIS_URL
from app.logger import logger

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception as e:
    logger.error("redis_init_failed", error=str(e))
    redis_client = None

async def get_cached_or_fetch(key: str, fetch_func: Callable, ttl_seconds: int = 300) -> Any:
    """
    Tries to get a JSON-serializable value from Redis by key.
    If it misses, calls fetch_func(), caches the result, and returns it.
    If Redis is unavailable, degrades gracefully to just calling fetch_func().
    """
    if not redis_client:
        return await fetch_func()

    try:
        cached_val = await redis_client.get(key)
        if cached_val:
            logger.info("cache_hit", key=key)
            return json.loads(cached_val)
    except Exception as e:
        logger.warning("redis_get_failed", key=key, error=str(e))

    # Cache miss or error
    logger.info("cache_miss", key=key)
    result = await fetch_func()

    if redis_client and result is not None:
        try:
            await redis_client.setex(key, ttl_seconds, json.dumps(result))
        except Exception as e:
            logger.warning("redis_set_failed", key=key, error=str(e))

    return result

async def invalidate_cache(key_pattern: str):
    """Deletes keys matching a pattern. Warning: KEYS is O(N)."""
    if not redis_client:
        return
    try:
        keys = await redis_client.keys(key_pattern)
        if keys:
            await redis_client.delete(*keys)
            logger.info("cache_invalidated", pattern=key_pattern, count=len(keys))
    except Exception as e:
        logger.warning("redis_invalidate_failed", pattern=key_pattern, error=str(e))
