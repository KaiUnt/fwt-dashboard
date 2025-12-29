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
from datetime import datetime, timedelta, timezone
import uvicorn
import logging
import time as _time
import httpx
import re
from pydantic import BaseModel, Field, validator

# Import from backend modules
from backend.db import SupabaseClient
from backend.utils import (
    extract_location_from_name,
    extract_event_location,
    extract_year_from_name,
    normalize_event_for_matching,
    calculate_event_core_similarity,
    events_match_historically,
    is_main_series,
)
from backend.routers import core as core_router
from backend.routers import credits as credits_router
from backend.routers import profile as profile_router
from backend.routers import activity as activity_router
from backend.routers import friends as friends_router
from backend.routers import commentator as commentator_router
from backend.routers import admin as admin_router
from backend.routers import results as results_router
from backend.routers import users as users_router
from backend.routers import debug as debug_router
from backend.models import (
    EventIdSchema,
    AthleteIdSchema,
    FriendRequestCreate,
    FriendRequestResponse,
    UserProfile,
    CommentatorInfoWithAuthor,
    CommentatorInfoCreate,
    CommentatorInfoUpdate,
    CreditsBalanceResponse,
    EventAccessResponse,
    PurchaseEventAccessRequest,
    PurchaseEventAccessResponse,
    MultiEventPurchaseRequest,
    MultiEventPurchaseResponse,
    CreditPackage,
    CreditsTransactionResponse,
    BatchEventAccessRequest,
    BatchEventAccessResponse,
    GrantCreditsRequest,
    AdminCreditsAdjustRequest,
    LogLoginRequest,
    ProfileUpdateRequest,
    PasswordChangeRequest,
    VerifyPasswordRequest,
)
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import secrets
import time
import jwt
import json
import base64
try:
    import redis.asyncio as redis
except Exception:
    redis = None

# Redis client factory (standard Redis only)
async def get_redis_client(request):
    """Get Redis client (standard server)."""
    if hasattr(request.app.state, "_redis_client") and request.app.state._redis_client is not None:
        return request.app.state._redis_client

    # Standard Redis (server-side)
    if redis is not None:
        # Default to local Redis when running via systemd
        redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
        try:
            client = redis.from_url(redis_url, decode_responses=True)
            # Validate connectivity (fast ping)
            try:
                pong = await client.ping()
                if pong:
                    request.app.state._redis_client = client
                    logger.info(f"Using Redis at {redis_url}")
                    return request.app.state._redis_client
            except Exception as e:
                logger.warning(f"Redis ping failed for {redis_url}: {e}")
        except Exception as e:
            logger.warning(f"Redis init failed for {redis_url}: {e}")

    # No Redis available
    request.app.state._redis_client = None
    return None

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
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

# JWT token security
security = HTTPBearer(auto_error=True)

def get_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract raw user JWT token from credentials"""
    if not credentials or not credentials.credentials:
        logger.error("No credentials provided")
        raise HTTPException(status_code=401, detail="Authorization token required")
    
    return credentials.credentials

_JWKS_CACHE: dict = {"keys": None, "cached_at": 0}

def _supabase_issuer() -> Optional[str]:
    if not SUPABASE_URL:
        return None
    return f"{SUPABASE_URL.rstrip('/')}/auth/v1"

async def _fetch_jwks() -> Optional[dict]:
    """Fetch JWKS from Supabase and cache for a short TTL."""
    try:
        jwks_url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(jwks_url)
            if resp.status_code != 200:
                logger.error("Failed to fetch JWKS: HTTP %s", resp.status_code)
                return None
            data = resp.json()
            return data
    except Exception as e:
        logger.error("JWKS fetch error: %s", str(e))
        return None

async def _get_public_key_from_jwks(token: str) -> Optional[str]:
    """Get a PEM public key from JWKS matching the token's kid."""
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get('kid')
        if not kid:
            return None
        now = int(time.time())
        # Refresh cache every 10 minutes
        if not _JWKS_CACHE["keys"] or now - _JWKS_CACHE["cached_at"] > 600:
            jwks = await _fetch_jwks()
            if jwks and isinstance(jwks.get('keys'), list):
                _JWKS_CACHE["keys"] = jwks['keys']
                _JWKS_CACHE["cached_at"] = now
        keys = _JWKS_CACHE.get("keys") or []
        for jwk in keys:
            if jwk.get('kid') == kid:
                try:
                    # Convert JWK to PEM-compatible key
                    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
                    return public_key
                except Exception as e:
                    logger.error("Failed converting JWK to key: %s", str(e))
                    return None
        return None
    except Exception:
        return None

