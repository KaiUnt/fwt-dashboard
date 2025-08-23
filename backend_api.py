import sys
import os
from dotenv import load_dotenv

# Load environment variables - use .env.local for development, .env for production
if os.path.exists("frontend/.env.local"):
    # Development mode - load frontend/.env.local first
    load_dotenv("frontend/.env.local")
else:
    # Production mode - load .env
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
from datetime import timedelta
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
import jwt
import json
try:
    import redis.asyncio as redis
except Exception:
    redis = None

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
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    if supabase_url and not supabase_url.startswith("https://"):
        logger.warning("SUPABASE_URL should use HTTPS")

validate_environment()

# Supabase configuration with validation
SUPABASE_URL = os.getenv("SUPABASE_URL", os.getenv("NEXT_PUBLIC_SUPABASE_URL", ""))
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""))

# JWT token security
security = HTTPBearer(auto_error=True)

def get_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract raw user JWT token from credentials"""
    if not credentials or not credentials.credentials:
        logger.error("No credentials provided")
        raise HTTPException(status_code=401, detail="Authorization token required")
    
    return credentials.credentials

def extract_user_id_from_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract user ID from Supabase JWT token"""
    try:
        if not credentials or not credentials.credentials:
            raise HTTPException(status_code=401, detail="Authorization token required")
        
        token = credentials.credentials
        token_parts = token.split('.')
        
        if len(token_parts) != 3:
            raise HTTPException(status_code=401, detail="Invalid token format")
        
        # Decode the payload (second part)
        payload = token_parts[1]
        
        # Add padding if needed for base64 decoding
        padding_needed = 4 - len(payload) % 4
        if padding_needed != 4:
            payload += '=' * padding_needed
        
        # Decode base64
        import base64
        
        try:
            decoded_payload = base64.urlsafe_b64decode(payload).decode('utf-8')
            token_data = json.loads(decoded_payload)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token encoding")
        
        # Extract user ID (usually 'sub' field in JWT)
        user_id = token_data.get('sub')
        
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found in token")
        
        # Validate user_id format (should be UUID for Supabase)
        if not isinstance(user_id, str) or len(user_id.strip()) == 0:
            raise HTTPException(status_code=401, detail="Invalid user ID format")
        
        # Check token expiration
        exp = token_data.get('exp')
        if exp:
            import time
            current_time = int(time.time())
            if current_time > exp:
                raise HTTPException(status_code=401, detail="Token has expired")
        
        return user_id.strip()
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        raise HTTPException(status_code=500, detail="Authentication processing failed")

# Input validation schemas
class EventIdSchema(BaseModel):
    event_id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')

class AthleteIdSchema(BaseModel):
    athlete_id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')

# Friends System Models
class FriendRequestCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=30)
    
    @validator('username')
    def validate_username(cls, v):
        # Username validation rules
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError('Username can only contain letters, numbers, underscores, and hyphens')
        if re.match(r'^[0-9]+$', v):
            raise ValueError('Username cannot be only numbers')
        if re.match(r'^[_-]', v) or re.match(r'[_-]$', v):
            raise ValueError('Username cannot start or end with underscore or hyphen')
        if v.lower() in ['admin', 'administrator', 'root', 'system', 'api', 'www', 'ftp', 'mail', 'test', 'user', 'guest', 'null', 'undefined']:
            raise ValueError('This username is reserved')
        return v.strip()

class FriendRequestResponse(BaseModel):
    id: str
    requester_id: str
    addressee_id: str
    status: str
    created_at: str
    updated_at: str

