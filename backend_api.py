import sys
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add current directory to Python path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Dict, Any, Optional
import asyncio
from api.client import LiveheatsClient
from datetime import datetime
import uvicorn
import logging
import httpx
import re
from pydantic import BaseModel

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# Supabase REST API helper
class SupabaseClient:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip('/')
        self.key = key
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
    
    async def select(self, table: str, columns: str = "*", filters: dict = None):
        """Select data from table"""
        url = f"{self.url}/rest/v1/{table}"
        params = {"select": columns}
        
        if filters:
            for key, value in filters.items():
                params[f"{key}"] = f"eq.{value}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
    
    async def insert(self, table: str, data: dict):
        """Insert data into table"""
        url = f"{self.url}/rest/v1/{table}"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=self.headers, json=data)
            response.raise_for_status()
            return response.json()
    
    async def update(self, table: str, data: dict, filters: dict):
        """Update data in table"""
        url = f"{self.url}/rest/v1/{table}"
        params = {}
        
        if filters:
            for key, value in filters.items():
                params[f"{key}"] = f"eq.{value}"
        
        async with httpx.AsyncClient() as client:
            response = await client.patch(url, headers=self.headers, params=params, json=data)
            response.raise_for_status()
            return response.json()
    
    async def rpc(self, function_name: str, params: dict = None):
        """Call RPC function"""
        url = f"{self.url}/rest/v1/rpc/{function_name}"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=self.headers, json=params or {})
            response.raise_for_status()
            return response.json()

# Initialize Supabase client if credentials are provided
supabase_client: Optional[SupabaseClient] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = SupabaseClient(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase HTTP client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase HTTP client: {e}")
        supabase_client = None
else:
    logger.warning("Supabase credentials not provided. Commentator info features will be disabled.")

# Pydantic models for commentator info
class CommentatorInfoCreate(BaseModel):
    athlete_id: str
    homebase: Optional[str] = None
    team: Optional[str] = None
    sponsors: Optional[str] = None
    favorite_trick: Optional[str] = None
    achievements: Optional[str] = None
    injuries: Optional[str] = None
    fun_facts: Optional[str] = None
    notes: Optional[str] = None
    social_media: Optional[Dict[str, str]] = None

class CommentatorInfoUpdate(BaseModel):
    homebase: Optional[str] = None
    team: Optional[str] = None
    sponsors: Optional[str] = None
    favorite_trick: Optional[str] = None
    achievements: Optional[str] = None
    injuries: Optional[str] = None
    fun_facts: Optional[str] = None
    notes: Optional[str] = None
    social_media: Optional[Dict[str, str]] = None

app = FastAPI(title="FWT Events API", version="1.0.0")

# CORS Setup für Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
        "https://fwt-dashboard-1.onrender.com",  # Production frontend
        "https://*.onrender.com",  # Allow all Render subdomains
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "FWT Events API is running"}

@app.get("/api/events")
async def get_future_events(include_past: bool = False):
    """Get FWT events for event selection."""
    try:
        from api.client import LiveheatsClient
        client = LiveheatsClient()
        if include_past:
            events = await client.get_all_events()
        else:
            events = await client.get_future_events()
        
        # Format events für Frontend
        formatted_events = []
        for event in events:
            formatted_events.append({
                "id": event["id"],
                "name": event["name"],
                "date": event["date"],
                "formatted_date": datetime.fromisoformat(
                    event["date"].replace("Z", "+00:00")
                ).strftime("%d.%m.%Y"),
                "location": extract_location_from_name(event["name"]),
                "year": datetime.fromisoformat(
                    event["date"].replace("Z", "+00:00")
                ).year
            })
        
        # Sortiere nach Datum
        formatted_events.sort(key=lambda x: x["date"])
        
        return {
            "events": formatted_events,
            "total": len(formatted_events),
            "message": f"Found {len(formatted_events)} future events"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to fetch events: {str(e)}"
        )

@app.get("/api/events/{event_id}/athletes")
async def get_event_athletes(event_id: str):
    """Get all athletes for a specific event"""
    try:
        # Import the LiveHeats client
        from api.client import LiveheatsClient
        
        client = LiveheatsClient()
        
        # Use the existing method that already does what we need
        result = await client.get_event_athletes(event_id)
        
        if not result:
            raise HTTPException(status_code=404, detail="Event not found")
        
        logger.info(f"Found event {result.get('event', {}).get('name')} with athletes")
        return result
        
    except Exception as e:
        logger.error(f"Error fetching athletes for event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch event athletes: {str(e)}")