async def verify_and_decode_jwt(token: str) -> dict:
    """Verify JWT using HS256 (secret) or RS256 (JWKS) and return claims."""
    _t0 = _time.perf_counter()
    if not token:
        raise HTTPException(status_code=401, detail="Authorization token required")

    expected_issuer = _supabase_issuer()
    options = {"verify_aud": False}

    # Prefer HS256 verification when secret is configured
    try:
        unverified_header = jwt.get_unverified_header(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token header")

    alg = (unverified_header.get('alg') or '').upper()

    # 1) HS256 path if configured and algorithm matches HMAC family
    if SUPABASE_JWT_SECRET and alg.startswith('HS'):
        try:
            claims = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=[alg],
                issuer=expected_issuer if expected_issuer else None,
                options=options
            )
            return claims
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.InvalidIssuerError:
            raise HTTPException(status_code=401, detail="Invalid token issuer")
        except jwt.InvalidTokenError:
            # Fall through to JWKS attempt
            pass

    # 2) RS256 path using JWKS (or for any non-HS alg)
    try:
        public_key = await _get_public_key_from_jwks(token)
        if not public_key:
            raise HTTPException(status_code=401, detail="Unable to obtain public key for token")
        claims = jwt.decode(
            token,
            public_key,
            algorithms=[alg] if alg else ["RS256"],
            issuer=expected_issuer if expected_issuer else None,
            options=options
        )
        return claims
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="Invalid token issuer")
    except jwt.InvalidTokenError as e:
        logger.warning("JWT verification failed: %s", str(e))
        raise HTTPException(status_code=401, detail="Invalid authorization token")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("JWT verification error: %s", str(e))
        raise HTTPException(status_code=500, detail="Authentication processing failed")
    finally:
        if os.getenv("DEBUG_TIMING") == "1":
            logger.info(f"TIMING jwt_verify: {(_time.perf_counter()-_t0):.4f}s")

