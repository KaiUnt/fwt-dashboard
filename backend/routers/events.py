"""
Events Router - LiveHeats API integration for event data.

External API endpoints for fetching event information from LiveHeats.

Endpoints:
- GET /api/events - Get all FWT events (with rate limiting)
- GET /api/events/{event_id}/athletes - Get athletes for a specific event
- GET /api/events/multi/{event_id1}/{event_id2}/athletes - Get combined athletes from two events
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone
from typing import Optional
import os
import time
import json
import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.utils import extract_location_from_name

logger = logging.getLogger(__name__)

# Rate limiter for this router
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(tags=["Events"])

security = HTTPBearer(auto_error=True)


async def get_redis_client(request: Request):
    """Get Redis client from app state."""
    if hasattr(request.app.state, "_redis_client") and request.app.state._redis_client is not None:
        return request.app.state._redis_client

    # Try to initialize Redis if not yet done
    try:
        import redis.asyncio as redis_lib
        redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
        client = redis_lib.from_url(redis_url, decode_responses=True)
        pong = await client.ping()
        if pong:
            request.app.state._redis_client = client
            return client
    except Exception:
        pass

    request.app.state._redis_client = None
    return None


def get_supabase_client(request: Request):
    """Get Supabase client from app state."""
    return getattr(request.app.state, "supabase_client", None)


def get_admin_client(request: Request):
    """Get admin Supabase client from app state."""
    return getattr(request.app.state, "admin_supabase_client", None) or get_supabase_client(request)


async def extract_user_id_from_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Import and use the main app's token extraction with full signature verification."""
    import sys
    if "backend_api" in sys.modules:
        main_module = sys.modules["backend_api"]
        return await main_module.extract_user_id_from_token(credentials)

    # Security: Never decode without verification - fail fast if main module not loaded
    logger.error("backend_api module not loaded - cannot verify JWT signature")
    raise HTTPException(status_code=500, detail="Authentication module not available")


@router.get("/api/events")
@limiter.limit("30/minute")
async def get_future_events(
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    include_past: bool = False,
    force_refresh: bool = False
):
    """Get FWT events for event selection."""
    try:
        import time as _time
        _t_all = _time.perf_counter()

        # Prefer Redis shared cache if available, otherwise fallback to per-process memory cache
        cache_key = f"events:{'all' if include_past else 'future'}"
        ttl_seconds = int(os.getenv("EVENTS_TTL_SECONDS", "3600"))
        redis_client = await get_redis_client(request)

        if redis_client and not force_refresh:
            try:
                _t0 = _time.perf_counter()
                cached_json = await redis_client.get(cache_key)
                if cached_json:
                    try:
                        payload = json.loads(cached_json)
                    except Exception:
                        payload = None
                    ttl_remaining = await redis_client.ttl(cache_key)
                    if payload is not None and ttl_remaining and ttl_remaining > 0:
                        if os.getenv("DEBUG_TIMING") == "1":
                            logger.info(f"TIMING redis_get+ttl: {(_time.perf_counter()-_t0):.4f}s, ttl={ttl_remaining}")
                            logger.info(f"TIMING total_before_return: {(_time.perf_counter()-_t_all):.4f}s (cache hit)")
                        response = JSONResponse(content=payload)
                        response.headers["Cache-Control"] = f"public, max-age={int(ttl_remaining)}"
                        return response
            except Exception as e:
                logger.warning(f"Redis read failed, falling back to in-memory cache: {e}")

        # In-memory cache fallback
        now_ts = int(time.time())
        if not hasattr(request.app.state, "_events_cache"):
            request.app.state._events_cache = {}
        cache_store = request.app.state._events_cache
        if not force_refresh:
            cached_entry = cache_store.get(cache_key)
            if cached_entry:
                cached_data, cached_ts = cached_entry
                age = now_ts - cached_ts
                if age < ttl_seconds:
                    response = JSONResponse(content=cached_data)
                    response.headers["Cache-Control"] = f"public, max-age={max(ttl_seconds - age, 0)}"
                    return response

        from api.client import LiveheatsClient
        client = LiveheatsClient()
        if include_past:
            events = await client.get_all_events()
        else:
            events = await client.get_future_events()

        # Input validation and sanitization
        if not isinstance(events, list):
            logger.error("Invalid events data type received from API")
            raise HTTPException(status_code=500, detail="Invalid data format")

        # Format events für Frontend
        formatted_events = []
        for event in events:
            if not isinstance(event, dict) or "id" not in event:
                logger.warning(f"Skipping invalid event data: {event}")
                continue

            try:
                formatted_events.append({
                    "id": str(event["id"])[:100],  # Limit length
                    "name": str(event.get("name", "Unknown"))[:200],
                    "date": event.get("date", ""),
                    "formatted_date": datetime.fromisoformat(
                        event["date"].replace("Z", "+00:00")
                    ).strftime("%d.%m.%Y") if event.get("date") else "",
                    "location": extract_location_from_name(event.get("name", "")),
                    "year": datetime.fromisoformat(
                        event["date"].replace("Z", "+00:00")
                    ).year if event.get("date") else None
                })
            except Exception as e:
                logger.warning(f"Error formatting event {event.get('id')}: {e}")
                continue

        # Sort by date
        formatted_events.sort(key=lambda x: x.get("date", ""))

        payload = {
            "events": formatted_events,
            "total": len(formatted_events),
            "message": f"Found {len(formatted_events)} {'all' if include_past else 'future'} events"
        }

        # Store in cache and return with cache headers
        if redis_client:
            try:
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(payload))
            except Exception as e:
                logger.warning(f"Redis write failed, using in-memory cache: {e}")
                cache_store[cache_key] = (payload, now_ts)
        else:
            cache_store[cache_key] = (payload, now_ts)

        if os.getenv("DEBUG_TIMING") == "1":
            import time as _time
            logger.info(f"TIMING total_before_return: {(_time.perf_counter()-_t_all):.4f}s (cache miss)")

        response = JSONResponse(content=payload)
        response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
        return response

    except Exception as e:
        logger.error(f"Error fetching events: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch events"
        )