@app.get("/api/series/rankings/{event_id}")
async def get_series_rankings_for_event(event_id: str):
    """Get FWT series rankings for athletes in a specific event"""
    try:
        from api.client import LiveheatsClient
        
        client = LiveheatsClient()
        
        # First get event athletes to have athlete IDs
        event_data = await client.get_event_athletes(event_id)
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
        
        # Get FWT series from both organizations for complete history (2008-2030)
        series_fwtglobal = await client.get_series_by_years("fwtglobal", range(2008, 2031))
        series_fwt = await client.get_series_by_years("fwt", range(2008, 2031))
        
        # Kombiniere beide Organisationen
        series_data = []
        if series_fwtglobal:
            series_data.extend(series_fwtglobal)
        if series_fwt:
            series_data.extend(series_fwt)
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
        response = {
            "event": event_data['event'],
            "series_rankings": rankings,
            "athletes_count": len(athlete_ids),
            "series_count": len(rankings),
            "message": f"Found rankings for {len(athlete_ids)} athletes across {len(rankings)} series"
        }
        
        logger.info(f"Series rankings for event {event_data['event']['name']}: {len(rankings)} series, {len(athlete_ids)} athletes")
        
        return response
        
    except Exception as e:
        logger.error(f"Error fetching series rankings for event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch series rankings: {str(e)}")

@app.get("/api/athlete/{athlete_id}/results")
async def get_athlete_results(athlete_id: str):
    """Get event results history for a specific athlete"""
    try:
        from api.client import LiveheatsClient
        
        client = LiveheatsClient()
        
        # Get complete FWT series history from both organizations since 2008
        series_fwtglobal = await client.get_series_by_years("fwtglobal", range(2008, 2031))
        series_fwt = await client.get_series_by_years("fwt", range(2008, 2031))
        
        # Kombiniere beide Organisationen
        series_data = []
        if series_fwtglobal:
            series_data.extend(series_fwtglobal)
        if series_fwt:
            series_data.extend(series_fwt)
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
        
        # Sort by date (newest first)
        athlete_results.sort(key=lambda x: x.get("date", ""), reverse=True)
        
        response = {
            "athlete_id": athlete_id,
            "results": athlete_results,
            "total_results": len(athlete_results),
            "message": f"Found {len(athlete_results)} results for athlete"
        }
        
        logger.info(f"Found {len(athlete_results)} results for athlete {athlete_id}")
        return response
        
    except Exception as e:
        logger.error(f"Error fetching results for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch athlete results: {str(e)}")

@app.get("/api/events/multi/{event_id1}/{event_id2}/athletes")
async def get_multi_event_athletes(event_id1: str, event_id2: str):
    """Get combined athletes from two events, sorted by BIB numbers for live commentary"""
    try:
        from api.client import LiveheatsClient
        
        client = LiveheatsClient()
        
        # Fetch both events sequentially to avoid type issues
        try:
            event1_data = await client.get_event_athletes(event_id1)
        except Exception as e:
            logger.error(f"Error fetching event {event_id1}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch event {event_id1}")
        
        try:
            event2_data = await client.get_event_athletes(event_id2)
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

# Commentator Info API Endpoints

@app.get("/api/commentator-info/{athlete_id}")
async def get_commentator_info(athlete_id: str):
    """Get commentator info for a specific athlete"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = await supabase_client.select("commentator_info", "*", {"athlete_id": athlete_id})
        
        if result:
            return {
                "success": True,
                "data": result[0]
            }
        else:
            return {
                "success": True,
                "data": None,
                "message": "No commentator info found for this athlete"
            }
            
    except Exception as e:
        logger.error(f"Error fetching commentator info for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch commentator info: {str(e)}")

@app.post("/api/commentator-info")
async def create_commentator_info(info: CommentatorInfoCreate):
    """Create commentator info for an athlete"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Check if info already exists
        existing = await supabase_client.select("commentator_info", "*", {"athlete_id": info.athlete_id})
        
        if existing:
            raise HTTPException(status_code=409, detail="Commentator info already exists for this athlete")
        
        # Create new record
        result = await supabase_client.insert("commentator_info", info.dict())
        
        return {
            "success": True,
            "data": result[0] if result else None,
            "message": "Commentator info created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create commentator info: {str(e)}")

