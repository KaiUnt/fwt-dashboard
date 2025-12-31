"""
Video Router - Admin endpoints for managing athlete run videos from XML sources.
"""

import re
import logging
import unicodedata
import html
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import httpx

logger = logging.getLogger(__name__)
security = HTTPBearer()

router = APIRouter(prefix="/api/video", tags=["Video"])


# Pydantic models for request/response validation
class ParseXmlRequest(BaseModel):
    xmlUrl: Optional[str] = None
    xmlContent: Optional[str] = None


class ParsedRider(BaseModel):
    bib: str
    name: str
    rider_class: str  # 'class' is reserved in Python
    sex: str
    nation: str
    points: str
    state: str
    youtubeUrl: str
    youtubeTimestamp: int


class ParsedXmlData(BaseModel):
    eventName: str
    eventDate: str
    year: int
    riders: List[ParsedRider]


class MatchAthletesRequest(BaseModel):
    riders: List[Dict[str, Any]]
    eventId: str


class AthleteMatch(BaseModel):
    rider_name: str
    athlete_id: Optional[str]
    athlete_name: Optional[str]
    match_type: str  # 'exact', 'normalized', 'none'


class SaveRunRequest(BaseModel):
    athlete_id: str
    event_id: str
    year: int
    event_name: str
    youtube_url: str
    youtube_timestamp: Optional[int] = 0


class SaveRunsRequest(BaseModel):
    runs: List[SaveRunRequest]


class DeleteRunRequest(BaseModel):
    athlete_id: str
    event_id: str
    year: int


def get_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract raw token from credentials."""
    return credentials.credentials


async def get_supabase(request: Request):
    """Get supabase client from app state."""
    client = getattr(request.app.state, 'supabase_client', None)
    if not client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    return client


async def get_admin_client(request: Request):
    """Get admin supabase client from app state."""
    return getattr(request.app.state, 'admin_supabase_client', None)


async def get_current_user_id(request: Request, token: str = Depends(get_user_token)) -> str:
    """Extract user ID from token."""
    from backend_api import extract_user_id_from_token
    from fastapi.security import HTTPAuthorizationCredentials
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    return await extract_user_id_from_token(creds)


async def require_admin(request: Request, user_token: str) -> str:
    """Check if user is admin and return user_id."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
    if not user_profile or user_profile[0].get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

    return current_user_id


def normalize_string(s: str) -> str:
    """Normalize string for matching: remove accents, lowercase, trim.

    Uses NFD normalization to remove diacritics, plus manual mappings
    for special characters that NFD doesn't handle (e.g., Ø, ß, Æ).
    """
    # Special character mappings for characters not handled by NFD
    special_chars = {
        'ø': 'o', 'Ø': 'o',
        'æ': 'ae', 'Æ': 'ae',
        'œ': 'oe', 'Œ': 'oe',
        'ß': 'ss',
        'ð': 'd', 'Ð': 'd',
        'þ': 'th', 'Þ': 'th',
        'ł': 'l', 'Ł': 'l',
        'đ': 'd', 'Đ': 'd',
    }

    # Apply special character mappings first
    for char, replacement in special_chars.items():
        s = s.replace(char, replacement)

    # NFD decomposition separates characters from their diacritics
    normalized = unicodedata.normalize('NFD', s)
    # Remove diacritical marks (combining characters)
    without_accents = ''.join(c for c in normalized if not unicodedata.combining(c))
    return without_accents.lower().strip()


def parse_youtube_timestamp(url: str) -> Dict[str, Any]:
    """Extract timestamp from YouTube URL and return clean URL + timestamp."""
    try:
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)

        # Get timestamp (t parameter)
        timestamp = 0
        if 't' in query_params:
            t_value = query_params['t'][0]
            # Handle both "123" and "123s" formats
            timestamp = int(t_value.rstrip('s'))

        # Remove t parameter from URL
        filtered_params = {k: v[0] for k, v in query_params.items() if k != 't'}
        clean_query = urlencode(filtered_params) if filtered_params else ''
        clean_url = urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            clean_query,
            parsed.fragment
        ))

        return {"url": clean_url, "timestamp": timestamp}
    except Exception:
        return {"url": url, "timestamp": 0}