@router.get("/api/events/{event_id}/athletes")
async def get_event_athletes(
    event_id: str,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    force_refresh: bool = False
):
    """Get all athletes for a specific event"""
    try:
        from api.client import LiveheatsClient

        client = LiveheatsClient()

        # Redis-backed cache for event athletes
        ttl_seconds = int(os.getenv("EVENTS_TTL_SECONDS", "3600"))
        cache_key = f"eventAthletes:{event_id}"
        redis_client = await get_redis_client(request)

        if redis_client and not force_refresh:
            try:
                cached_json = await redis_client.get(cache_key)
                if cached_json:
                    payload = json.loads(cached_json)
                    ttl_remaining = await redis_client.ttl(cache_key)
                    if payload is not None and ttl_remaining and ttl_remaining > 0:
                        response = JSONResponse(content=payload)
                        response.headers["Cache-Control"] = f"public, max-age={int(ttl_remaining)}"
                        return response
            except Exception as e:
                logger.warning(f"Redis read failed for {cache_key}: {e}")

        # Use the existing method that already does what we need
        result = await client.get_event_athletes(event_id)

        if not result:
            raise HTTPException(status_code=404, detail="Event not found")

        logger.info(f"Found event {result.get('event', {}).get('name')} with athletes")

        # Sync athletes to database (background task, don't block response)
        supabase_client = get_supabase_client(request)
        if supabase_client:
            try:
                admin_client = get_admin_client(request)
                athletes_in_event = []

                for division in result.get('event', {}).get('eventDivisions', []):
                    for entry in division.get('entries', []):
                        athlete = entry.get('athlete')
                        if athlete and athlete.get('id') and athlete.get('name'):
                            athletes_in_event.append({
                                "id": athlete["id"],
                                "name": athlete["name"]
                            })

                # Quick sync (fire and forget)
                for athlete in athletes_in_event:
                    try:
                        existing = await admin_client.select("athletes", "id", {"id": athlete["id"]})
                        if existing:
                            await admin_client.update(
                                "athletes",
                                {"last_seen": datetime.now(timezone.utc).isoformat()},
                                {"id": athlete["id"]}
                            )
                        else:
                            await admin_client.insert("athletes", {
                                "id": athlete["id"],
                                "name": athlete["name"],
                                "last_seen": datetime.now(timezone.utc).isoformat()
                            })
                    except Exception as sync_error:
                        logger.debug(f"Athlete sync skipped for {athlete['id']}: {sync_error}")

                logger.debug(f"Synced {len(athletes_in_event)} athletes from event {event_id}")
            except Exception as e:
                logger.debug(f"Athlete auto-sync failed (non-critical): {e}")

        # Write to cache
        if redis_client:
            try:
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(result))
            except Exception as e:
                logger.warning(f"Redis write failed for {cache_key}: {e}")

        response = JSONResponse(content=result)
        response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching athletes for event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch event athletes: {str(e)}")


