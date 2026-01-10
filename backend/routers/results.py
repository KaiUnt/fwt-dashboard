"""
Results Router - Series rankings, athlete results, and full results endpoints.

Endpoints:
- GET /api/series/rankings/{event_id} - Get series rankings for event athletes
- GET /api/athlete/{athlete_id}/results - Get athlete results history
- GET /api/fullresults - Get all FWT series
- GET /api/fullresults/{series_id} - Get rankings for a specific series
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
import os
import re
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Results"])

security = HTTPBearer(auto_error=True)


def get_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract raw user JWT token from credentials"""
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Authorization token required")
    return credentials.credentials


async def get_redis_client(request: Request):
    """Get Redis client from app state."""
    if hasattr(request.app.state, "_redis_client"):
        return request.app.state._redis_client
    return None


async def extract_user_id_from_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Import and use the main app's token extraction with full signature verification."""
    import sys
    if "backend_api" in sys.modules:
        main_module = sys.modules["backend_api"]
        return await main_module.extract_user_id_from_token(credentials)

    # Security: Never decode without verification - fail fast if main module not loaded
    logger.error("backend_api module not loaded - cannot verify JWT signature")
    raise HTTPException(status_code=500, detail="Authentication module not available")


def normalize_series_name(series_name: str) -> str:
    if not series_name:
        return series_name
    if "ifsa" not in series_name.lower():
        return series_name
    return re.sub(r'\b(20[0-9]{2})-(20[0-9]{2})\b', r'\2', series_name, count=1)


@router.get("/api/series/rankings/{event_id}")
async def get_series_rankings_for_event(
    event_id: str,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    force_refresh: bool = False
):
    """Get FWT series rankings for athletes in a specific event"""
    try:
        from api.client import LiveheatsClient

        client = LiveheatsClient()

        # Redis client init
        ttl_seconds = int(os.getenv("EVENTS_TTL_SECONDS", "3600"))
        cache_key = f"seriesRankings:{event_id}"
        redis_client = await get_redis_client(request)

        # Endpoint-level cache
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

        # First get event athletes to have athlete IDs (with its own cache)
        event_athletes_key = f"eventAthletes:{event_id}"
        event_data = None
        if redis_client and not force_refresh:
            try:
                cached_event_json = await redis_client.get(event_athletes_key)
                if cached_event_json:
                    event_data = json.loads(cached_event_json)
            except Exception as e:
                logger.warning(f"Redis read failed for {event_athletes_key}: {e}")
        if event_data is None:
            event_data = await client.get_event_athletes(event_id)
            if redis_client and event_data:
                try:
                    await redis_client.setex(event_athletes_key, ttl_seconds, json.dumps(event_data))
                except Exception as e:
                    logger.warning(f"Redis write failed for {event_athletes_key}: {e}")
        if not event_data:
            raise HTTPException(status_code=404, detail="Event not found")

        # Extract athlete IDs
        athlete_ids = []
        for division in event_data.get('event', {}).get('eventDivisions', []):
            for entry in division.get('entries', []):
                if entry.get('athlete', {}).get('id'):
                    athlete_ids.append(entry['athlete']['id'])

        if not athlete_ids:
            return {
                "event": event_data['event'],
                "series_rankings": [],
                "message": "No athletes found in event"
            }

        # Get FWT series only from fwtglobal (privacy and domain decision)
        series_data = await client.get_series_by_years("fwtglobal", range(2008, 2031))
        if not series_data:
            return {
                "event": event_data['event'],
                "series_rankings": [],
                "message": "No FWT series found"
            }

        # Get series IDs
        series_ids = [s["id"] for s in series_data]

        # Fetch rankings for all series
        rankings = await client.fetch_multiple_series(series_ids, athlete_ids)

        # Structure response
        response_data = {
            "event": event_data['event'],
            "series_rankings": rankings,
            "athletes_count": len(athlete_ids),
            "series_count": len(rankings),
            "message": f"Found rankings for {len(athlete_ids)} athletes across {len(rankings)} series"
        }

        logger.info(f"Series rankings for event {event_data['event']['name']}: {len(rankings)} series, {len(athlete_ids)} athletes")

        # Store endpoint payload in cache
        if redis_client:
            try:
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(response_data))
            except Exception as e:
                logger.warning(f"Redis write failed for {cache_key}: {e}")

        json_response = JSONResponse(content=response_data)
        json_response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
        return json_response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching series rankings for event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch series rankings: {str(e)}")