def parse_xml_content(xml_content: str) -> Dict[str, Any]:
    """Parse XML content from tv.open-faces.com format.

    Supports two XML formats:
    1. Nested elements: <rider><bib>1</bib><name>John</name>...</rider>
    2. Attributes: <rider bib="1" name="John" ... />
    """
    # Extract event info from eventdata section
    venue_match = re.search(r'<venue>([^<]*)</venue>', xml_content)
    from_match = re.search(r'<from>([^<]*)</from>', xml_content)
    series_match = re.search(r'<series>([^<]*)</series>', xml_content)
    category_match = re.search(r'<category>([^<]*)</category>', xml_content)

    # Build event name from series, category and venue
    series = series_match.group(1) if series_match else ''
    category = category_match.group(1) if category_match else ''
    venue = venue_match.group(1) if venue_match else 'Unknown Event'

    if series and category:
        event_name = f"{series} {category} - {venue}"
    elif series:
        event_name = f"{series} - {venue}"
    else:
        event_name = venue

    event_date_str = from_match.group(1) if from_match else ''

    # Parse date (format: DD.MM.YYYY)
    year = datetime.now().year
    if event_date_str:
        date_parts = event_date_str.split('.')
        if len(date_parts) == 3:
            try:
                year = int(date_parts[2])
            except ValueError:
                pass

    # Extract riders - try nested element format first (tv.open-faces.com)
    riders = []

    # Pattern for nested XML elements: <rider>...</rider>
    rider_blocks = re.findall(r'<rider>(.*?)</rider>', xml_content, re.DOTALL)

    if rider_blocks:
        # Nested element format
        for block in rider_blocks:
            def get_element(name: str) -> str:
                match = re.search(rf'<{name}>([^<]*)</{name}>', block)
                if match:
                    # Decode HTML entities (e.g., &#xE9; -> é)
                    return html.unescape(match.group(1))
                return ''

            riderrun_url = get_element('riderrun')
            parsed_url = parse_youtube_timestamp(riderrun_url)

            riders.append({
                "bib": get_element('bib'),
                "name": get_element('name'),
                "rider_class": get_element('class'),
                "sex": get_element('sex'),
                "nation": get_element('nation'),
                "points": get_element('points'),
                "state": get_element('state'),
                "youtubeUrl": parsed_url["url"],
                "youtubeTimestamp": parsed_url["timestamp"]
            })
    else:
        # Fallback to attribute format: <rider bib="1" name="John" ... />
        rider_pattern = re.compile(r'<rider\s+([^>]*)/?>')

        for match in rider_pattern.finditer(xml_content):
            attrs = match.group(1)

            def get_attr(name: str) -> str:
                attr_match = re.search(rf'{name}="([^"]*)"', attrs)
                return attr_match.group(1) if attr_match else ''

            riderrun_url = get_attr('riderrun')
            parsed_url = parse_youtube_timestamp(riderrun_url)

            riders.append({
                "bib": get_attr('bib'),
                "name": get_attr('name'),
                "rider_class": get_attr('class'),
                "sex": get_attr('sex'),
                "nation": get_attr('nation'),
                "points": get_attr('points'),
                "state": get_attr('state'),
                "youtubeUrl": parsed_url["url"],
                "youtubeTimestamp": parsed_url["timestamp"]
            })

    return {
        "eventName": event_name,
        "eventDate": event_date_str,
        "year": year,
        "riders": riders
    }