@app.put("/api/commentator-info/{athlete_id}")
async def update_commentator_info(athlete_id: str, info: CommentatorInfoUpdate):
    """Update commentator info for an athlete"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Check if record exists
        existing = await supabase_client.select("commentator_info", "*", {"athlete_id": athlete_id})
        
        if not existing:
            # Create new record if it doesn't exist
            create_data = CommentatorInfoCreate(athlete_id=athlete_id, **info.dict())
            result = await supabase_client.insert("commentator_info", create_data.dict())
        else:
            # Update existing record
            update_data = {k: v for k, v in info.dict().items() if v is not None}
            result = await supabase_client.update("commentator_info", update_data, {"athlete_id": athlete_id})
        
        return {
            "success": True,
            "data": result[0] if result else None,
            "message": "Commentator info updated successfully"
        }
        
    except Exception as e:
        logger.error(f"Error updating commentator info for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update commentator info: {str(e)}")

@app.delete("/api/commentator-info/{athlete_id}")
async def soft_delete_commentator_info(athlete_id: str):
    """Soft delete commentator info for an athlete"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Use the soft_delete function
        result = await supabase_client.rpc("soft_delete_commentator_info", {"p_athlete_id": athlete_id})
        
        if not result:
            raise HTTPException(status_code=404, detail="Commentator info not found")
        
        return {
            "success": True,
            "message": "Commentator info soft deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error soft deleting commentator info for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete commentator info: {str(e)}")

@app.post("/api/commentator-info/{athlete_id}/restore")
async def restore_commentator_info(athlete_id: str):
    """Restore soft-deleted commentator info for an athlete"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Use the restore function
        result = await supabase_client.rpc("restore_commentator_info", {"p_athlete_id": athlete_id})
        
        if not result:
            raise HTTPException(status_code=404, detail="No deleted commentator info found for this athlete")
        
        return {
            "success": True,
            "message": "Commentator info restored successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restoring commentator info for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to restore commentator info: {str(e)}")

@app.get("/api/commentator-info/deleted")
async def get_deleted_commentator_info():
    """Get all soft-deleted commentator info records"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = await supabase_client.select("deleted_commentator_info", "*")
        
        return {
            "success": True,
            "data": result,
            "total": len(result)
        }
        
    except Exception as e:
        logger.error(f"Error fetching deleted commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch deleted commentator info: {str(e)}")

@app.post("/api/commentator-info/cleanup")
async def cleanup_old_deleted_commentator_info():
    """Clean up old deleted commentator info records (older than 30 days)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = await supabase_client.rpc("cleanup_old_deleted_commentator_info", {})
        
        deleted_count = result if result else 0
        
        return {
            "success": True,
            "deleted_count": deleted_count,
            "message": f"Cleaned up {deleted_count} old deleted records"
        }
        
    except Exception as e:
        logger.error(f"Error cleaning up old deleted commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cleanup old deleted records: {str(e)}")

@app.get("/api/commentator-info")
async def get_all_commentator_info():
    """Get all commentator info records"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = await supabase_client.select("commentator_info", "*")
        
        return {
            "success": True,
            "data": result,
            "total": len(result)
        }
        
    except Exception as e:
        logger.error(f"Error fetching all commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch commentator info: {str(e)}")

@app.get("/api/fullresults")
async def get_all_series():
    """Get all available FWT series with metadata"""
    try:
        from api.client import LiveheatsClient
        
        client = LiveheatsClient()
        
        # Get series from both organizations
        series_fwtglobal = await client.get_series_by_years("fwtglobal", range(2008, 2031))
        series_fwt = await client.get_series_by_years("fwt", range(2008, 2031))
        
        # Combine series
        all_series = []
        if series_fwtglobal:
            all_series.extend(series_fwtglobal)
        if series_fwt:
            all_series.extend(series_fwt)
        
        # Enhance series data with metadata
        enhanced_series = []
        for series in all_series:
            # Extract year from series name
            year_match = re.search(r'\b(20\d{2})\b', series["name"])
            year = int(year_match.group(1)) if year_match else None
            
            # Determine category based on name patterns
            name_lower = series["name"].lower()
            if "qualifier" in name_lower:
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
                "name": series["name"],
                "year": year,
                "category": category
            })
        
        # Sort by year (newest first) then by category
        enhanced_series.sort(key=lambda x: (-(x["year"] or 0), x["category"]))
        
        return {
            "series": enhanced_series,
            "total": len(enhanced_series),
            "categories": list(set(s["category"] for s in enhanced_series)),
            "years": sorted(list(set(s["year"] for s in enhanced_series if s["year"])), reverse=True),
            "message": f"Found {len(enhanced_series)} series"
        }
        
    except Exception as e:
        logger.error(f"Error fetching all series: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch series: {str(e)}")

