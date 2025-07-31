import sys
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add current directory to Python path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Dict, Any, Optional
import asyncio
from api.client import LiveheatsClient
from datetime import datetime
import uvicorn
import logging
import httpx
import re
from pydantic import BaseModel, Field, validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import secrets
import time

# Rate limiting
limiter = Limiter(key_func=get_remote_address)

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Enhanced logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s - IP: %(ip)s' if hasattr(logging, 'ip') else '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Security: Environment validation
def validate_environment():
    """Validate critical environment variables"""
    required_vars = []  # No required vars for basic functionality
    
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        logger.error(f"Missing required environment variables: {missing_vars}")
        raise RuntimeError(f"Missing environment variables: {missing_vars}")
    
    # Validate Supabase if provided
    supabase_url = os.getenv("SUPABASE_URL", "")
    if supabase_url and not supabase_url.startswith("https://"):
        logger.warning("SUPABASE_URL should use HTTPS")

validate_environment()

# Supabase configuration with validation
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# Input validation schemas
class EventIdSchema(BaseModel):
    event_id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')

class AthleteIdSchema(BaseModel):
    athlete_id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')

# Supabase REST API helper
class SupabaseClient:
    def __init__(self, url: str, key: str):
        if not url or not key:
            raise ValueError("Supabase URL and key are required")
        
        self.url = url.rstrip('/')
        self.key = key
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
    
    async def select(self, table: str, columns: str = "*", filters: dict = None):
        """Select data from table with input validation"""
        # Validate table name
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table):
            raise ValueError("Invalid table name")
        
        url = f"{self.url}/rest/v1/{table}"
        params = {"select": columns}
        
        if filters:
            for key, value in filters.items():
                # Validate filter keys
                if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', key):
                    raise ValueError(f"Invalid filter key: {key}")
                params[f"{key}"] = f"eq.{value}"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase HTTP error: {e.response.status_code}")
            raise HTTPException(status_code=500, detail="Database error")
    
    async def insert(self, table: str, data: dict):
        """Insert data into table with validation"""
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table):
            raise ValueError("Invalid table name")
        
        # Sanitize data
        sanitized_data = self._sanitize_data(data)
        url = f"{self.url}/rest/v1/{table}"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=self.headers, json=sanitized_data)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase HTTP error: {e.response.status_code}")
            raise HTTPException(status_code=500, detail="Database error")
    
    async def update(self, table: str, data: dict, filters: dict):
        """Update data in table with validation"""
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table):
            raise ValueError("Invalid table name")
        
        sanitized_data = self._sanitize_data(data)
        url = f"{self.url}/rest/v1/{table}"
        params = {}
        
        if filters:
            for key, value in filters.items():
                if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', key):
                    raise ValueError(f"Invalid filter key: {key}")
                params[f"{key}"] = f"eq.{value}"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.patch(url, headers=self.headers, params=params, json=sanitized_data)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase HTTP error: {e.response.status_code}")
            raise HTTPException(status_code=500, detail="Database error")
    
    async def rpc(self, function_name: str, params: dict = None):
        """Call RPC function with validation"""
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', function_name):
            raise ValueError("Invalid function name")
        
        url = f"{self.url}/rest/v1/rpc/{function_name}"
        sanitized_params = self._sanitize_data(params or {})
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=self.headers, json=sanitized_params)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase HTTP error: {e.response.status_code}")
            raise HTTPException(status_code=500, detail="Database error")
    
    def _sanitize_data(self, data: dict) -> dict:
        """Sanitize input data"""
        if not isinstance(data, dict):
            return data
        
        sanitized = {}
        for key, value in data.items():
            # Validate key names
            if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', key):
                logger.warning(f"Skipping invalid key: {key}")
                continue
            
            # Basic sanitization for strings
            if isinstance(value, str):
                # Remove potential XSS vectors
                value = re.sub(r'<script[^>]*>.*?</script>', '', value, flags=re.IGNORECASE | re.DOTALL)
                value = value.strip()
                
                # Limit string length
                if len(value) > 10000:
                    value = value[:10000]
            
            sanitized[key] = value
        
        return sanitized