@router.get("/api/events/multi/{event_id1}/{event_id2}/athletes")
async def get_multi_event_athletes(
    event_id1: str,
    event_id2: str,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    force_refresh: bool = False
):
    """Get combined athletes from two events, sorted by BIB numbers for live commentary"""
    try:
        from api.client import LiveheatsClient

        client = LiveheatsClient()
        redis_client = await get_redis_client(request)
        ttl_seconds = int(os.getenv("EVENTS_TTL_SECONDS", "3600"))

        async def get_event_data(event_id: str):
            """Get event data from cache or API, and cache if fetched."""
            cache_key = f"eventAthletes:{event_id}"

            # Try cache first
            if redis_client and not force_refresh:
                try:
                    cached_json = await redis_client.get(cache_key)
                    if cached_json:
                        payload = json.loads(cached_json)
                        if payload is not None:
                            logger.debug(f"Cache hit for {cache_key}")
                            return payload
                except Exception as e:
                    logger.warning(f"Redis read failed for {cache_key}: {e}")

            # Cache miss - fetch from API
            logger.debug(f"Cache miss for {cache_key}, fetching from API")
            data = await client.get_event_athletes(event_id)

            # Store in cache for future requests
            if redis_client and data:
                try:
                    await redis_client.setex(cache_key, ttl_seconds, json.dumps(data))
                    logger.debug(f"Cached {cache_key}")
                except Exception as e:
                    logger.warning(f"Redis write failed for {cache_key}: {e}")

            return data

        # Fetch both events (from cache or API)
        try:
            event1_data = await get_event_data(event_id1)
        except Exception as e:
            logger.error(f"Error fetching event {event_id1}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch event {event_id1}")

        try:
            event2_data = await get_event_data(event_id2)
        except Exception as e:
            logger.error(f"Error fetching event {event_id2}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch event {event_id2}")

        if not event1_data or not event2_data:
            raise HTTPException(status_code=404, detail="One or both events not found")

        # Combine athletes with event source information
        combined_athletes = []

        # Add athletes from event 1
        for athlete in event1_data.get('athletes', []):
            athlete_data = athlete.copy()
            athlete_data['eventSource'] = event_id1
            athlete_data['eventName'] = event1_data['event']['name']
            combined_athletes.append(athlete_data)

        # Add athletes from event 2
        for athlete in event2_data.get('athletes', []):
            athlete_data = athlete.copy()
            athlete_data['eventSource'] = event_id2
            athlete_data['eventName'] = event2_data['event']['name']
            combined_athletes.append(athlete_data)

        # Sort by BIB numbers for proper live commentary order
        def get_bib_number(athlete):
            bib = athlete.get('bib')
            if bib is None:
                return 999  # Put athletes without BIB at the end
            try:
                return int(str(bib))
            except (ValueError, TypeError):
                return 999

        combined_athletes.sort(key=get_bib_number)

        # Create response
        response = {
            "events": {
                "event1": event1_data['event'],
                "event2": event2_data['event']
            },
            "athletes": combined_athletes,
            "total_athletes": len(combined_athletes),
            "event1_count": len(event1_data.get('athletes', [])),
            "event2_count": len(event2_data.get('athletes', [])),
            "message": f"Combined {len(combined_athletes)} athletes from 2 events, sorted by BIB"
        }

        logger.info(f"Combined events: {event1_data['event']['name']} ({len(event1_data.get('athletes', []))}) + {event2_data['event']['name']} ({len(event2_data.get('athletes', []))}) = {len(combined_athletes)} athletes")

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching multi-event athletes for {event_id1} + {event_id2}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch multi-event athletes: {str(e)}")