async def extract_user_id_from_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Verify JWT and return the user id (sub)."""
    try:
        token = credentials.credentials if credentials else None
        claims = await verify_and_decode_jwt(token)
        user_id = (claims.get('sub') or '').strip()
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found in token")
        return user_id
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Token processing error: %s", str(e))
        raise HTTPException(status_code=500, detail="Authentication processing failed")

# SupabaseClient imported from backend.db

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

SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
service_supabase_client: Optional[SupabaseClient] = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    try:
        service_supabase_client = SupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        logger.info("Supabase service client initialized successfully")
    except Exception as e:
        service_supabase_client = None
        logger.error(f"Failed to initialize Supabase service client: {e}")


def get_admin_client() -> Optional[SupabaseClient]:
    """Return Supabase client with elevated privileges when available."""
    return service_supabase_client or supabase_client

# Pydantic models - imported from backend.models

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
    "https://report.kais.world",  # Custom domain
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

# Store supabase_client in app state for routers to access
app.state.supabase_client = supabase_client

# Include routers
app.include_router(core_router.router)
app.include_router(credits_router.router)
app.include_router(profile_router.router)
app.include_router(activity_router.router)
app.include_router(friends_router.router)
app.include_router(commentator_router.router)
app.include_router(admin_router.router)
app.include_router(results_router.router)
app.include_router(users_router.router)
app.include_router(debug_router.router)

# Store service client for activity router
app.state.service_supabase_client = service_supabase_client

# Store admin client for admin router
app.state.admin_supabase_client = get_admin_client()

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
        # Write to Redis if available, otherwise to in-memory cache
        if redis_client:
            try:
                await redis_client.setex(cache_key, ttl_seconds, json.dumps(payload))
            except Exception as e:
                logger.warning(f"Redis write failed, using in-memory cache: {e}")
                cache_store[cache_key] = (payload, now_ts)
        else:
            cache_store[cache_key] = (payload, now_ts)

        if os.getenv("DEBUG_TIMING") == "1":
            logger.info(f"TIMING total_before_return: {(_time.perf_counter()-_t_all):.4f}s (cache miss) ")
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
        if supabase_client:
            try:
                admin_client = get_admin_client() or supabase_client
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
        
    except Exception as e:
        logger.error(f"Error fetching athletes for event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch event athletes: {str(e)}")

# Series rankings and athlete results endpoints moved to backend/routers/results.py

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

# Commentator endpoints moved to backend/routers/commentator.py

# Users check-username endpoint moved to backend/routers/users.py

# Friends endpoints moved to backend/routers/friends.py

# Credits endpoints moved to backend/routers/credits.py

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
        # 7-day free rule: if event is older than 7 days, grant access
        try:
            event_info = await supabase_client.select("events", "date", {"id": event_id}, user_token=user_token)
            if event_info and len(event_info) > 0:
                from datetime import datetime, timezone, timedelta
                event_date_str = event_info[0].get("date")
                if event_date_str:
                    try:
                        event_date = datetime.fromisoformat(event_date_str.replace("Z", "+00:00"))
                    except Exception:
                        event_date = None
                    if event_date:
                        now = datetime.now(timezone.utc)
                        if (now - event_date) > timedelta(days=7):
                            return EventAccessResponse(
                                success=True,
                                has_access=True,
                                message="Access granted: event older than 7 days"
                            )
        except Exception:
            # If event date lookup fails, fall back to user_event_access check
            pass

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

            # 7-day free rule: prefetch event dates
            try:
                events_info = await supabase_client.select(
                    "events",
                    "id,date",
                    {},
                    user_token=user_token
                )
                from datetime import datetime, timezone, timedelta
                date_map = {}
                for e in events_info or []:
                    date_map[str(e.get("id"))] = e.get("date")
            except Exception:
                date_map = {}

            # Create set of accessible event IDs for fast lookup
            accessible_events = {item["event_id"] for item in user_access_result}
            
            # Check each requested event ID with free rule
            from datetime import datetime, timezone, timedelta
            for event_id in request_data.event_ids:
                # 7-day free
                date_str = date_map.get(str(event_id))
                is_free = False
                if date_str:
                    try:
                        event_date = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
                        is_free = (datetime.now(timezone.utc) - event_date) > timedelta(days=7)
                    except Exception:
                        is_free = False
                access_status[event_id] = is_free or (event_id in accessible_events)
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
    """Purchase access to an event using credits (using secure RPC function)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        logger.info(f"Single event purchase request for user {current_user_id}: {event_id}")

        # Validate that URL param matches body param
        if event_id != request_data.event_id:
            raise HTTPException(status_code=400, detail="Event ID mismatch")

        # Use secure RPC function with built-in transaction safety and race condition protection
        result = await supabase_client.rpc(
            "purchase_event_access",
            {
                "event_id_param": event_id,
                "event_name_param": request_data.event_name
            },
            user_token=user_token
        )

        # Handle different response scenarios
        if not result.get("success", False):
            error_type = result.get("error", "unknown")
            message = result.get("message", "Purchase failed")

            if error_type == "already_has_access":
                raise HTTPException(status_code=409, detail=message)
            elif error_type == "insufficient_credits":
                raise HTTPException(status_code=402, detail=message)
            else:
                raise HTTPException(status_code=500, detail=message)

        # Success
        return PurchaseEventAccessResponse(
            success=True,
            message=result.get("message", "Event access purchased successfully"),
            credits_remaining=result.get("credits_remaining", 0),
            event_id=event_id
        )

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
        
        # Get current credits first (direct read with initialization if missing)
        credits_row = await supabase_client.select(
            "user_credits",
            "credits",
            {"user_id": current_user_id},
            user_token=user_token
        )
        if not credits_row or len(credits_row) == 0:
            # Initialize with 5 credits for new users
            from datetime import datetime
            try:
                await supabase_client.insert(
                    "user_credits",
                    [{
                        "user_id": current_user_id,
                        "credits": 5,
                        "created_at": datetime.now().isoformat(),
                        "updated_at": datetime.now().isoformat()
                    }],
                    user_token=user_token
                )
                current_credits = 5
            except Exception:
                reread = await supabase_client.select(
                    "user_credits",
                    "credits",
                    {"user_id": current_user_id},
                    user_token=user_token
                )
                current_credits = (reread[0].get("credits", 0) if reread else 0)
        else:
            current_credits = credits_row[0].get("credits", 0)
        
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
        
        # Process only events that need to be purchased (direct operations, no RPC)
        for event_id in events_to_purchase:
            # Find the corresponding event name
            event_index = event_ids.index(event_id)
            event_name = event_names[event_index] if event_index < len(event_names) else None
            
            try:
                from datetime import datetime
                # Re-check access defensively for each event
                existing_access = await supabase_client.select(
                    "user_event_access",
                    "id",
                    {"user_id": current_user_id, "event_id": event_id},
                    user_token=user_token
                )
                if len(existing_access) > 0:
                    purchased_events.append(event_id)
                    continue

                # Deduct credit
                await supabase_client.update(
                    "user_credits",
                    {"credits": max(0, remaining_credits - 1), "updated_at": datetime.now().isoformat()},
                    {"user_id": current_user_id},
                    user_token=user_token
                )

                # Grant access
                await supabase_client.insert(
                    "user_event_access",
                    [{
                        "user_id": current_user_id,
                        "event_id": event_id,
                        "event_name": event_name,
                        "granted_at": datetime.now().isoformat(),
                        "access_type": "paid"
                    }],
                    user_token=user_token
                )

                # Log transaction (optional audit trail)
                await supabase_client.insert(
                    "credit_transactions",
                    [{
                        "user_id": current_user_id,
                        "amount": -1,
                        "transaction_type": "spend",
                        "credits_before": remaining_credits,
                        "credits_after": max(0, remaining_credits - 1),
                        "description": f"Event access purchase: {event_name or event_id}",
                        "event_id": event_id,
                        "created_at": datetime.now().isoformat()
                    }],
                    user_token=user_token
                )

                purchased_events.append(event_id)
                remaining_credits = max(0, remaining_credits - 1)
                        
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

# /api/credits/packages moved to backend/routers/credits.py

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

# Admin Credits endpoints moved to backend/routers/admin.py

# Debug endpoint moved to backend/routers/debug.py

# Admin users, overview, users/summary, credits/adjust, credits/purchases endpoints moved to backend/routers/admin.py

# Profile endpoints moved to backend/routers/profile.py

# FullResults endpoints moved to backend/routers/results.py




if __name__ == "__main__":
    import os
    port = int(os.getenv("PORT", 8000))
    print(f"Starting FastAPI server on http://localhost:{port}")
    uvicorn.run("backend_api:app", host="0.0.0.0", port=port, reload=True) 