@router.get("/api/athlete/{athlete_id}/results")
async def get_athlete_results(
    athlete_id: str,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    force_refresh: bool = False
):
    """Get event results history for a specific athlete"""
    try:
        from api.client import LiveheatsClient

        client = LiveheatsClient()

        ttl_seconds = int(os.getenv("EVENTS_TTL_SECONDS", "3600"))
        cache_key = f"athleteResults:{athlete_id}"
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

        # Get complete FWT series history only from fwtglobal since 2008
        series_data = await client.get_series_by_years("fwtglobal", range(2008, 2031))
        if not series_data:
            return {
                "athlete_id": athlete_id,
                "results": [],
                "message": "No FWT series found"
            }

        series_ids = [s["id"] for s in series_data]

        # Get rankings which include results
        rankings = await client.fetch_multiple_series(series_ids, [athlete_id])

        # Extract results from rankings
        athlete_results = []
        for series in rankings:
            for division_name, division_rankings in series["divisions"].items():
                for ranking in division_rankings:
                    if ranking["athlete"]["id"] == athlete_id:
                        for result in ranking.get("results", []):
                            athlete_results.append({
                                "series_name": series["series_name"],
                                "division": division_name,
                                "event_name": result.get("event", {}).get("name", "Unknown Event"),
                                "place": result.get("place"),
                                "points": result.get("points"),
                                "date": result.get("event", {}).get("date"),
                                "result_data": result
                            })

        # Sort by date (newest first) - handle None values by putting them at the end
        athlete_results.sort(key=lambda x: x.get("date") or "", reverse=True)

        response_data = {
            "athlete_id": athlete_id,
            "results": athlete_results,
            "total_results": len(athlete_results),
            "message": f"Found {len(athlete_results)} results for athlete"
        }

        logger.info(f"Found {len(athlete_results)} results for athlete {athlete_id}")
        if redis_client:
            try:
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(response_data))
            except Exception as e:
                logger.warning(f"Redis write failed for {cache_key}: {e}")

        json_response = JSONResponse(content=response_data)
        json_response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
        return json_response

    except Exception as e:
        logger.error(f"Error fetching results for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch athlete results: {str(e)}")


@router.get("/api/fullresults")
async def get_all_series(
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    force_refresh: bool = False
):
    """Get all available FWT series with metadata"""
    try:
        from api.client import LiveheatsClient

        client = LiveheatsClient()

        ttl_seconds = int(os.getenv("EVENTS_TTL_SECONDS", "3600"))
        cache_key = "fullresults"
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

        # Get series only from fwtglobal
        all_series = await client.get_series_by_years("fwtglobal", range(2008, 2031))

        # Enhance series data with metadata
        enhanced_series = []
        for series in all_series:
            series_name = normalize_series_name(series.get("name", ""))

            # Extract year from series name
            year_match = re.search(r'\b(20\d{2})\b', series_name)
            year = int(year_match.group(1)) if year_match else None

            # Determine category based on name patterns
            name_lower = series_name.lower()
            if "qualifier" in name_lower or ("ifsa" in name_lower and "junior" not in name_lower):
                category = "Qualifier"
            elif "challenger" in name_lower:
                category = "Challenger"
            elif "junior" in name_lower:
                category = "Junior"
            elif "pro tour" in name_lower or "world tour" in name_lower:
                category = "Pro Tour"
            else:
                category = "Other"

            enhanced_series.append({
                "id": series["id"],
                "name": series_name,
                "year": year,
                "category": category
            })

        # Sort by year (newest first) then by category
        enhanced_series.sort(key=lambda x: (-(x["year"] or 0), x["category"]))

        payload = {
            "series": enhanced_series,
            "total": len(enhanced_series),
            "categories": list(set(s["category"] for s in enhanced_series)),
            "years": sorted(list(set(s["year"] for s in enhanced_series if s["year"])), reverse=True),
            "message": f"Found {len(enhanced_series)} series"
        }

        if redis_client:
            try:
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(payload))
            except Exception as e:
                logger.warning(f"Redis write failed for {cache_key}: {e}")

        response = JSONResponse(content=payload)
        response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
        return response

    except Exception as e:
        logger.error(f"Error fetching all series: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch series: {str(e)}")


@router.get("/api/fullresults/{series_id}")
async def get_series_rankings(
    series_id: str,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    force_refresh: bool = False
):
    """Get rankings for a specific series with all divisions"""
    try:
        from api.client import LiveheatsClient

        client = LiveheatsClient()

        # Cache first
        ttl_seconds = int(os.getenv("EVENTS_TTL_SECONDS", "3600"))
        cache_key = f"fullresults:{series_id}"
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

        # Get series info and divisions
        async with client.client as graphql_client:
            divisions_data = await graphql_client.execute(
                client.queries.GET_DIVISIONS,
                {"id": series_id}
            )

            if not divisions_data or "series" not in divisions_data:
                raise HTTPException(status_code=404, detail="Series not found")

            series_info = divisions_data["series"]
            divisions = series_info.get("rankingsDivisions", [])
            series_name = normalize_series_name(series_info.get("name", "Unknown Series"))

            if not divisions:
                return {
                    "series_id": series_id,
                    "series_name": series_name,
                    "divisions": {},
                    "total_athletes": 0,
                    "message": "No divisions found for this series"
                }

            # Get rankings for each division
            all_rankings = {}
            total_athletes = 0

            for division in divisions:
                rankings = await graphql_client.execute(
                    client.queries.GET_SERIES_RANKINGS,
                    {"id": series_id, "divisionId": division["id"]}
                )

                if rankings and "series" in rankings and "rankings" in rankings["series"]:
                    division_rankings = rankings["series"]["rankings"]
                    all_rankings[division["name"]] = division_rankings
                    total_athletes += len(division_rankings)

            payload = {
                "series_id": series_id,
                "series_name": series_name,
                "divisions": all_rankings,
                "total_athletes": total_athletes,
                "message": f"Found {total_athletes} athletes across {len(all_rankings)} divisions"
            }

            if redis_client:
                try:
                    await redis_client.setex(cache_key, ttl_seconds, json.dumps(payload))
                except Exception as e:
                    logger.warning(f"Redis write failed for {cache_key}: {e}")

            response = JSONResponse(content=payload)
            response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
            return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching series rankings for {series_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch series rankings: {str(e)}")
