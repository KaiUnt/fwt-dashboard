import sys
import os
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
from supabase import create_client, Client
from pydantic import BaseModel

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# Initialize Supabase client if credentials are provided
supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        supabase = None
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
    allow_origins=["http://localhost:3000"],  # Next.js dev server
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
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = supabase.table("commentator_info").select("*").eq("athlete_id", athlete_id).execute()
        
        if result.data:
            return {
                "success": True,
                "data": result.data[0]
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
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Check if info already exists
        existing = supabase.table("commentator_info").select("*").eq("athlete_id", info.athlete_id).execute()
        
        if existing.data:
            raise HTTPException(status_code=409, detail="Commentator info already exists for this athlete")
        
        # Create new record
        result = supabase.table("commentator_info").insert(info.dict()).execute()
        
        return {
            "success": True,
            "data": result.data[0],
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
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Check if record exists
        existing = supabase.table("commentator_info").select("*").eq("athlete_id", athlete_id).execute()
        
        if not existing.data:
            # Create new record if it doesn't exist
            create_data = CommentatorInfoCreate(athlete_id=athlete_id, **info.dict())
            result = supabase.table("commentator_info").insert(create_data.dict()).execute()
        else:
            # Update existing record
            update_data = {k: v for k, v in info.dict().items() if v is not None}
            result = supabase.table("commentator_info").update(update_data).eq("athlete_id", athlete_id).execute()
        
        return {
            "success": True,
            "data": result.data[0],
            "message": "Commentator info updated successfully"
        }
        
    except Exception as e:
        logger.error(f"Error updating commentator info for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update commentator info: {str(e)}")

@app.delete("/api/commentator-info/{athlete_id}")
async def soft_delete_commentator_info(athlete_id: str):
    """Soft delete commentator info for an athlete"""
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Use the soft_delete function
        result = supabase.rpc("soft_delete_commentator_info", params={"p_athlete_id": athlete_id}).execute()
        
        if not result.data:
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
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Use the restore function
        result = supabase.rpc("restore_commentator_info", params={"p_athlete_id": athlete_id}).execute()
        
        if not result.data:
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
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = supabase.table("deleted_commentator_info").select("*").execute()
        
        return {
            "success": True,
            "data": result.data,
            "total": len(result.data)
        }
        
    except Exception as e:
        logger.error(f"Error fetching deleted commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch deleted commentator info: {str(e)}")

@app.post("/api/commentator-info/cleanup")
async def cleanup_old_deleted_commentator_info():
    """Clean up old deleted commentator info records (older than 30 days)"""
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = supabase.rpc("cleanup_old_deleted_commentator_info", params={}).execute()
        
        deleted_count = result.data if result.data else 0
        
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
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = supabase.table("commentator_info").select("*").execute()
        
        return {
            "success": True,
            "data": result.data,
            "total": len(result.data)
        }
        
    except Exception as e:
        logger.error(f"Error fetching all commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch commentator info: {str(e)}")

@app.get("/api/commentator-info/export")
async def export_all_commentator_info():
    """Export all commentator info for backup purposes"""
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = supabase.table("commentator_info").select("*").execute()
        
        # Add metadata to the export
        export_data = {
            "export_timestamp": datetime.now().isoformat(),
            "total_records": len(result.data),
            "version": "1.0",
            "data": result.data
        }
        
        return export_data
        
    except Exception as e:
        logger.error(f"Error exporting commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export commentator info: {str(e)}")

@app.post("/api/commentator-info/import")
async def import_commentator_info(import_data: dict):
    """Import commentator info from backup file"""
    if not supabase:
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
                existing = supabase.table("commentator_info").select("*").eq("athlete_id", athlete_id).execute()
                
                if existing.data:
                    # Update existing record
                    update_data = {k: v for k, v in record.items() if k not in ["id", "created_at", "updated_at"]}
                    supabase.table("commentator_info").update(update_data).eq("athlete_id", athlete_id).execute()
                    updated_count += 1
                else:
                    # Insert new record
                    insert_data = {k: v for k, v in record.items() if k not in ["id", "created_at", "updated_at"]}
                    supabase.table("commentator_info").insert(insert_data).execute()
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
    print("🚀 Starting FastAPI server on http://localhost:8000")
    uvicorn.run("backend_api:app", host="0.0.0.0", port=8000, reload=True) 