@app.get("/api/fullresults/{series_id}")
async def get_series_rankings(series_id: str):
    """Get rankings for a specific series with all divisions"""
    try:
        from api.client import LiveheatsClient
        
        client = LiveheatsClient()
        
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
            
            if not divisions:
                return {
                    "series_id": series_id,
                    "series_name": series_info.get("name", "Unknown Series"),
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
            
            return {
                "series_id": series_id,
                "series_name": series_info["name"],
                "divisions": all_rankings,
                "total_athletes": total_athletes,
                "message": f"Found {total_athletes} athletes across {len(all_rankings)} divisions"
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching series rankings for {series_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch series rankings: {str(e)}")

@app.get("/api/commentator-info/export")
async def export_all_commentator_info():
    """Export all commentator info for backup purposes"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = await supabase_client.select("commentator_info", "*")
        
        # Add metadata to the export
        export_data = {
            "export_timestamp": datetime.now().isoformat(),
            "total_records": len(result),
            "version": "1.0",
            "data": result
        }
        
        return export_data
        
    except Exception as e:
        logger.error(f"Error exporting commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export commentator info: {str(e)}")

@app.post("/api/commentator-info/import")
async def import_commentator_info(import_data: dict):
    """Import commentator info from backup file"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Validate import data structure
        if "data" not in import_data:
            raise HTTPException(status_code=400, detail="Invalid import data structure")
        
        imported_count = 0
        updated_count = 0
        errors = []
        
        for record in import_data["data"]:
            try:
                athlete_id = record.get("athlete_id")
                if not athlete_id:
                    errors.append("Missing athlete_id in record")
                    continue
                
                # Check if record already exists
                existing = await supabase_client.select("commentator_info", "*", {"athlete_id": athlete_id})
                
                if existing:
                    # Update existing record
                    update_data = {k: v for k, v in record.items() if k not in ["id", "created_at", "updated_at"]}
                    await supabase_client.update("commentator_info", update_data, {"athlete_id": athlete_id})
                    updated_count += 1
                else:
                    # Insert new record
                    insert_data = {k: v for k, v in record.items() if k not in ["id", "created_at", "updated_at"]}
                    await supabase_client.insert("commentator_info", insert_data)
                    imported_count += 1
                    
            except Exception as e:
                errors.append(f"Error processing record for athlete {athlete_id}: {str(e)}")
        
        return {
            "success": True,
            "imported_count": imported_count,
            "updated_count": updated_count,
            "errors": errors,
            "total_processed": imported_count + updated_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to import commentator info: {str(e)}")

def extract_location_from_name(event_name: str) -> str:
    """Extract location from event name."""
    # Common FWT location patterns
    locations = {
        "Chamonix": "Chamonix, France",
        "Verbier": "Verbier, Switzerland", 
        "Fieberbrunn": "Fieberbrunn, Austria",
        "Kicking Horse": "Kicking Horse, Canada",
        "Revelstoke": "Revelstoke, Canada",
        "Xtreme": "Verbier, Switzerland",
        "Ordino": "Ordino Arcalís, Andorra",
        "Baqueira": "Baqueira Beret, Spain"
    }
    
    for location_key, full_location in locations.items():
        if location_key.lower() in event_name.lower():
            return full_location
    
    # Fallback: try to extract location from event name patterns
    parts = event_name.split(" - ")
    if len(parts) > 1:
        return parts[0].strip()
    
    return "TBD"

if __name__ == "__main__":
    print("Starting FastAPI server on http://localhost:8000")
    uvicorn.run("backend_api:app", host="0.0.0.0", port=8000, reload=True) 