@router.post("/parse-xml")
async def parse_xml(
    body: ParseXmlRequest,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Parse XML from URL or content (Admin only)"""
    await require_admin(request, user_token)

    try:
        content: str = ""

        if body.xmlUrl:
            # Fetch XML from URL
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(body.xmlUrl)
                if response.status_code != 200:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Failed to fetch XML: {response.status_code}"
                    )
                content = response.text
        elif body.xmlContent:
            content = body.xmlContent
        else:
            raise HTTPException(
                status_code=400,
                detail="Either xmlUrl or xmlContent is required"
            )

        parsed = parse_xml_content(content)

        return {
            "success": True,
            "data": parsed,
            "normalizedNames": [
                {"original": r["name"], "normalized": normalize_string(r["name"])}
                for r in parsed["riders"]
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"XML parsing error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse XML content")


@router.post("/match-athletes")
async def match_athletes(
    body: MatchAthletesRequest,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Match rider names to athletes in database (Admin only)"""
    supabase_client = await get_supabase(request)
    await require_admin(request, user_token)

    try:
        # Get all athletes from database using user token for RLS
        athletes = await supabase_client.select("athletes", "id, name", {}, user_token)

        if athletes is None:
            logger.warning("Athletes query returned None")
            athletes = []

        logger.info(f"Loaded {len(athletes)} athletes from database")

        # Build lookup maps
        exact_lookup = {a["name"]: a for a in athletes}
        normalized_lookup = {normalize_string(a["name"]): a for a in athletes}

        matches = []
        for rider in body.riders:
            rider_name = rider.get("name", "")

            # Try exact match first
            if rider_name in exact_lookup:
                athlete = exact_lookup[rider_name]
                matches.append({
                    "rider_name": rider_name,
                    "athlete_id": athlete["id"],
                    "athlete_name": athlete["name"],
                    "match_type": "exact"
                })
                continue

            # Try normalized match
            normalized_name = normalize_string(rider_name)
            if normalized_name in normalized_lookup:
                athlete = normalized_lookup[normalized_name]
                matches.append({
                    "rider_name": rider_name,
                    "athlete_id": athlete["id"],
                    "athlete_name": athlete["name"],
                    "match_type": "normalized"
                })
                continue

            # No match found - log for debugging
            logger.debug(f"No match for rider: '{rider_name}' (normalized: '{normalized_name}')")
            matches.append({
                "rider_name": rider_name,
                "athlete_id": None,
                "athlete_name": None,
                "match_type": "none"
            })

        matched_count = sum(1 for m in matches if m["match_type"] != "none")

        # Debug: sample some athlete names from DB for comparison
        sample_athletes = [a["name"] for a in athletes[:10]] if athletes else []

        return {
            "success": True,
            "matches": matches,
            "matchedCount": matched_count,
            "totalCount": len(matches),
            "athletesInDb": len(athletes),
            "sampleAthleteNames": sample_athletes
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error matching athletes: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to match athletes: {str(e)}")


@router.get("/runs")
async def get_runs(
    request: Request,
    event_id: Optional[str] = None,
    athlete_id: Optional[str] = None,
    user_token: str = Depends(get_user_token)
):
    """Get athlete runs, optionally filtered by event or athlete (Admin only)"""
    supabase_client = await get_supabase(request)
    await require_admin(request, user_token)

    try:
        admin_client = await get_admin_client(request) or supabase_client

        filters = {}
        if event_id:
            filters["event_id"] = event_id
        if athlete_id:
            filters["athlete_id"] = athlete_id

        runs = await admin_client.select("athlete_runs", "*", filters, user_token)
        if runs is None:
            runs = []

        return {
            "success": True,
            "data": runs
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting runs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get runs: {str(e)}")


@router.post("/runs")
async def save_runs(
    body: SaveRunsRequest,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Save athlete runs - upserts based on (athlete_id, event_id, year) (Admin only)"""
    supabase_client = await get_supabase(request)
    await require_admin(request, user_token)

    try:
        admin_client = await get_admin_client(request) or supabase_client

        now = datetime.now(timezone.utc).isoformat()

        # Prepare data for upsert
        runs_data = []
        for run in body.runs:
            runs_data.append({
                "athlete_id": run.athlete_id,
                "event_id": run.event_id,
                "year": run.year,
                "event_name": run.event_name,
                "youtube_url": run.youtube_url,
                "youtube_timestamp": run.youtube_timestamp or 0,
                "created_at": now,
                "updated_at": now
            })

        if not runs_data:
            return {
                "success": True,
                "message": "No runs to save",
                "savedCount": 0
            }

        # Upsert with conflict resolution on the unique constraint
        result = await admin_client.upsert(
            "athlete_runs",
            runs_data,
            on_conflict="athlete_id,event_id,year",
            user_token=user_token
        )

        return {
            "success": True,
            "message": f"Saved {len(runs_data)} runs",
            "savedCount": len(runs_data),
            "data": result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving runs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save runs: {str(e)}")


@router.delete("/runs")
async def delete_run(
    request: Request,
    athlete_id: str,
    event_id: str,
    year: int,
    user_token: str = Depends(get_user_token)
):
    """Delete a specific athlete run (Admin only)"""
    supabase_client = await get_supabase(request)
    await require_admin(request, user_token)

    try:
        admin_client = await get_admin_client(request) or supabase_client

        result = await admin_client.delete(
            "athlete_runs",
            {
                "athlete_id": athlete_id,
                "event_id": event_id,
                "year": year
            },
            user_token
        )

        return {
            "success": True,
            "message": "Run deleted",
            "data": result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting run: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete run: {str(e)}")


# Public endpoint for fetching runs (for dashboard display)
@router.get("/athlete-runs")
async def get_athlete_runs(
    request: Request,
    athlete_id: Optional[str] = None,
    event_id: Optional[str] = None,
    user_token: str = Depends(get_user_token)
):
    """Get athlete runs for dashboard display (requires authentication)"""
    supabase_client = await get_supabase(request)

    # Just verify the token is valid, no admin check
    await get_current_user_id(request, user_token)

    try:
        filters = {}
        if athlete_id:
            filters["athlete_id"] = athlete_id
        if event_id:
            filters["event_id"] = event_id

        runs = await supabase_client.select("athlete_runs", "*", filters, user_token)
        if runs is None:
            runs = []

        # Sort by year descending
        runs = sorted(runs, key=lambda x: x.get("year", 0), reverse=True)

        return {
            "success": True,
            "data": runs
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting athlete runs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get runs: {str(e)}")