# Initialize Supabase client with error handling
supabase_client: Optional[SupabaseClient] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = SupabaseClient(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        supabase_client = None
else:
    logger.warning("Supabase credentials not provided. Commentator info features will be disabled.")

# Enhanced Pydantic models with validation
class CommentatorInfoCreate(BaseModel):
    athlete_id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    homebase: Optional[str] = Field(None, max_length=200)
    team: Optional[str] = Field(None, max_length=200)
    sponsors: Optional[str] = Field(None, max_length=1000)
    favorite_trick: Optional[str] = Field(None, max_length=200)
    achievements: Optional[str] = Field(None, max_length=2000)
    injuries: Optional[str] = Field(None, max_length=2000)
    fun_facts: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)
    social_media: Optional[Dict[str, str]] = Field(None)
    
    @validator('social_media')
    def validate_social_media(cls, v):
        if v is None:
            return v
        
        allowed_keys = {'instagram', 'youtube', 'website', 'facebook', 'tiktok'}
        for key in v.keys():
            if key not in allowed_keys:
                raise ValueError(f"Invalid social media key: {key}")
            if not isinstance(v[key], str) or len(v[key]) > 500:
                raise ValueError(f"Invalid social media URL for {key}")
        
        return v

class CommentatorInfoUpdate(BaseModel):
    homebase: Optional[str] = Field(None, max_length=200)
    team: Optional[str] = Field(None, max_length=200)
    sponsors: Optional[str] = Field(None, max_length=1000)
    favorite_trick: Optional[str] = Field(None, max_length=200)
    achievements: Optional[str] = Field(None, max_length=2000)
    injuries: Optional[str] = Field(None, max_length=2000)
    fun_facts: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)
    social_media: Optional[Dict[str, str]] = Field(None)
    
    @validator('social_media')
    def validate_social_media(cls, v):
        if v is None:
            return v
        
        allowed_keys = {'instagram', 'youtube', 'website', 'facebook', 'tiktok'}
        for key in v.keys():
            if key not in allowed_keys:
                raise ValueError(f"Invalid social media key: {key}")
            if not isinstance(v[key], str) or len(v[key]) > 500:
                raise ValueError(f"Invalid social media URL for {key}")
        
        return v

# Security middleware
async def log_request(request: Request):
    """Log all requests for security monitoring"""
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    logger.info(f"Request: {request.method} {request.url.path} - IP: {client_ip} - UA: {user_agent}")
    
    # Simple anomaly detection
    suspicious_patterns = [
        r'<script',
        r'javascript:',
        r'\.\./\.\.',
        r'union\s+select',
        r'drop\s+table'
    ]
    
    for pattern in suspicious_patterns:
        if re.search(pattern, str(request.url), re.IGNORECASE):
            logger.warning(f"Suspicious request pattern detected: {pattern} - IP: {client_ip}")

app = FastAPI(
    title="FWT Events API", 
    version="1.0.0",
    docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url="/redoc" if os.getenv("ENVIRONMENT") != "production" else None
)

# Add rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Enhanced CORS Setup
allowed_origins = [
    "http://localhost:3000",  # Next.js dev server
    "https://fwt-dashboard-1.onrender.com",  # Production frontend
]

# Add additional origins from environment
additional_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
allowed_origins.extend([origin.strip() for origin in additional_origins if origin.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining"]
)

# Security: Add request logging middleware
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    start_time = time.time()
    
    # Log request
    await log_request(request)
    
    response = await call_next(request)
    
    # Add security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    # Log response time
    process_time = time.time() - start_time
    logger.info(f"Request processed in {process_time:.4f}s")
    
    return response

@app.get("/")
@limiter.limit("10/minute")
async def root(request: Request):
    return {"message": "FWT Events API is running", "version": "1.0.0", "status": "healthy"}

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "supabase_available": supabase_client is not None
    }