class UserProfile(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    organization: str
    is_active: bool
    created_at: str
    updated_at: str

class CommentatorInfoWithAuthor(BaseModel):
    id: str
    athlete_id: str
    homebase: Optional[str]
    team: Optional[str]
    sponsors: Optional[str]
    favorite_trick: Optional[str]
    achievements: Optional[str]
    injuries: Optional[str]
    fun_facts: Optional[str]
    notes: Optional[str]
    social_media: Optional[Dict[str, str]]
    custom_fields: Optional[Dict[str, Any]]
    created_at: str
    updated_at: str
    deleted_at: Optional[str]
    created_by: Optional[str]
    author_name: Optional[str]
    is_own_data: bool

# Supabase REST API helper
class SupabaseClient:
    def __init__(self, url: str, key: str):
        if not url or not key:
            raise ValueError("Supabase URL and key are required")
        
        self.url = url.rstrip('/')
        self.key = key  # This is the anon key for public access
        
    def _get_headers(self, user_token: Optional[str] = None):
        """Get headers for Supabase request, preferring user token for RLS"""
        headers = {
            "apikey": self.key,  # Always required
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
        
        if user_token:
            # Use user JWT token for RLS-enabled operations
            headers["Authorization"] = f"Bearer {user_token}"
        else:
            # Fall back to service key for non-RLS operations
            headers["Authorization"] = f"Bearer {self.key}"
        
        return headers
    
    async def select(self, table: str, columns: str = "*", filters: dict = None, user_token: Optional[str] = None):
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
        
        headers = self._get_headers(user_token)
        
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=headers, params=params)
                if response.status_code != 200:
                    logger.error(f"Supabase error response: {response.text}")
                
                response.raise_for_status()
                result = response.json()
                return result
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase HTTP error: {e.response.status_code} - {e.response.text}")
            if e.response.status_code == 401:
                raise HTTPException(status_code=401, detail="Database authentication failed - user token may be invalid")
            raise HTTPException(status_code=500, detail="Database error")
    
    async def insert(self, table: str, data: dict, user_token: Optional[str] = None):
        """Insert data into table with validation"""
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table):
            raise ValueError("Invalid table name")
        
        # Sanitize data
        sanitized_data = self._sanitize_data(data)
        url = f"{self.url}/rest/v1/{table}"
        headers = self._get_headers(user_token)
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=headers, json=sanitized_data)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase HTTP error: {e.response.status_code} - {e.response.text}")
            if e.response.status_code == 401:
                raise HTTPException(status_code=401, detail="Database authentication failed - user token may be invalid")
            raise HTTPException(status_code=500, detail="Database error")
    
    async def update(self, table: str, data: dict, filters: dict, user_token: Optional[str] = None):
        """Update data in table with validation"""
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table):
            raise ValueError("Invalid table name")
        
        sanitized_data = self._sanitize_data(data)
        url = f"{self.url}/rest/v1/{table}"
        params = {}
        headers = self._get_headers(user_token)
        
        if filters:
            for key, value in filters.items():
                if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', key):
                    raise ValueError(f"Invalid filter key: {key}")
                params[f"{key}"] = f"eq.{value}"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.patch(url, headers=headers, params=params, json=sanitized_data)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase HTTP error: {e.response.status_code} - {e.response.text}")
            if e.response.status_code == 401:
                raise HTTPException(status_code=401, detail="Database authentication failed - user token may be invalid")
            raise HTTPException(status_code=500, detail="Database error")
    
    async def rpc(self, function_name: str, params: dict = None, user_token: Optional[str] = None):
        """Call RPC function with validation"""
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', function_name):
            raise ValueError("Invalid function name")
        
        url = f"{self.url}/rest/v1/rpc/{function_name}"
        sanitized_params = self._sanitize_data(params or {})
        headers = self._get_headers(user_token)
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=headers, json=sanitized_params)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException:
            logger.error("Supabase request timeout")
            raise HTTPException(status_code=504, detail="Database request timeout")
        except httpx.HTTPStatusError as e:
            logger.error(f"Supabase HTTP error: {e.response.status_code}")
            raise HTTPException(status_code=500, detail="Database error")

    async def delete(self, table: str, filters: dict, user_token: Optional[str] = None):
        """Delete data from table with validation"""
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table):
            raise ValueError("Invalid table name")
        
        url = f"{self.url}/rest/v1/{table}"
        params = {}
        headers = self._get_headers(user_token)
        
        if filters:
            for key, value in filters.items():
                if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', key):
                    raise ValueError(f"Invalid filter key: {key}")
                params[f"{key}"] = f"eq.{value}"
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.delete(url, headers=headers, params=params)
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
    custom_fields: Optional[Dict[str, Any]] = Field(None)
    
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

    @validator('custom_fields')
    def validate_custom_fields(cls, v):
        if v is None:
            return v
        
        # Validate custom fields structure
        if not isinstance(v, dict):
            raise ValueError("Custom fields must be a dictionary")
        
        # Limit number of custom fields
        if len(v) > 50:
            raise ValueError("Too many custom fields (max 50 allowed)")
        
        # Validate keys and values
        for key, value in v.items():
            if not isinstance(key, str) or len(key) > 100:
                raise ValueError(f"Invalid custom field key: {key}")
            if not isinstance(value, (str, int, float, bool)) or (isinstance(value, str) and len(value) > 1000):
                raise ValueError(f"Invalid custom field value for {key}")
        
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
    custom_fields: Optional[Dict[str, Any]] = Field(None)
    
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

    @validator('custom_fields')
    def validate_custom_fields(cls, v):
        if v is None:
            return v
        
        # Validate custom fields structure
        if not isinstance(v, dict):
            raise ValueError("Custom fields must be a dictionary")
        
        # Limit number of custom fields
        if len(v) > 50:
            raise ValueError("Too many custom fields (max 50 allowed)")
        
        # Validate keys and values
        for key, value in v.items():
            if not isinstance(key, str) or len(key) > 100:
                raise ValueError(f"Invalid custom field key: {key}")
            if not isinstance(value, (str, int, float, bool)) or (isinstance(value, str) and len(value) > 1000):
                raise ValueError(f"Invalid custom field value for {key}")
        
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
async def get_future_events(
    request: Request, 
    current_user_id: str = Depends(extract_user_id_from_token),
    include_past: bool = False, 
    force_refresh: bool = False
):
    """Get FWT events for event selection."""
    try:
        # Prefer Redis shared cache if available, otherwise fallback to per-process memory cache
        cache_key = f"events:{'all' if include_past else 'future'}"
        ttl_seconds = int(os.getenv("EVENTS_TTL_SECONDS", "3600"))
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        redis_client = None
        if redis is not None:
            try:
                if not hasattr(request.app.state, "_redis_client") or request.app.state._redis_client is None:
                    request.app.state._redis_client = redis.from_url(redis_url, decode_responses=True)
                redis_client = request.app.state._redis_client
            except Exception as e:
                logger.warning(f"Redis init failed, falling back to in-memory cache: {e}")
                redis_client = None

        if redis_client and not force_refresh:
            try:
                cached_json = await redis_client.get(cache_key)
                if cached_json:
                    try:
                        payload = json.loads(cached_json)
                    except Exception:
                        payload = None
                    ttl_remaining = await redis_client.ttl(cache_key)
                    if payload is not None and ttl_remaining and ttl_remaining > 0:
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
        # Write to Redis if available, otherwise to in-memory cache
        if redis_client:
            try:
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(payload))
            except Exception as e:
                logger.warning(f"Redis write failed, using in-memory cache: {e}")
                cache_store[cache_key] = (payload, now_ts)
        else:
            cache_store[cache_key] = (payload, now_ts)

        response = JSONResponse(content=payload)
        response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
        return response
        
    except Exception as e:
        logger.error(f"Error fetching events: {e}")
        raise HTTPException(
            status_code=500, 
            detail="Failed to fetch events"
        )

@app.get("/api/events/{event_id}/athletes")
async def get_event_athletes(
    event_id: str, 
    request: Request, 
    current_user_id: str = Depends(extract_user_id_from_token),
    force_refresh: bool = False
):
    """Get all athletes for a specific event"""
    try:
        # Import the LiveHeats client
        from api.client import LiveheatsClient

        client = LiveheatsClient()

        # Redis-backed cache for event athletes
        ttl_seconds = int(os.getenv("EVENTS_TTL_SECONDS", "3600"))
        cache_key = f"eventAthletes:{event_id}"
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        redis_client = None
        if redis is not None:
            try:
                if not hasattr(request.app.state, "_redis_client") or request.app.state._redis_client is None:
                    request.app.state._redis_client = redis.from_url(redis_url, decode_responses=True)
                redis_client = request.app.state._redis_client
            except Exception as e:
                logger.warning(f"Redis init failed for event athletes: {e}")
                redis_client = None

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
        # Write to cache
        if redis_client:
            try:
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(result))
            except Exception as e:
                logger.warning(f"Redis write failed for {cache_key}: {e}")

        response = JSONResponse(content=result)
        response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
        return response
        
    except Exception as e:
        logger.error(f"Error fetching athletes for event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch event athletes: {str(e)}")

@app.get("/api/series/rankings/{event_id}")
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
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        redis_client = None
        if redis is not None:
            try:
                if not hasattr(request.app.state, "_redis_client") or request.app.state._redis_client is None:
                    request.app.state._redis_client = redis.from_url(redis_url, decode_responses=True)
                redis_client = request.app.state._redis_client
            except Exception as e:
                logger.warning(f"Redis init failed, continuing without cache: {e}")
                redis_client = None

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
        response = {
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
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(response))
            except Exception as e:
                logger.warning(f"Redis write failed for {cache_key}: {e}")

        json_response = JSONResponse(content=response)
        json_response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
        return json_response
        
    except Exception as e:
        logger.error(f"Error fetching series rankings for event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch series rankings: {str(e)}")

