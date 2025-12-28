"""
Redis Cache Utilities

Provides unified caching patterns to eliminate code duplication.
"""

import json
import logging
from typing import Any, Callable, Optional, TypeVar
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

T = TypeVar('T')


async def get_redis_client(request: Request):
    """
    Get Redis client from app state, with lazy initialization.

    Returns None if Redis is not available.
    """
    # Check if already initialized
    if hasattr(request.app.state, "_redis_client") and request.app.state._redis_client is not None:
        return request.app.state._redis_client

    # Try to import and connect
    try:
        import redis.asyncio as redis_async
    except ImportError:
        request.app.state._redis_client = None
        return None

    import os
    redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

    try:
        client = redis_async.from_url(redis_url, decode_responses=True)
        # Validate connectivity
        pong = await client.ping()
        if pong:
            request.app.state._redis_client = client
            logger.info(f"Redis connected: {redis_url}")
            return client
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}")

    request.app.state._redis_client = None
    return None


async def cached_response(
    request: Request,
    cache_key: str,
    fetch_func: Callable[[], Any],
    ttl_seconds: int = 3600,
    force_refresh: bool = False,
) -> JSONResponse:
    """
    Generic caching wrapper for API responses.

    Checks Redis cache first, falls back to in-memory cache,
    then calls fetch_func if no cache hit.

    Args:
        request: FastAPI request object
        cache_key: Unique key for this cache entry
        fetch_func: Async function that returns the data to cache
        ttl_seconds: Cache TTL in seconds
        force_refresh: Skip cache and fetch fresh data

    Returns:
        JSONResponse with appropriate Cache-Control headers

    Usage:
        @app.get("/api/events")
        async def get_events(request: Request, force_refresh: bool = False):
            async def fetch():
                return {"events": await load_events()}

            return await cached_response(
                request, "events:all", fetch,
                ttl_seconds=3600, force_refresh=force_refresh
            )
    """
    import time

    redis_client = await get_redis_client(request)

    # Try Redis cache first
    if redis_client and not force_refresh:
        try:
            cached_json = await redis_client.get(cache_key)
            if cached_json:
                payload = json.loads(cached_json)
                ttl_remaining = await redis_client.ttl(cache_key)
                if payload is not None and ttl_remaining and ttl_remaining > 0:
                    response = JSONResponse(content=payload)
                    response.headers["Cache-Control"] = f"public, max-age={int(ttl_remaining)}"
                    response.headers["X-Cache"] = "HIT-REDIS"
                    return response
        except Exception as e:
            logger.warning(f"Redis read failed for {cache_key}: {e}")

    # Try in-memory cache fallback
    now_ts = int(time.time())
    if not hasattr(request.app.state, "_memory_cache"):
        request.app.state._memory_cache = {}

    cache_store = request.app.state._memory_cache

    if not force_refresh:
        cached_entry = cache_store.get(cache_key)
        if cached_entry:
            cached_data, cached_ts = cached_entry
            age = now_ts - cached_ts
            if age < ttl_seconds:
                response = JSONResponse(content=cached_data)
                response.headers["Cache-Control"] = f"public, max-age={max(ttl_seconds - age, 0)}"
                response.headers["X-Cache"] = "HIT-MEMORY"
                return response

    # Cache miss - fetch fresh data
    payload = await fetch_func()

    # Store in Redis if available
    if redis_client:
        try:
            await redis_client.setex(cache_key, ttl_seconds, json.dumps(payload))
        except Exception as e:
            logger.warning(f"Redis write failed for {cache_key}: {e}")
            # Fall back to memory cache
            cache_store[cache_key] = (payload, now_ts)
    else:
        # Use memory cache
        cache_store[cache_key] = (payload, now_ts)

    response = JSONResponse(content=payload)
    response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
    response.headers["X-Cache"] = "MISS"
    return response


async def invalidate_cache(request: Request, cache_key: str) -> bool:
    """
    Invalidate a specific cache entry.

    Args:
        request: FastAPI request object
        cache_key: Key to invalidate

    Returns:
        True if cache was invalidated, False otherwise
    """
    invalidated = False

    # Invalidate Redis
    redis_client = await get_redis_client(request)
    if redis_client:
        try:
            await redis_client.delete(cache_key)
            invalidated = True
        except Exception as e:
            logger.warning(f"Redis delete failed for {cache_key}: {e}")

    # Invalidate memory cache
    if hasattr(request.app.state, "_memory_cache"):
        if cache_key in request.app.state._memory_cache:
            del request.app.state._memory_cache[cache_key]
            invalidated = True

    return invalidated


async def invalidate_cache_pattern(request: Request, pattern: str) -> int:
    """
    Invalidate all cache entries matching a pattern.

    Args:
        request: FastAPI request object
        pattern: Redis pattern (e.g., "events:*")

    Returns:
        Number of keys invalidated
    """
    count = 0

    redis_client = await get_redis_client(request)
    if redis_client:
        try:
            keys = await redis_client.keys(pattern)
            if keys:
                await redis_client.delete(*keys)
                count = len(keys)
        except Exception as e:
            logger.warning(f"Redis pattern delete failed for {pattern}: {e}")

    # Memory cache - simple prefix match
    if hasattr(request.app.state, "_memory_cache"):
        prefix = pattern.replace("*", "")
        keys_to_delete = [k for k in request.app.state._memory_cache if k.startswith(prefix)]
        for key in keys_to_delete:
            del request.app.state._memory_cache[key]
            count += 1

    return count
