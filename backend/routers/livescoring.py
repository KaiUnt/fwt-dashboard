"""
Live Scoring Router - Real-time heat results for events.

Endpoints:
- GET /api/events/{event_id}/livescoring - Get live scoring data for an event
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone
import os
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Live Scoring"])

security = HTTPBearer(auto_error=True)


async def get_redis_client(request: Request):
    """Get Redis client from app state."""
    if hasattr(request.app.state, "_redis_client") and request.app.state._redis_client is not None:
        return request.app.state._redis_client
    return None


async def extract_user_id_from_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Import and use the main app's token extraction with full signature verification."""
    import sys
    if "backend_api" in sys.modules:
        main_module = sys.modules["backend_api"]
        return await main_module.extract_user_id_from_token(credentials)

    logger.error("backend_api module not loaded - cannot verify JWT signature")
    raise HTTPException(status_code=500, detail="Authentication module not available")


@router.get("/api/events/{event_id}/livescoring")
async def get_event_live_scoring(
    event_id: str,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    force_refresh: bool = False
):
    """
    Get live scoring data (heats and results) for an event.

    Returns divisions with their heats and athlete results including:
    - total score (sum of 3 judges)
    - place within the heat

    Caching strategy:
    - Live events: 30 second TTL
    - Completed events: 1 hour TTL
    - Upcoming events: 5 minute TTL
    """
    try:
        from api.client import LiveheatsClient

        client = LiveheatsClient()
        redis_client = await get_redis_client(request)
        cache_key = f"livescoring:{event_id}"

        # Try cache first
        if redis_client and not force_refresh:
            try:
                cached_json = await redis_client.get(cache_key)
                if cached_json:
                    payload = json.loads(cached_json)
                    ttl_remaining = await redis_client.ttl(cache_key)
                    if payload is not None and ttl_remaining and ttl_remaining > 0:
                        # Add cache info to response
                        payload["cached"] = True
                        payload["cache_ttl"] = ttl_remaining
                        response = JSONResponse(content=payload)
                        response.headers["Cache-Control"] = f"public, max-age={int(ttl_remaining)}"
                        return response
            except Exception as e:
                logger.warning(f"Redis read failed for {cache_key}: {e}")

        # Fetch fresh data
        live_scoring_data = await client.get_event_live_scoring(event_id)

        if not live_scoring_data:
            raise HTTPException(status_code=404, detail="Event not found or no scoring data available")

        # Determine TTL based on event status
        event_status = live_scoring_data.get("event", {}).get("status", "").lower()
        if event_status == "live" or event_status == "in_progress":
            ttl_seconds = 30  # Short TTL for live events
        elif event_status in ["completed", "finished", "results_published"]:
            ttl_seconds = 3600  # 1 hour for completed events
        else:
            ttl_seconds = 300  # 5 minutes for upcoming/other

        # Add metadata
        response_data = {
            **live_scoring_data,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "cache_ttl": ttl_seconds,
            "cached": False
        }

        # Cache the response
        if redis_client:
            try:
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(response_data))
            except Exception as e:
                logger.warning(f"Redis write failed for {cache_key}: {e}")

        logger.info(f"Live scoring fetched for event {event_id}: {len(live_scoring_data.get('divisions', []))} divisions, status={event_status}, ttl={ttl_seconds}s")

        json_response = JSONResponse(content=response_data)
        json_response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
        return json_response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching live scoring for event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch live scoring: {str(e)}")