@app.get("/api/events")
@limiter.limit("30/minute")
async def get_future_events(request: Request, include_past: bool = False):
    """Get FWT events for event selection."""
    try:
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
        
        return {
            "events": formatted_events,
            "total": len(formatted_events),
            "message": f"Found {len(formatted_events)} future events"
        }
        
    except Exception as e:
        logger.error(f"Error fetching events: {e}")
        raise HTTPException(
            status_code=500, 
            detail="Failed to fetch events"
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


def extract_event_location(event_name: str) -> str:
    """
    Extract location from event name with improved pattern matching
    Handles various FWT event naming conventions
    """
    import re
    
    # Known location mappings for better accuracy
    location_mappings = {
        "chamonix": "Chamonix",
        "verbier": "Verbier", 
        "fieberbrunn": "Fieberbrunn",
        "kicking horse": "Kicking Horse",
        "revelstoke": "Revelstoke",
        "xtreme": "Verbier",  # Special case: Xtreme = Verbier
        "ordino": "Ordino",
        "baqueira": "Baqueira",
        "obertauern": "Obertauern",
        "la clusaz": "La Clusaz",
        "andorra": "Ordino"
    }
    
    # Normalize event name
    normalized = event_name.strip()
    normalized = re.sub(r'^(FWT\s*-?\s*)', '', normalized, flags=re.IGNORECASE)
    normalized = re.sub(r'^(IFSA\s*-?\s*)', '', normalized, flags=re.IGNORECASE)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    # Check for non-location events (championships, rankings, etc.)
    non_location_patterns = [
        r"freeride'?her",
        r"world championship",
        r"qualifying list",
        r"national rankings",
        r"challenger by \w+",
        r"region \d+ [a-z-]+"
    ]
    
    name_lower = normalized.lower()
    for pattern in non_location_patterns:
        if re.search(pattern, name_lower):
            return "Generic"  # No specific location
    
    # Try exact location matching first
    for location_key, location_name in location_mappings.items():
        if location_key in name_lower:
            return location_name
    
    # Pattern-based extraction for various naming formats
    location_patterns = [
        # Pattern 1: Year followed by location (e.g., "2025 Obertauern Challenger")
        r'^\d{4}\s+([A-Za-z][A-Za-z\s]+?)(?:\s+(?:Challenger|Qualifier|Open|Freeride|by))',
        
        # Pattern 2: Location followed by year (e.g., "Chamonix 2025") 
        r'^([A-Za-z][A-Za-z\s]+?)\s+\d{4}',
        
        # Pattern 3: FWT style (e.g., "FWT - Chamonix 2025")
        r'^([A-Za-z][A-Za-z\s]+?)\s+\d{4}',
        
        # Pattern 4: Location with context words
        r'(?:Freeride\s+Week\s+(?:at\s+)?)?([A-Za-z][A-Za-z\s]+?)(?:\s+(?:Challenger|Qualifier|by|Freeride))',
        
        # Pattern 5: Simple location at start
        r'^([A-Za-z][A-Za-z\s]{2,}?)(?:\s+(?:Open|Faces|Week))'
    ]
    
    for pattern in location_patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            location = match.group(1).strip()
            
            # Filter out common non-location words
            excluded_words = ['open', 'freeride', 'week', 'by', 'faces', 'the', 'and', 'of', 'in']
            if location.lower() not in excluded_words and len(location) > 2:
                # Clean up the location
                location = re.sub(r'\s+', ' ', location).strip()
                return location
    
    # Fallback: try to find any reasonable location-like word
    words = normalized.split()
    for word in words:
        if (len(word) > 3 and 
            word.isalpha() and 
            word.lower() not in ['open', 'freeride', 'week', 'faces', 'challenger', 'qualifier'] and
            not re.match(r'^\d+\*?$', word)):  # Not a number or star rating
            return word
    
    return "Unknown"

def normalize_event_for_matching(event_name: str) -> str:
    """
    Normalize event name for historical matching
    Removes: years, sponsors, organizations but keeps: location, event type, star rating
    """
    import re
    
    normalized = event_name.strip()
    
    # Remove year (2024, 2025, etc.)
    normalized = re.sub(r'\b20\d{2}\b', '', normalized)
    
    # Remove organization prefixes
    normalized = re.sub(r'^(FWT\s*-?\s*|IFSA\s*-?\s*)', '', normalized, flags=re.IGNORECASE)
    
    # Remove sponsor parts - more flexible patterns
    # Pattern 1: "by [Sponsor Name]" before event type
    normalized = re.sub(r'\s+by\s+[A-Za-z][A-Za-z\s&]+?(?=\s+(?:Qualifier|Challenger|Open|Championship|$))', '', normalized, flags=re.IGNORECASE)
    
    # Pattern 2: Sponsor at the beginning (e.g., "Dynastar Verbier Qualifier")
    # But be careful not to remove location names
    words = normalized.split()
    if len(words) > 2:
        # If first word looks like a brand and second word looks like location, remove first
        first_word = words[0].lower()
        known_sponsors = ['dynastar', 'salomon', 'atomic', 'rossignol', 'volkl', 'k2', 'peak', 'performance', 'orage', 'north', 'face']
        if any(sponsor in first_word for sponsor in known_sponsors):
            normalized = ' '.join(words[1:])
    
    # Clean up extra whitespace and normalize
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    # Convert to lowercase for comparison
    return normalized.lower()

def calculate_event_core_similarity(event1_norm: str, event2_norm: str) -> float:
    """
    Calculate similarity between normalized event names
    Focus on core components: location, event type, star rating
    """
    import re
    
    # Extract key components
    def extract_core_components(name):
        components = {
            'words': set(word for word in name.split() if len(word) > 2),
            'star_rating': re.findall(r'\d+\*', name),
            'event_type': [],
            'has_qualifier': 'qualifier' in name,
            'has_challenger': 'challenger' in name,
            'has_open': 'open' in name,
            'has_faces': 'faces' in name,
            'has_week': 'week' in name,
            'has_freeride': 'freeride' in name
        }
        
        # Extract event type keywords
        event_keywords = ['qualifier', 'challenger', 'open', 'faces', 'week', 'championship', 'freeride']
        for keyword in event_keywords:
            if keyword in name:
                components['event_type'].append(keyword)
        
        return components
    
    comp1 = extract_core_components(event1_norm)
    comp2 = extract_core_components(event2_norm)
    
    # Calculate similarity score
    total_score = 0
    max_score = 0
    
    # Word overlap (most important)
    if comp1['words'] and comp2['words']:
        word_overlap = len(comp1['words'].intersection(comp2['words'])) / len(comp1['words'].union(comp2['words']))
        total_score += word_overlap * 4  # Weight: 4
        max_score += 4
    
    # Star rating must match exactly (very important)
    if comp1['star_rating'] == comp2['star_rating']:
        total_score += 2
    max_score += 2
    
    # Event type similarity
    event_type_overlap = len(set(comp1['event_type']).intersection(set(comp2['event_type']))) / max(len(set(comp1['event_type']).union(set(comp2['event_type']))), 1)
    total_score += event_type_overlap * 2  # Weight: 2
    max_score += 2
    
    # Boolean features
    boolean_features = ['has_qualifier', 'has_challenger', 'has_open', 'has_faces', 'has_week', 'has_freeride']
    matching_booleans = sum(1 for feature in boolean_features if comp1[feature] == comp2[feature])
    total_score += (matching_booleans / len(boolean_features)) * 1  # Weight: 1
    max_score += 1
    
    return total_score / max_score if max_score > 0 else 0

def events_match_historically(current_event: str, historical_event: str) -> bool:
    """
    Check if events are the same across years with sponsor flexibility
    Returns True if they represent the same event in different years
    """
    # Quick check: if events are identical, they're definitely not historical matches
    if current_event == historical_event:
        return False
    
    # Normalize both event names
    current_norm = normalize_event_for_matching(current_event)
    historical_norm = normalize_event_for_matching(historical_event)
    
    # Exact match after normalization (most common case)
    if current_norm == historical_norm:
        return True
    
    # Flexible matching for slight variations
    similarity = calculate_event_core_similarity(current_norm, historical_norm)
    
    # High threshold to ensure we only match very similar events
    return similarity > 0.85


def extract_year_from_name(event_name: str) -> int:
    """Extract year from event name"""
    import re
    match = re.search(r'\b(20\d{2})\b', event_name)
    return int(match.group(1)) if match else 0

def is_main_series(series_name: str) -> bool:
    """Check if series is a main series (Pro Tour, World Tour) to avoid duplicates"""
    name_lower = series_name.lower()
    return any(keyword in name_lower for keyword in [
        "pro tour", "world tour", "freeride world tour"
    ]) and not any(keyword in name_lower for keyword in [
        "qualifier", "challenger", "junior"
    ])

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