@app.get("/api/athlete/{athlete_id}/results")
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
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        redis_client = None
        if redis is not None:
            try:
                if not hasattr(request.app.state, "_redis_client") or request.app.state._redis_client is None:
                    request.app.state._redis_client = redis.from_url(redis_url, decode_responses=True)
                redis_client = request.app.state._redis_client
            except Exception as e:
                logger.warning(f"Redis init failed, continuing without cache: {e}")
                redis_client = None

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
        
        # Sort by date (newest first)
        athlete_results.sort(key=lambda x: x.get("date", ""), reverse=True)
        
        response = {
            "athlete_id": athlete_id,
            "results": athlete_results,
            "total_results": len(athlete_results),
            "message": f"Found {len(athlete_results)} results for athlete"
        }
        
        logger.info(f"Found {len(athlete_results)} results for athlete {athlete_id}")
        if redis_client:
            try:
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(response))
            except Exception as e:
                logger.warning(f"Redis write failed for {cache_key}: {e}")

        json_response = JSONResponse(content=response)
        json_response.headers["Cache-Control"] = f"public, max-age={ttl_seconds}"
        return json_response
        
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
async def get_multi_event_athletes(
    event_id1: str, 
    event_id2: str,
    current_user_id: str = Depends(extract_user_id_from_token)
):
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
async def get_commentator_info(
    athlete_id: str,
    user_token: str = Depends(get_user_token)
):
    """Get commentator info for a specific athlete with user token"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Use user token for RLS policy enforcement
        result = await supabase_client.select("commentator_info", "*", {"athlete_id": athlete_id}, user_token=user_token)
        
        if result:
            logger.info(f"Found commentator info for athlete {athlete_id}")
            return {
                "success": True,
                "data": result[0]
            }
        else:
            logger.info(f"No commentator info found for athlete {athlete_id}")
            return {
                "success": True,
                "data": None,
                "message": "No commentator info found for this athlete"
            }
            
    except Exception as e:
        logger.error(f"Error fetching commentator info for athlete {athlete_id}: {e}")
        logger.error(f"Exception type: {type(e)}")
        logger.error(f"Exception details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch commentator info: {str(e)}")

@app.post("/api/commentator-info")
async def create_commentator_info(
    info: CommentatorInfoCreate,
    current_user_id: str = Depends(extract_user_id_from_token)
):
    """Create commentator info for an athlete"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Check if info already exists
        existing = await supabase_client.select("commentator_info", "*", {"athlete_id": info.athlete_id})
        
        if existing:
            raise HTTPException(status_code=409, detail="Commentator info already exists for this athlete")
        
        # Add user info to the data
        info_data = info.dict()
        info_data["created_by"] = current_user_id
        
        # Get user profile for author name
        user_profile = await supabase_client.select("user_profiles", "full_name", {"id": current_user_id})
        if user_profile:
            info_data["author_name"] = user_profile[0]["full_name"]
        
        # Create new record
        result = await supabase_client.insert("commentator_info", info_data)
        
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
async def update_commentator_info(
    athlete_id: str, 
    info: CommentatorInfoUpdate,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Update commentator info for an athlete with user token forwarding"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        logger.info(f"Updating commentator info for athlete {athlete_id} with user token")
        
        # Check if record exists for this user specifically (not friends' data)
        existing = await supabase_client.select("commentator_info", "*", {
            "athlete_id": athlete_id, 
            "created_by": current_user_id
        }, user_token=user_token)
        
        if not existing:
            # Create new record if it doesn't exist
            create_data = CommentatorInfoCreate(athlete_id=athlete_id, **info.dict())
            create_data_dict = create_data.dict()
            create_data_dict["created_by"] = current_user_id
            
            # Get user profile for author name (using user token)
            user_profile = await supabase_client.select("user_profiles", "full_name", {"id": current_user_id}, user_token=user_token)
            if user_profile:
                create_data_dict["author_name"] = user_profile[0]["full_name"]
            
            result = await supabase_client.insert("commentator_info", create_data_dict, user_token=user_token)
        else:
            # Update existing record (using user token for RLS)
            update_data = {k: v for k, v in info.dict().items() if v is not None}
            result = await supabase_client.update("commentator_info", update_data, {"athlete_id": athlete_id}, user_token=user_token)
        
        logger.info(f"Successfully updated commentator info for athlete {athlete_id}")
        
        response_data = {
            "success": True,
            "data": result[0] if result else None,
            "message": "Commentator info updated successfully"
        }
        
        return response_data
        
    except HTTPException as http_ex:
        # Re-raise HTTP exceptions (including 401 from Supabase)
        logger.error(f"HTTP error updating commentator info for athlete {athlete_id}: {http_ex.status_code} - {http_ex.detail}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error updating commentator info for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update commentator info: {str(e)}")

@app.delete("/api/commentator-info/{athlete_id}")
async def soft_delete_commentator_info(
    athlete_id: str,
    current_user_id: str = Depends(extract_user_id_from_token)
):
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
async def restore_commentator_info(
    athlete_id: str,
    current_user_id: str = Depends(extract_user_id_from_token)
):
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
async def get_deleted_commentator_info(
    current_user_id: str = Depends(extract_user_id_from_token)
):
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
async def cleanup_old_deleted_commentator_info(
    current_user_id: str = Depends(extract_user_id_from_token)
):
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
async def get_all_commentator_info(
    current_user_id: str = Depends(extract_user_id_from_token)
):
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

# Friends System APIs

@app.get("/api/users/check-username/{username}")
async def check_username_availability(
    username: str,
    current_user_id: str = Depends(extract_user_id_from_token)
):
    """Check if a username/full name is available.
    Allows letters (incl. Unicode), numbers, spaces, dots, underscores and hyphens, 2-30 chars.
    """
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Normalize
        candidate = username.strip()
        
        # Validate format (allow spaces and dots now)
        if len(candidate) < 2 or len(candidate) > 30:
            return {"available": False, "reason": "Name must be between 2 and 30 characters"}
        
        # Allow unicode letters/digits via \w, plus space and dot and hyphen
        if not re.match(r'^[\w .-]+$', candidate, flags=re.UNICODE):
            return {"available": False, "reason": "Name can include letters, numbers, spaces, dots, underscores and hyphens"}
        
        if re.match(r'^[0-9]+$', candidate):
            return {"available": False, "reason": "Name cannot be only numbers"}
        
        reserved_names = ['admin', 'administrator', 'root', 'system', 'api', 'www', 'ftp', 'mail', 'test', 'user', 'guest', 'null', 'undefined']
        if candidate.lower() in reserved_names:
            return {"available": False, "reason": "This name is reserved"}
        
        # Check if username exists (case-insensitive)
        existing_user = await supabase_client.select("user_profiles", "id", {"full_name": candidate})
        
        if existing_user:
            return {"available": False, "reason": "Name is already taken"}
        
        return {"available": True, "reason": "Username is available"}
        
    except Exception as e:
        logger.error(f"Error checking username availability: {e}")
        raise HTTPException(status_code=500, detail="Failed to check username availability")

@app.post("/api/friends/request")
@limiter.limit("10/minute")
async def create_friend_request(
    request: Request, 
    friend_request: FriendRequestCreate,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Send a friend request to another user by username"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Find user by username - now possible with RLS policy for username lookups
        user_result = await supabase_client.select("user_profiles", "*", {"full_name": friend_request.username}, user_token)
        
        if not user_result:
            raise HTTPException(status_code=404, detail="User not found")
        
        target_user = user_result[0]
        
        if target_user["id"] == current_user_id:
            raise HTTPException(status_code=400, detail="Cannot send friend request to yourself")
        
        # Check if connection already exists - use user token for user's own data
        existing_connection = await supabase_client.select(
            "user_connections", 
            "*", 
            {
                "requester_id": current_user_id,
                "addressee_id": target_user["id"]
            },
            user_token
        )
        
        if existing_connection:
            raise HTTPException(status_code=409, detail="Friend request already exists")
        
        # Create friend request
        connection_data = {
            "requester_id": current_user_id,
            "addressee_id": target_user["id"],
            "status": "pending"
        }
        
        result = await supabase_client.insert("user_connections", connection_data, user_token)
        
        return {
            "success": True,
            "data": result[0] if result else None,
            "message": "Friend request sent successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating friend request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create friend request: {str(e)}")

@app.get("/api/friends/pending")
async def get_pending_friend_requests(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get pending friend requests for current user"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Get pending requests where user is the addressee
        result = await supabase_client.select(
            "user_connections", 
            "*", 
            {
                "addressee_id": current_user_id,
                "status": "pending"
            },
            user_token
        )
        
        # Get requester details - now possible with RLS policy
        pending_requests = []
        for connection in result:
            requester = await supabase_client.select("user_profiles", "*", {"id": connection["requester_id"]}, user_token)
            if requester:
                pending_requests.append({
                    **connection,
                    "requester": requester[0]
                })
        
        return {
            "success": True,
            "data": pending_requests,
            "total": len(pending_requests)
        }
        
    except Exception as e:
        logger.error(f"Error fetching pending friend requests: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch pending requests: {str(e)}")

@app.put("/api/friends/accept/{connection_id}")
async def accept_friend_request(
    connection_id: str,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Accept a friend request"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Update connection status
        result = await supabase_client.update(
            "user_connections",
            {"status": "accepted"},
            {"id": connection_id, "addressee_id": current_user_id},
            user_token
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Friend request not found")
        
        return {
            "success": True,
            "data": result[0] if result else None,
            "message": "Friend request accepted"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting friend request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to accept friend request: {str(e)}")

@app.put("/api/friends/decline/{connection_id}")
async def decline_friend_request(
    connection_id: str,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Decline a friend request"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Update connection status
        result = await supabase_client.update(
            "user_connections",
            {"status": "declined"},
            {"id": connection_id, "addressee_id": current_user_id},
            user_token
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Friend request not found")
        
        return {
            "success": True,
            "data": result[0] if result else None,
            "message": "Friend request declined"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error declining friend request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to decline friend request: {str(e)}")

@app.delete("/api/friends/{connection_id}")
async def remove_friend(
    connection_id: str,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Remove a friend connection"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Delete connection where user is involved
        result = await supabase_client.delete(
            "user_connections",
            {"id": connection_id},
            user_token
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Friend connection not found")
        
        return {
            "success": True,
            "message": "Friend removed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing friend: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove friend: {str(e)}")

@app.get("/api/friends")
async def get_friends(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get list of accepted friends"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Get accepted connections where user is involved
        result = await supabase_client.select(
            "user_connections", 
            "*", 
            {"status": "accepted"},
            user_token
        )
        
        # Filter connections where current user is involved
        user_connections = [
            conn for conn in result 
            if conn["requester_id"] == current_user_id or conn["addressee_id"] == current_user_id
        ]
        
        # Get friend details - now possible with RLS policy
        friends = []
        for connection in user_connections:
            friend_id = connection["addressee_id"] if connection["requester_id"] == current_user_id else connection["requester_id"]
            friend = await supabase_client.select("user_profiles", "*", {"id": friend_id}, user_token)
            if friend:
                friends.append({
                    **connection,
                    "friend": friend[0]
                })
        
        return {
            "success": True,
            "data": friends,
            "total": len(friends)
        }
        
    except Exception as e:
        logger.error(f"Error fetching friends: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch friends: {str(e)}")

# Credits System Models

class CreditsBalanceResponse(BaseModel):
    success: bool
    credits: int
    message: str

class EventAccessResponse(BaseModel):
    success: bool
    has_access: bool
    message: str

class PurchaseEventAccessRequest(BaseModel):
    event_id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    event_name: Optional[str] = Field(None, max_length=500)

class PurchaseEventAccessResponse(BaseModel):
    success: bool
    message: str
    credits_remaining: int
    event_id: str

class MultiEventPurchaseRequest(BaseModel):
    event_ids: List[str]
    event_names: Optional[List[str]] = None

class MultiEventPurchaseResponse(BaseModel):
    success: bool
    message: str
    credits_remaining: int
    purchased_events: List[str]
    failed_events: List[str] = []
    error: Optional[str] = None

class CreditPackage(BaseModel):
    package_type: str
    credits: int
    price_cents: int
    price_display: str

class CreditsTransactionResponse(BaseModel):
    id: str
    transaction_type: str
    amount: int
    credits_before: int
    credits_after: int
    description: str
    created_at: str
    event_id: Optional[str] = None

class BatchEventAccessRequest(BaseModel):
    event_ids: List[str] = Field(..., min_items=1, max_items=50)
    
    @validator('event_ids')
    def validate_event_ids(cls, v):
        # Validate each event ID
        for event_id in v:
            if not isinstance(event_id, str) or len(event_id.strip()) == 0:
                raise ValueError('All event IDs must be non-empty strings')
            if not re.match(r'^[a-zA-Z0-9_-]+$', event_id.strip()):
                raise ValueError('Event IDs can only contain letters, numbers, underscores, and hyphens')
        return [event_id.strip() for event_id in v]

class BatchEventAccessResponse(BaseModel):
    success: bool
    access_status: Dict[str, bool]
    message: str

# Credits System API Endpoints

@app.get("/api/credits/balance", response_model=CreditsBalanceResponse)
async def get_user_credits(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get current user's credits balance"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Use RPC function to get/create user credits
        result = await supabase_client.rpc("get_user_credits", {}, user_token=user_token)
        
        return CreditsBalanceResponse(
            success=True,
            credits=result if result is not None else 0,
            message="Credits balance retrieved successfully"
        )
        
    except Exception as e:
        logger.error(f"Error getting user credits: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get credits balance: {str(e)}")

@app.get("/api/credits/transactions")
async def get_user_credit_transactions(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get user's credit transaction history"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = await supabase_client.select(
            "credit_transactions", 
            "*", 
            {"user_id": current_user_id},
            user_token=user_token
        )
        
        # Sort by created_at descending
        transactions = sorted(result, key=lambda x: x.get("created_at", ""), reverse=True)
        
        return {
            "success": True,
            "data": transactions,
            "total": len(transactions)
        }
        
    except Exception as e:
        logger.error(f"Error getting credit transactions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get transactions: {str(e)}")

@app.get("/api/events/{event_id}/access", response_model=EventAccessResponse)
async def check_event_access(
    event_id: str,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Check if user has access to a specific event"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Direct table operation instead of RPC
        result = await supabase_client.select(
            "user_event_access", 
            "id", 
            {"user_id": current_user_id, "event_id": event_id},
            user_token=user_token
        )
        has_access = len(result) > 0
        
        return EventAccessResponse(
            success=True,
            has_access=has_access,
            message="Access checked successfully"
        )
        
    except Exception as e:
        logger.error(f"Error checking event access: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to check event access: {str(e)}")

@app.post("/api/events/access-batch", response_model=BatchEventAccessResponse)
async def check_batch_event_access(
    request_data: BatchEventAccessRequest,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Check if user has access to multiple events in a single request"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        access_status = {}
        
        # Batch query: Get all user's event access in one request
        if request_data.event_ids:
            user_access_result = await supabase_client.select(
                "user_event_access",
                "event_id",
                {"user_id": current_user_id},
                user_token=user_token
            )
            
            # Create set of accessible event IDs for fast lookup
            accessible_events = {item["event_id"] for item in user_access_result}
            
            # Check each requested event ID
            for event_id in request_data.event_ids:
                access_status[event_id] = event_id in accessible_events
        else:
            # No events to check
            pass
        
        return BatchEventAccessResponse(
            success=True,
            access_status=access_status,
            message=f"Batch access check completed for {len(request_data.event_ids)} events"
        )
        
    except Exception as e:
        logger.error(f"Error in batch event access check: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to check batch event access: {str(e)}")

@app.post("/api/events/{event_id}/purchase", response_model=PurchaseEventAccessResponse)
async def purchase_event_access(
    event_id: str,
    request_data: PurchaseEventAccessRequest,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Purchase access to an event using credits"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        logger.info(f"Single event purchase request for user {current_user_id}: {event_id}")
        
        # Validate that URL param matches body param
        if event_id != request_data.event_id:
            raise HTTPException(status_code=400, detail="Event ID mismatch")
        
        # Direct table operations instead of RPC
        # 1. Check if user already has access
        existing_access = await supabase_client.select(
            "user_event_access",
            "id",
            {"user_id": current_user_id, "event_id": event_id},
            user_token=user_token
        )
        
        if len(existing_access) > 0:
            raise HTTPException(status_code=409, detail="User already has access to this event")
        
        # 2. Get current credits
        credits_result = await supabase_client.select(
            "user_credits",
            "credits",
            {"user_id": current_user_id},
            user_token=user_token
        )
        
        if not credits_result or len(credits_result) == 0:
            current_credits = 0
        else:
            current_credits = credits_result[0].get("credits", 0)
        
        # 3. Check sufficient credits
        if current_credits < 1:
            raise HTTPException(status_code=402, detail="Not enough credits to purchase event access")
        
        # 4. Execute purchase transaction
        from datetime import datetime
        try:
            # Deduct credit
            await supabase_client.update(
                "user_credits",
                {"credits": current_credits - 1, "updated_at": datetime.now().isoformat()},
                {"user_id": current_user_id},
                user_token=user_token
            )
            
            # Grant access
            await supabase_client.insert(
                "user_event_access",
                [{
                    "user_id": current_user_id,
                    "event_id": event_id,
                    "event_name": request_data.event_name,
                    "granted_at": datetime.now().isoformat(),
                    "access_type": "paid"
                }],
                user_token=user_token
            )
            
            # Log transaction
            await supabase_client.insert(
                "credit_transactions",
                [{
                    "user_id": current_user_id,
                    "amount": -1,
                    "transaction_type": "spend",
                    "credits_before": current_credits,
                    "credits_after": current_credits - 1,
                    "description": f"Event access purchase: {request_data.event_name or event_id}",
                    "event_id": event_id,
                    "created_at": datetime.now().isoformat()
                }],
                user_token=user_token
            )
            
            return PurchaseEventAccessResponse(
                success=True,
                message="Event access purchased successfully",
                credits_remaining=current_credits - 1,
                event_id=event_id
            )
            
        except Exception as transaction_error:
            logger.error(f"Purchase transaction failed for user {current_user_id}: {transaction_error}")
            raise HTTPException(status_code=500, detail="Failed to complete purchase transaction")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error purchasing event access: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to purchase event access: {str(e)}")

@app.post("/api/events/purchase-multiple", response_model=MultiEventPurchaseResponse)
async def purchase_multiple_events(
    request_data: MultiEventPurchaseRequest,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Purchase access to multiple events using credits"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
        
    try:
        logger.info(f"Multi-event purchase request for user {current_user_id}: {request_data.event_ids}")
        
        # Get current credits first
        credits_result = await supabase_client.rpc("get_user_credits", user_token=user_token)
        current_credits = credits_result if credits_result is not None else 0
        
        event_ids = request_data.event_ids
        event_names = request_data.event_names or [None] * len(event_ids)
        
        # Check which events user already has access to
        events_to_purchase = []
        already_purchased = []
        
        # Batch check for existing access - get all user's access at once
        user_access_result = await supabase_client.select(
            "user_event_access",
            "event_id",
            {"user_id": current_user_id},
            user_token=user_token
        )
        
        # Create set of accessible event IDs for fast lookup
        accessible_events = {item["event_id"] for item in user_access_result}
        
        # Categorize events
        for event_id in event_ids:
            if event_id in accessible_events:
                already_purchased.append(event_id)
                logger.info(f"User already has access to event {event_id}")
            else:
                events_to_purchase.append(event_id)
        
        # Calculate actual cost (only for events not already purchased)
        actual_cost = len(events_to_purchase)
        
        # If all events are already purchased, return success immediately
        if actual_cost == 0:
            return MultiEventPurchaseResponse(
                success=True,
                message=f"You already have access to all {len(event_ids)} events",
                credits_remaining=current_credits,
                purchased_events=event_ids,  # All events are considered "purchased"
                failed_events=[]
            )
        
        # Check if user has enough credits for events that need to be purchased
        if current_credits < actual_cost:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient credits. Required: {actual_cost}, Available: {current_credits}"
            )
        
        purchased_events = []
        failed_events = []
        remaining_credits = current_credits
        
        # Add already purchased events to the purchased list
        purchased_events.extend(already_purchased)
        
        # Process only events that need to be purchased
        for event_id in events_to_purchase:
            # Find the corresponding event name
            event_index = event_ids.index(event_id)
            event_name = event_names[event_index] if event_index < len(event_names) else None
            
            try:
                # Use RPC function to purchase access for each event
                result = await supabase_client.rpc("purchase_event_access", {
                    "event_id_param": event_id,
                    "event_name_param": event_name
                }, user_token=user_token)
                
                if not result:
                    logger.error(f"No response from purchase function for event {event_id}")
                    failed_events.append(event_id)
                    continue
                
                logger.info(f"Purchase result for event {event_id}: {result}")
                
                if result.get("success"):
                    purchased_events.append(event_id)
                    remaining_credits = result.get("credits_remaining", remaining_credits - 1)
                else:
                    error_msg = result.get("error", "unknown_error")
                    if error_msg == "already_has_access":
                        # If user already has access, don't count as failure
                        purchased_events.append(event_id)
                    else:
                        failed_events.append(event_id)
                        logger.warning(f"Failed to purchase event {event_id}: {error_msg}")
                        
            except Exception as e:
                logger.error(f"Error purchasing event {event_id}: {e}")
                failed_events.append(event_id)
        
        # Determine overall success
        success = len(purchased_events) > 0
        
        # Create detailed message based on what happened
        if len(already_purchased) > 0 and len(events_to_purchase) > 0:
            # Mixed scenario: some already purchased, some newly purchased
            newly_purchased = len(purchased_events) - len(already_purchased)
            if newly_purchased == len(events_to_purchase):
                message = f"Successfully purchased {newly_purchased} new events. You already had access to {len(already_purchased)} events."
            else:
                message = f"Purchased {newly_purchased} of {len(events_to_purchase)} new events. You already had access to {len(already_purchased)} events."
        elif len(already_purchased) > 0:
            # All events were already purchased (handled earlier, but just in case)
            message = f"You already have access to all {len(event_ids)} events"
        elif len(purchased_events) == len(event_ids):
            # All events newly purchased
            message = f"Successfully purchased access to {len(purchased_events)} events"
        elif len(purchased_events) > 0:
            # Some events purchased, some failed
            message = f"Purchased {len(purchased_events)} of {len(event_ids)} events"
        else:
            # No events purchased
            message = "Failed to purchase any events"
        
        return MultiEventPurchaseResponse(
            success=success,
            message=message,
            credits_remaining=remaining_credits,
            purchased_events=purchased_events,
            failed_events=failed_events
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in multi-event purchase: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to purchase events: {str(e)}")

@app.get("/api/credits/packages")
async def get_credit_packages(
    current_user_id: str = Depends(extract_user_id_from_token)
):
    """Get available credit packages for purchase"""
    packages = [
        CreditPackage(
            package_type="single",
            credits=1,
            price_cents=1000,  # 10.00 EUR
            price_display="10€"
        ),
        CreditPackage(
            package_type="pack_5",
            credits=5,
            price_cents=4000,  # 40.00 EUR
            price_display="40€"
        ),
        CreditPackage(
            package_type="pack_10",
            credits=10,
            price_cents=7000,  # 70.00 EUR
            price_display="70€"
        )
    ]
    
    return {
        "success": True,
        "packages": [package.dict() for package in packages],
        "currency": "EUR",
        "message": "Credit packages retrieved successfully"
    }

@app.get("/api/user/events")
async def get_user_accessible_events(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get all events that user has access to"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        result = await supabase_client.select(
            "user_event_access", 
            "*", 
            {"user_id": current_user_id},
            user_token=user_token
        )
        
        return {
            "success": True,
            "data": result,
            "total": len(result)
        }
        
    except Exception as e:
        logger.error(f"Error getting user accessible events: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get accessible events: {str(e)}")

# Admin Credits API Endpoints

class GrantCreditsRequest(BaseModel):
    credits: int = Field(..., gt=0, le=100)
    note: str = Field("Admin grant", max_length=500)

@app.post("/api/admin/credits/grant/{user_id}")
async def grant_credits_to_user(
    user_id: str,
    grant_request: GrantCreditsRequest,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Grant credits to a user (Admin only)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Check if current user is admin - this is done in the RPC function
        result = await supabase_client.rpc("grant_admin_credits", {
            "target_user_id": user_id,
            "credits_to_grant": grant_request.credits,
            "admin_note": grant_request.note
        })
        
        if not result:
            raise HTTPException(status_code=500, detail="No response from grant function")
        
        success = result.get("success", False)
        message = result.get("message", "Unknown error")
        
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        return {
            "success": True,
            "message": message,
            "credits_granted": result.get("credits_granted"),
            "total_credits": result.get("credits_total")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error granting credits: {e}")
        if "Admin privileges required" in str(e):
            raise HTTPException(status_code=403, detail="Admin privileges required")
        raise HTTPException(status_code=500, detail=f"Failed to grant credits: {str(e)}")

@app.get("/api/admin/credits/stats")
async def get_credits_statistics(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get credits system statistics (Admin only)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Check if user is admin
        user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
        if not user_profile or user_profile[0].get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")
        
        # Get various statistics
        total_users = await supabase_client.select("user_credits", "COUNT(*)", {})
        total_credits_distributed = await supabase_client.select("user_credits", "SUM(credits)", {})
        total_transactions = await supabase_client.select("credit_transactions", "COUNT(*)", {})
        total_purchases = await supabase_client.select("credit_purchases", "COUNT(*)", {"payment_status": "completed"})
        
        return {
            "success": True,
            "stats": {
                "total_users_with_credits": len(total_users) if total_users else 0,
                "total_credits_in_system": total_credits_distributed[0].get("sum") if total_credits_distributed and total_credits_distributed[0] else 0,
                "total_transactions": len(total_transactions) if total_transactions else 0,
                "completed_purchases": len(total_purchases) if total_purchases else 0
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting credits statistics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get statistics: {str(e)}")

# Debug endpoint to check user role
@app.get("/api/debug/user-role")
async def debug_user_role(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Debug endpoint to check current user's role and token info"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        logger.info(f"Debug request: current_user_id={current_user_id}, user_token={'***' if user_token else 'None'}")
        user_profile = await supabase_client.select("user_profiles", "*", {"id": current_user_id}, user_token)
        logger.info(f"Debug user profile: {user_profile}")
        
        return {
            "success": True,
            "user_id": current_user_id,
            "has_token": bool(user_token),
            "profile": user_profile[0] if user_profile else None,
            "is_admin": user_profile[0].get("role") == "admin" if user_profile else False
        }
    except Exception as e:
        logger.error(f"Debug error: {e}")
        return {
            "success": False,
            "error": str(e),
            "user_id": current_user_id,
            "has_token": bool(user_token)
        }

# Admin users listing for frontend admin panel
@app.get("/api/admin/users")
async def get_admin_users(
    search: str = "",
    limit: int = 200,
    offset: int = 0,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """List users for the admin panel (Admin only).
    Returns: id, full_name, email, role, organization
    Supports optional search (by name/email), pagination via limit/offset.
    """
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Check admin role
        logger.info(f"Admin users request: current_user_id={current_user_id}, user_token={'***' if user_token else 'None'}")
        user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
        logger.info(f"Admin check result: user_profile={user_profile}")
        if not user_profile or user_profile[0].get("role") != "admin":
            logger.warning(f"Admin access denied for user {current_user_id}: profile={user_profile}")
            raise HTTPException(status_code=403, detail="Admin privileges required")

        # Fetch users - select minimal fields
        # Note: Supabase client helper may not support complex filters/sorting; do it in Python
        users = await supabase_client.select(
            "user_profiles",
            "id, full_name, email, role, organization",
            {},
            user_token=user_token,
        )

        if users is None:
            users = []

        # In-memory search filter
        normalized_search = (search or "").strip().lower()
        if normalized_search:
            def match(u):
                fn = (u.get("full_name") or "").lower()
                em = (u.get("email") or "").lower()
                return normalized_search in fn or normalized_search in em
            users = [u for u in users if match(u)]

        # Sort by full_name then email for stability
        users.sort(key=lambda u: ((u.get("full_name") or "").lower(), (u.get("email") or "").lower()))

        total = len(users)
        # Pagination
        start = max(offset, 0)
        end = start + max(min(limit, 500), 0)  # cap limit to 500
        page = users[start:end]

        return {
            "success": True,
            "users": page,
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing admin users: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list users: {str(e)}")

# Admin overview endpoint to replace direct frontend Supabase reads
@app.get("/api/admin/overview")
async def get_admin_overview(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Check admin role
        user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
        if not user_profile or user_profile[0].get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        # Users
        users = await supabase_client.select("user_profiles", "*", {}, user_token)

        # Active sessions
        sessions = await supabase_client.select("active_sessions", "*", {}, user_token)

        # Recent actions (last 24h)
        since_iso = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        actions = await supabase_client.select("user_actions", "*", {}, user_token)
        recent_actions = [a for a in (actions or []) if a.get("timestamp", "") >= since_iso]

        # Login activity today
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        login_activity = await supabase_client.select("user_login_activity", "*", {}, user_token)
        today_logins = [x for x in (login_activity or []) if x.get("login_timestamp", "").startswith(today_str)]

        # Actions count today
        today_actions = [x for x in (actions or []) if x.get("timestamp", "").startswith(today_str)]

        # Failed login attempts (last 24h)
        failed_attempts = await supabase_client.select("failed_login_attempts", "*", {}, user_token)
        failed_last_24h = [x for x in (failed_attempts or []) if x.get("attempt_timestamp", "") >= since_iso]

        return {
            "success": True,
            "data": {
                "users": users or [],
                "active_sessions": sessions or [],
                "recent_actions": recent_actions,
                "today_logins_count": len(today_logins),
                "today_actions_count": len(today_actions),
                "failed_attempts": failed_last_24h,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building admin overview: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get admin overview: {str(e)}")

# Activity overview endpoint for a user
@app.get("/api/activity/overview")
async def get_activity_overview(
    filter: str = "all",
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Time range
        now = datetime.utcnow()
        today = datetime(now.year, now.month, now.day)
        week_ago = now - timedelta(days=7)
        since = None
        if filter == "today":
            since = today.isoformat()
        elif filter == "week":
            since = week_ago.isoformat()

        # User actions
        actions = await supabase_client.select("user_actions", "*", {"user_id": current_user_id}, user_token)
        if since:
            actions = [a for a in (actions or []) if a.get("timestamp", "") >= since]
        actions_sorted = sorted(actions or [], key=lambda a: a.get("timestamp", ""), reverse=True)[:50]

        # Login activity
        logins = await supabase_client.select("user_login_activity", "*", {"user_id": current_user_id}, user_token)
        logins_sorted = sorted(logins or [], key=lambda a: a.get("login_timestamp", ""), reverse=True)[:20]

        # Stats
        total_actions = len(actions_sorted)
        today_actions = len([a for a in (actions or []) if a.get("timestamp", "").startswith(today.strftime("%Y-%m-%d"))])
        last_login = logins_sorted[0].get("login_timestamp") if logins_sorted else None

        return {
            "success": True,
            "data": {
                "actions": actions_sorted,
                "login_activity": logins_sorted,
                "stats": {
                    "totalActions": total_actions,
                    "todayActions": today_actions,
                    "totalSessions": len(logins_sorted),
                    "lastLogin": last_login,
                }
            }
        }
    except Exception as e:
        logger.error(f"Error building activity overview: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get activity overview: {str(e)}")

# Profile update endpoints
class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    organization: Optional[str] = None

class PasswordChangeRequest(BaseModel):
    password: str

class VerifyPasswordRequest(BaseModel):
    email: str
    password: str

@app.post("/api/profile/update")
async def update_profile(
    req: ProfileUpdateRequest,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        update_data: Dict[str, Any] = {"updated_at": datetime.utcnow().isoformat()}
        if req.full_name is not None:
            update_data["full_name"] = req.full_name
        if req.organization is not None:
            update_data["organization"] = req.organization

        await supabase_client.update("user_profiles", update_data, {"id": current_user_id}, user_token)
        return {"success": True, "message": "Profile updated"}
    except Exception as e:
        logger.error(f"Error updating profile: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")

@app.post("/api/profile/verify-password")
async def verify_password(
    req: VerifyPasswordRequest,
    current_user_id: str = Depends(extract_user_id_from_token)
):
    """Verify user's current password by attempting a password grant with Supabase Auth."""
    supabase_url = os.getenv("SUPABASE_URL", os.getenv("NEXT_PUBLIC_SUPABASE_URL", ""))
    anon_key = os.getenv("SUPABASE_ANON_KEY", os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""))
    if not supabase_url or not anon_key:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{supabase_url}/auth/v1/token?grant_type=password",
                headers={
                    "apikey": anon_key,
                    "Content-Type": "application/json",
                },
                json={"email": req.email, "password": req.password},
            )
            # 200 means credentials valid; 400/401 invalid
            if resp.status_code == 200:
                return {"success": True}
            return {"success": False}
    except Exception as e:
        logger.error(f"Error verifying password: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify password")

@app.post("/api/profile/change-password")
async def change_password(
    req: PasswordChangeRequest,
    current_user_id: str = Depends(extract_user_id_from_token),
):
    """Change the authenticated user's password using Supabase Admin API.
    This endpoint expects that the caller is the user themselves.
    Optionally, require prior verification via /api/profile/verify-password from the client.
    """
    supabase_url = os.getenv("SUPABASE_URL", os.getenv("NEXT_PUBLIC_SUPABASE_URL", ""))
    service_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        raise HTTPException(status_code=503, detail="Supabase admin not configured")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.patch(
                f"{supabase_url}/auth/v1/admin/users/{current_user_id}",
                headers={
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}",
                    "Content-Type": "application/json",
                },
                json={"password": req.password},
            )
            if resp.status_code != 200:
                try:
                    data = resp.json()
                    detail = data.get("message") or data.get("error") or data
                except Exception:
                    detail = resp.text
                raise HTTPException(status_code=resp.status_code, detail=f"Failed to change password: {detail}")
            return {"success": True, "message": "Password changed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing password: {e}")
        raise HTTPException(status_code=500, detail="Failed to change password")

# Enhanced Commentator Info APIs with Friends System

@app.get("/api/commentator-info/{athlete_id}/friends")
async def get_commentator_info_with_friends(
    athlete_id: str, 
    source: str = "mine",
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get commentator info including friends' data with user token"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        
        if source == "mine":
            # Get only user's own data
            result = await supabase_client.select(
                "commentator_info", 
                "*", 
                {"athlete_id": athlete_id, "created_by": current_user_id},
                user_token=user_token
            )
        elif source == "friends":
            # Get friends' data
            # First get accepted friends
            friends_result = await supabase_client.select(
                "user_connections", 
                "*", 
                {"status": "accepted"},
                user_token=user_token
            )
            
            user_connections = [
                conn for conn in friends_result 
                if conn["requester_id"] == current_user_id or conn["addressee_id"] == current_user_id
            ]
            
            friend_ids = []
            for connection in user_connections:
                friend_id = connection["addressee_id"] if connection["requester_id"] == current_user_id else connection["requester_id"]
                friend_ids.append(friend_id)
            
            # Get commentator info from friends
            result = []
            for friend_id in friend_ids:
                friend_data = await supabase_client.select(
                    "commentator_info", 
                    "*", 
                    {"athlete_id": athlete_id, "created_by": friend_id},
                    user_token=user_token
                )
                if friend_data:
                    result.extend(friend_data)
        else:  # "all"
            # Get all data (own + friends) - this is handled by RLS policies
            result = await supabase_client.select("commentator_info", "*", {"athlete_id": athlete_id}, user_token=user_token)
        
        # Add authorship info
        enhanced_result = []
        for item in result:
            is_own = item.get("created_by") == current_user_id
            enhanced_result.append({
                **item,
                "is_own_data": is_own
            })
        
        return {
            "success": True,
            "data": enhanced_result,
            "total": len(enhanced_result)
        }
        
    except Exception as e:
        logger.error(f"Error fetching commentator info with friends: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch commentator info: {str(e)}")

@app.get("/api/fullresults")
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
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        redis_client = None
        if redis is not None:
            try:
                if not hasattr(request.app.state, "_redis_client") or request.app.state._redis_client is None:
                    request.app.state._redis_client = redis.from_url(redis_url, decode_responses=True)
                redis_client = request.app.state._redis_client
            except Exception as e:
                logger.warning(f"Redis init failed, continuing without cache: {e}")
                redis_client = None

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

@app.get("/api/fullresults/{series_id}")
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
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        redis_client = None
        if redis is not None:
            try:
                if not hasattr(request.app.state, "_redis_client") or request.app.state._redis_client is None:
                    request.app.state._redis_client = redis.from_url(redis_url, decode_responses=True)
                redis_client = request.app.state._redis_client
            except Exception as e:
                logger.warning(f"Redis init failed, continuing without cache: {e}")
                redis_client = None

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
            
            payload = {
                "series_id": series_id,
                "series_name": series_info["name"],
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

@app.get("/api/commentator-info/export")
async def export_all_commentator_info(
    current_user_id: str = Depends(extract_user_id_from_token)
):
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
async def import_commentator_info(
    import_data: dict,
    current_user_id: str = Depends(extract_user_id_from_token)
):
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
                    # Add user info to imported data
                    insert_data["created_by"] = current_user_id
                    
                    # Get user profile for author name
                    user_profile = await supabase_client.select("user_profiles", "full_name", {"id": current_user_id})
                    if user_profile:
                        insert_data["author_name"] = user_profile[0]["full_name"]
                    
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

@app.post("/api/commentator-info/bulk-import")
async def bulk_import_commentator_info(
    data: List[Dict[str, Any]],
    target_user_id: Optional[str] = None,
    user_token: str = Depends(get_user_token),
    current_user_id: str = Depends(extract_user_id_from_token)
):
    """Bulk import commentator info from CSV data with user token"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        
        # Check if target_user_id is specified and current user is admin
        effective_user_id = current_user_id
        if target_user_id:
            # Check if current user is admin
            user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
            if not user_profile or user_profile[0].get("role") != "admin":
                raise HTTPException(status_code=403, detail="Admin privileges required to upload for other users")
            effective_user_id = target_user_id
            logger.info(f"Admin {current_user_id} uploading data for user {target_user_id}")
        
        # Get user's token for the effective user
        if target_user_id and target_user_id != current_user_id:
            # For admin operations on behalf of other users, we still use the admin's token
            # but track that this is for the target user
            pass
        results = {"success": 0, "failed": 0, "errors": []}
        logger.info(f"Starting bulk import for {len(data)} items by user {current_user_id} (effective_user: {effective_user_id})")
        
        for item in data:
            try:
                athlete_id = item.get("athlete_id")
                
                if not athlete_id:
                    results["failed"] += 1
                    results["errors"].append("Missing athlete_id")
                    continue
                
                # Check if record exists for the effective user
                existing = await supabase_client.select("commentator_info", "*", {
                    "athlete_id": athlete_id,
                    "created_by": effective_user_id
                }, user_token=user_token)
                
                # Prepare data for insert/update
                info_data = {
                    "athlete_id": athlete_id,
                    "homebase": item.get("homebase", ""),
                    "team": item.get("team", ""),
                    "sponsors": item.get("sponsors", ""),
                    "favorite_trick": item.get("favorite_trick", ""),
                    "achievements": item.get("achievements", ""),
                    "injuries": item.get("injuries", ""),
                    "fun_facts": item.get("fun_facts", ""),
                    "notes": item.get("notes", ""),
                    "social_media": item.get("social_media", {}),
                    "custom_fields": item.get("custom_fields", {})
                }
                
                if existing:
                    # Update existing record
                    update_data = {k: v for k, v in info_data.items() if k != "athlete_id"}
                    result = await supabase_client.update("commentator_info", update_data, {
                        "athlete_id": athlete_id,
                        "created_by": effective_user_id
                    }, user_token=user_token)
                else:
                    # Create new record - add user info
                    info_data["created_by"] = effective_user_id
                    
                    # Get user profile for author name (target user)
                    user_profile = await supabase_client.select("user_profiles", "full_name", {"id": effective_user_id}, user_token=user_token)
                    if user_profile:
                        info_data["author_name"] = user_profile[0]["full_name"]
                    
                    result = await supabase_client.insert("commentator_info", info_data, user_token=user_token)
                
                results["success"] += 1
                
            except Exception as item_error:
                results["failed"] += 1
                results["errors"].append(f"Athlete {item.get('athlete_id', 'unknown')}: {str(item_error)}")
                logger.error(f"Error processing bulk import item {item.get('athlete_id')}: {item_error}")
        
        logger.info(f"Bulk import completed: {results['success']} success, {results['failed']} failed")
        return {
            "success": True,
            "data": results
        }
        
    except Exception as e:
        logger.error(f"Error in bulk import commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to bulk import: {str(e)}")

@app.post("/api/security/log-failed-attempt")
@limiter.limit("10/minute")
async def log_failed_login_attempt(request: Request, email: str, reason: str = "unknown"):
    """Log a failed login attempt for security monitoring"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        # Log the failed attempt
        failed_attempt_data = {
            "email": email,
            "ip_address": client_ip,
            "failure_reason": reason,
            "user_agent": user_agent,
            "attempt_timestamp": datetime.now().isoformat()
        }
        
        await supabase_client.insert("failed_login_attempts", failed_attempt_data)
        
        # Check for suspicious activity
        recent_attempts = await supabase_client.select(
            "failed_login_attempts", 
            "*", 
            {"ip_address": client_ip}
        )
        
        # Filter attempts from last hour
        one_hour_ago = datetime.now().isoformat()
        recent_failed = [a for a in recent_attempts if a.get("attempt_timestamp", "") > one_hour_ago]
        
        if len(recent_failed) > 10:
            logger.warning(f"Suspicious activity detected: {len(recent_failed)} failed attempts from IP {client_ip}")
        
        return {"success": True, "logged": True}
        
    except Exception as e:
        logger.error(f"Error logging failed login attempt: {e}")
        raise HTTPException(status_code=500, detail="Failed to log security event")

@app.get("/api/security/alerts")
async def get_security_alerts(
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token)
):
    """Get security alerts for admin monitoring"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    try:
        # Get recent failed attempts
        recent_attempts = await supabase_client.select("failed_login_attempts", "*")
        
        # Group by IP and email for analysis
        ip_attempts = {}
        email_attempts = {}
        
        for attempt in recent_attempts:
            ip = attempt.get("ip_address", "unknown")
            email = attempt.get("email", "unknown")
            
            if ip not in ip_attempts:
                ip_attempts[ip] = []
            ip_attempts[ip].append(attempt)
            
            if email not in email_attempts:
                email_attempts[email] = []
            email_attempts[email].append(attempt)
        
        # Generate alerts
        alerts = []
        
        # IP-based alerts
        for ip, attempts in ip_attempts.items():
            if len(attempts) > 5:
                alerts.append({
                    "type": "high_failed_attempts_ip",
                    "severity": "high",
                    "message": f"IP {ip} has {len(attempts)} failed attempts",
                    "data": {"ip": ip, "count": len(attempts)}
                })
        
        # Email-based alerts
        for email, attempts in email_attempts.items():
            if len(attempts) > 3:
                alerts.append({
                    "type": "high_failed_attempts_email",
                    "severity": "medium",
                    "message": f"Email {email} has {len(attempts)} failed attempts",
                    "data": {"email": email, "count": len(attempts)}
                })
        
        return {
            "alerts": alerts,
            "total_recent_attempts": len(recent_attempts),
            "unique_ips": len(ip_attempts),
            "unique_emails": len(email_attempts)
        }
        
    except Exception as e:
        logger.error(f"Error getting security alerts: {e}")
        raise HTTPException(status_code=500, detail="Failed to get security alerts")

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