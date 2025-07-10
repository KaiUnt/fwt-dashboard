import sys
import os
# Add current directory to Python path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Dict, Any
import asyncio
from api.client import LiveheatsClient
from datetime import datetime
import uvicorn
import logging

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
async def get_future_events():
    """Get all future FWT events for event selection."""
    try:
        from api.client import LiveheatsClient
        client = LiveheatsClient()
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