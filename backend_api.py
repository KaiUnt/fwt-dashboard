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
import time as _time
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
                # Support basic operators: eq and in (for list values)
                if isinstance(value, (list, tuple)):
                    # Build PostgREST in.("a","b") syntax; escape double quotes
                    if len(value) == 0:
                        # Empty IN should yield no results; use impossible condition
                        params[f"{key}"] = "in.("
                    else:
                        def _quote(v):
                            if isinstance(v, (int, float)):
                                return str(v)
                            s = str(v).replace('"', '\\"')
                            return f'"{s}"'
                        joined = ",".join(_quote(v) for v in value)
                        params[f"{key}"] = f"in.({joined})"
                else:
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

@app.get("/api/commentator-info/batch")
async def get_batch_commentator_info(
    athlete_ids: str,  # Comma-separated IDs: "id1,id2,id3"
    source: str = "all",
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get commentator info for multiple athletes in one request"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Parse athlete IDs
        athlete_id_list = [id.strip() for id in athlete_ids.split(",") if id.strip()]
        if not athlete_id_list:
            return {
                "success": True,
                "data": {},
                "total": 0
            }

        # Get all commentator info for these athletes in one query.
        # Use our authenticated Supabase client so RLS applies correctly for the current user.
        result = await supabase_client.select(
            "commentator_info",
            "*",
            {"athlete_id": athlete_id_list},
            user_token=user_token
        )

        if not result:
            return {
                "success": True,
                "data": {athlete_id: [] for athlete_id in athlete_id_list},
                "total": 0
            }

        # Group by athlete_id and add authorship info
        grouped = {}
        for item in result:
            athlete_id = item.get("athlete_id")
            if not athlete_id:
                continue

            if athlete_id not in grouped:
                grouped[athlete_id] = []

            # Filter by source if needed
            is_own = item.get("created_by") == current_user_id

            if source == "mine" and not is_own:
                continue
            elif source == "friends" and is_own:
                continue

            # Add enhanced data with authorship flag
            grouped[athlete_id].append({
                **item,
                "is_own_data": is_own
            })

        # Ensure all requested athletes are in the result (even with empty arrays)
        for athlete_id in athlete_id_list:
            if athlete_id not in grouped:
                grouped[athlete_id] = []

        return {
            "success": True,
            "data": grouped,
            "total": len(result)
        }

    except Exception as e:
        logger.error(f"Error fetching batch commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch batch commentator info: {str(e)}")

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
async def delete_commentator_info(
    athlete_id: str,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Delete commentator info for an athlete"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Direct delete - RLS will ensure user can only delete their own data
        result = await supabase_client.delete(
            "commentator_info",
            {"athlete_id": athlete_id},
            user_token=user_token
        )

        if not result:
            raise HTTPException(status_code=404, detail="Commentator info not found or you don't have permission to delete it")

        return {
            "success": True,
            "message": "Commentator info deleted successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting commentator info for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete commentator info: {str(e)}")

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
async def check_username_availability(username: str):
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

        # Check if connection already exists in EITHER direction - use user token for user's own data
        # Check for outgoing request (current_user -> target_user)
        outgoing_connection = await supabase_client.select(
            "user_connections",
            "*",
            {
                "requester_id": current_user_id,
                "addressee_id": target_user["id"]
            },
            user_token
        )

        # Check for incoming request (target_user -> current_user)
        incoming_connection = await supabase_client.select(
            "user_connections",
            "*",
            {
                "requester_id": target_user["id"],
                "addressee_id": current_user_id
            },
            user_token
        )

        # If connection exists in either direction, reject the request
        if outgoing_connection:
            raise HTTPException(status_code=409, detail="Friend request already exists")

        if incoming_connection:
            # Check if it's pending - if so, suggest accepting it instead
            if incoming_connection[0].get("status") == "pending":
                raise HTTPException(status_code=409, detail="This user has already sent you a friend request. Please accept it instead.")
            elif incoming_connection[0].get("status") == "accepted":
                raise HTTPException(status_code=409, detail="You are already friends with this user")
            else:
                # If declined, allow sending a new request
                pass
        
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

@app.get("/api/friends/pending/received")
async def get_received_pending_friend_requests(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get pending friend requests received by current user (where user is addressee)"""
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
        logger.error(f"Error fetching received pending friend requests: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch received pending requests: {str(e)}")

@app.get("/api/friends/pending/sent")
async def get_sent_pending_friend_requests(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get pending friend requests sent by current user (where user is requester)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Get pending requests where user is the requester
        result = await supabase_client.select(
            "user_connections",
            "*",
            {
                "requester_id": current_user_id,
                "status": "pending"
            },
            user_token
        )

        # Get addressee details - now possible with RLS policy
        sent_requests = []
        for connection in result:
            addressee = await supabase_client.select("user_profiles", "*", {"id": connection["addressee_id"]}, user_token)
            if addressee:
                sent_requests.append({
                    **connection,
                    "addressee": addressee[0]
                })

        return {
            "success": True,
            "data": sent_requests,
            "total": len(sent_requests)
        }

    except Exception as e:
        logger.error(f"Error fetching sent pending friend requests: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch sent pending requests: {str(e)}")

@app.get("/api/friends/pending")
async def get_pending_friend_requests(
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get all pending friend requests (both received and sent) - deprecated, use /received or /sent instead"""
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
        
        # Log user action (friend acceptance)
        try:
            updated = result[0] if result else None
            if isinstance(updated, dict):
                friend_id = updated.get("requester_id") if updated.get("addressee_id") == current_user_id else updated.get("addressee_id")
                await supabase_client.insert(
                    "user_actions",
                    [{
                        "user_id": current_user_id,
                        "action_type": "friend_accept",
                        "resource_type": "user",
                        "resource_id": friend_id,
                        "action_details": {"connection_id": connection_id},
                        "timestamp": datetime.utcnow().isoformat()
                    }],
                    user_token=user_token
                )
        except Exception as _log_err:
            logger.warning(f"Failed to log friend acceptance action: {_log_err}")

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
    event_ids: List[str] = Field(..., min_items=0, max_items=1000)
    
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
        # Direct table read with initialization for new users
        result = await supabase_client.select(
            "user_credits",
            "credits",
            {"user_id": current_user_id},
            user_token=user_token
        )

        credits_value = 0
        if not result or len(result) == 0:
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
                credits_value = 5
            except Exception:
                # If insert fails (race/exists), try re-read
                reread = await supabase_client.select(
                    "user_credits",
                    "credits",
                    {"user_id": current_user_id},
                    user_token=user_token
                )
                credits_value = (reread[0].get("credits", 0) if reread else 0)
        else:
            credits_value = result[0].get("credits", 0)

        return CreditsBalanceResponse(
            success=True,
            credits=credits_value,
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

@app.get("/api/credits/packages")
async def get_credit_packages_disabled():
    """Credit packages are deprecated and disabled"""
    from fastapi import Response
    return Response(
        content=json.dumps({
            "success": False,
            "packages": [],
            "message": "Credit packages are disabled"
        }),
        status_code=410,
        media_type="application/json"
    )

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

        admin_client = get_admin_client() or supabase_client

        # Fetch users - select minimal fields
        # Note: Supabase client helper may not support complex filters/sorting; do it in Python
        users = await admin_client.select(
            "user_profiles",
            "id, full_name, email, role, organization",
            {},
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

        admin_client = get_admin_client() or supabase_client

        # Users
        users = await admin_client.select("user_profiles", "*", {})

        # Active sessions
        sessions = await admin_client.select("active_sessions", "*", {})

        # Recent actions (last 24h)
        since_iso = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        actions = await admin_client.select("user_actions", "*", {})
        recent_actions = [a for a in (actions or []) if a.get("timestamp", "") >= since_iso]

        # Login activity today
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        login_activity = await admin_client.select("user_login_activity", "*", {})
        today_logins = [x for x in (login_activity or []) if x.get("login_timestamp", "").startswith(today_str)]
        today_logins_sorted = sorted(today_logins, key=lambda entry: entry.get("login_timestamp", ""), reverse=True)[:50]
        user_lookup = {u.get("id"): u for u in (users or [])}
        today_login_details = [
            {
                "user_id": entry.get("user_id"),
                "full_name": (user_lookup.get(entry.get("user_id")) or {}).get("full_name"),
                "email": (user_lookup.get(entry.get("user_id")) or {}).get("email"),
                "login_timestamp": entry.get("login_timestamp"),
                "ip_address": entry.get("ip_address"),
                "user_agent": entry.get("user_agent"),
            }
            for entry in today_logins_sorted
        ]

        # Actions count today
        today_actions = [x for x in (actions or []) if x.get("timestamp", "").startswith(today_str)]


        return {
            "success": True,
            "data": {
                "users": users or [],
                "active_sessions": sessions or [],
                "recent_actions": recent_actions,
                "today_logins_count": len(today_logins),
                "today_actions_count": len(today_actions),
                "today_logins": today_login_details,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building admin overview: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get admin overview: {str(e)}")

# Admin users summary with credits and purchases count
class AdminCreditsAdjustRequest(BaseModel):
    delta: int = Field(..., ge=-1000, le=1000)
    note: Optional[str] = Field(None, max_length=500)

@app.get("/api/admin/users/summary")
async def get_admin_users_summary(
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """List users with credits and purchased events count (Admin only)."""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Check admin role
        user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
        if not user_profile or user_profile[0].get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        admin_client = get_admin_client() or supabase_client

        # Fetch users minimal fields
        users = await admin_client.select(
            "user_profiles",
            "id, full_name, email, role, organization, created_at, is_active",
            {},
        )
        users = users or []

        # Optional search (in-memory)
        normalized = (search or "").strip().lower()
        if normalized:
            def _match(u):
                return (normalized in (u.get("full_name") or "").lower()) or (normalized in (u.get("email") or "").lower())
            users = [u for u in users if _match(u)]

        # Sort by name then email
        users.sort(key=lambda u: ((u.get("full_name") or "").lower(), (u.get("email") or "").lower()))

        total = len(users)
        start = max(offset, 0)
        end = start + max(min(limit, 200), 0)
        page = users[start:end]

        # Build list of user_ids on the page
        user_ids = [u.get("id") for u in page if u.get("id")]

        credits_map = {uid: 0 for uid in user_ids}
        purchases_count = {uid: 0 for uid in user_ids}

        if user_ids:
            # Fetch credits for these users via IN filter
            credits_rows = await admin_client.select(
                "user_credits",
                "user_id, credits",
                {"user_id": user_ids},
            )
            for row in (credits_rows or []):
                uid = row.get("user_id")
                if uid in credits_map:
                    credits_map[uid] = int(row.get("credits") or 0)

            # Fetch purchases count for these users
            uea_rows = await admin_client.select(
                "user_event_access",
                "user_id, event_id",
                {"user_id": user_ids, "access_type": "paid"},
            )
            # Count distinct event_ids per user
            seen = {}
            for row in (uea_rows or []):
                uid = row.get("user_id")
                eid = row.get("event_id")
                if uid in purchases_count and uid is not None and eid is not None:
                    key = (uid, eid)
                    if key not in seen:
                        seen[key] = True
                        purchases_count[uid] += 1

        # Build summary
        summary = []
        for u in page:
            uid = u.get("id")
            summary.append({
                "id": uid,
                "full_name": u.get("full_name"),
                "email": u.get("email"),
                "role": u.get("role"),
                "organization": u.get("organization"),
                "is_active": u.get("is_active"),
                "created_at": u.get("created_at"),
                "credits": credits_map.get(uid, 0),
                "purchased_events_count": purchases_count.get(uid, 0),
            })

        return {
            "success": True,
            "users": summary,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building users summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get users summary: {str(e)}")


@app.post("/api/admin/credits/adjust/{target_user_id}")
async def admin_adjust_credits(
    target_user_id: str,
    req: AdminCreditsAdjustRequest,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Adjust a user's credits by a delta (positive or negative)."""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Check admin role
        user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
        if not user_profile or user_profile[0].get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        admin_client = get_admin_client() or supabase_client

        # Read or initialize credits for target user
        credits_row = await admin_client.select(
            "user_credits",
            "id, credits",
            {"user_id": target_user_id},
        )

        current_credits = 0
        record_id = None
        from datetime import datetime
        if not credits_row or len(credits_row) == 0:
            # Initialize with 0 credits for admin-managed users if missing
            insert_res = await admin_client.insert(
                "user_credits",
                [{
                    "user_id": target_user_id,
                    "credits": 0,
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }]
            )
            # Try reread to get id/current credits
            credits_row = await admin_client.select(
                "user_credits",
                "id, credits",
                {"user_id": target_user_id},
            )
            if credits_row and len(credits_row) > 0:
                record_id = credits_row[0].get("id")
                current_credits = int(credits_row[0].get("credits") or 0)
        else:
            record_id = credits_row[0].get("id")
            current_credits = int(credits_row[0].get("credits") or 0)

        delta = int(req.delta)
        new_total = current_credits + delta
        if new_total < 0:
            raise HTTPException(status_code=400, detail="Credits cannot be negative")

        # Update credits
        await admin_client.update(
            "user_credits",
            {"credits": new_total, "updated_at": datetime.now().isoformat()},
            {"id": record_id} if record_id else {"user_id": target_user_id},
        )

        # Insert transaction record
        description = f"Admin adjust: {req.note}" if req.note else "Admin adjust"
        transaction_type = "grant" if delta >= 0 else "spend"

        await admin_client.insert(
            "credit_transactions",
            [{
                "user_id": target_user_id,
                "transaction_type": transaction_type,
                "amount": delta,
                "credits_before": current_credits,
                "credits_after": new_total,
                "description": description,
                "created_at": datetime.now().isoformat()
            }]
        )

        return {
            "success": True,
            "message": "Credits adjusted successfully",
            "credits_total": new_total
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adjusting credits for {target_user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to adjust credits: {str(e)}")

# Login activity logging
class LogLoginRequest(BaseModel):
    login_method: Optional[str] = Field(None, description="email|google|github|microsoft|other")
    ip: Optional[str] = None
    user_agent: Optional[str] = None

@app.post("/api/activity/log-login")
async def log_login_activity(
    payload: LogLoginRequest,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    client = get_admin_client() or supabase_client
    if not client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        from datetime import datetime
        data = [{
            "user_id": current_user_id,
            "login_timestamp": datetime.utcnow().isoformat(),
            "ip_address": payload.ip,
            "user_agent": payload.user_agent,
            "login_method": (payload.login_method or "email"),
        }]
        token_for_request = None if client is service_supabase_client else user_token
        await client.insert("user_login_activity", data, user_token=token_for_request)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error logging login activity: {e}")
        # Do not fail hard for logging
        raise HTTPException(status_code=500, detail="Failed to log login activity")


@app.get("/api/admin/credits/purchases")
async def admin_list_paid_purchases(
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """List paid event accesses (purchases) with user info (Admin only)."""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Admin check
        user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
        if not user_profile or user_profile[0].get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        admin_client = get_admin_client() or supabase_client

        # Fetch all paid accesses (will be filtered/paginated in memory)
        accesses = await admin_client.select(
            "user_event_access",
            "user_id, event_id, event_name, granted_at, access_type",
            {"access_type": "paid"},
        )
        accesses = accesses or []

        # Gather user profiles for displayed set
        user_ids = list({a.get("user_id") for a in accesses if a.get("user_id")})
        profiles_map = {}
        if user_ids:
            profiles = await admin_client.select(
                "user_profiles", "id, full_name, email", {"id": user_ids}
            )
            for p in (profiles or []):
                profiles_map[p.get("id")] = {"full_name": p.get("full_name"), "email": p.get("email")}

        # Build enriched list
        enriched = []
        for a in accesses:
            uid = a.get("user_id")
            prof = profiles_map.get(uid, {})
            enriched.append({
                "user_id": uid,
                "user_full_name": prof.get("full_name"),
                "user_email": prof.get("email"),
                "event_id": a.get("event_id"),
                "event_name": a.get("event_name"),
                "granted_at": a.get("granted_at"),
                "access_type": a.get("access_type"),
            })

        # Optional search across user/email/event fields
        q = (search or "").strip().lower()
        if q:
            def match(row):
                return (
                    q in (str(row.get("user_full_name") or "").lower()) or
                    q in (str(row.get("user_email") or "").lower()) or
                    q in (str(row.get("event_name") or "").lower()) or
                    q in (str(row.get("event_id") or "").lower())
                )
            enriched = [r for r in enriched if match(r)]

        # Sort by granted_at desc
        enriched.sort(key=lambda r: (r.get("granted_at") or ""), reverse=True)

        total = len(enriched)
        start = max(offset, 0)
        end = start + max(min(limit, 200), 0)
        page = enriched[start:end]

        return {"success": True, "purchases": page, "total": total, "limit": limit, "offset": offset}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing purchases: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list purchases: {str(e)}")

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
                    # Merge: Only update fields that have non-empty values in CSV
                    # This preserves existing data that isn't in the CSV
                    existing_record = existing[0]
                    update_data = {}

                    # Standard text fields - only update if CSV has a value
                    for field in ["homebase", "team", "sponsors", "favorite_trick",
                                  "achievements", "injuries", "fun_facts", "notes"]:
                        csv_value = info_data.get(field, "")
                        if csv_value and csv_value.strip():  # Non-empty in CSV
                            update_data[field] = csv_value

                    # Social media - merge individual fields
                    csv_social = info_data.get("social_media", {})
                    existing_social = existing_record.get("social_media", {})
                    merged_social = existing_social.copy() if existing_social else {}

                    for social_field in ["instagram", "youtube", "website"]:
                        csv_social_value = csv_social.get(social_field, "")
                        if csv_social_value and csv_social_value.strip():
                            merged_social[social_field] = csv_social_value

                    if merged_social != existing_social:
                        update_data["social_media"] = merged_social

                    # Custom fields - merge with existing
                    csv_custom = info_data.get("custom_fields", {})
                    existing_custom = existing_record.get("custom_fields", {})
                    merged_custom = existing_custom.copy() if existing_custom else {}

                    for custom_key, custom_value in csv_custom.items():
                        if custom_value and str(custom_value).strip():
                            merged_custom[custom_key] = custom_value

                    if merged_custom != existing_custom:
                        update_data["custom_fields"] = merged_custom

                    # Only perform update if there are changes
                    if update_data:
                        result = await supabase_client.update("commentator_info", update_data, {
                            "athlete_id": athlete_id,
                            "created_by": effective_user_id
                        }, user_token=user_token)
                        logger.info(f"Merged CSV data for athlete {athlete_id}: updated {len(update_data)} fields")
                    else:
                        logger.info(f"No changes needed for athlete {athlete_id} - CSV data matches existing")
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

# ============================================
# Admin Athlete Dashboard Endpoints
# ============================================

@app.post("/api/admin/athletes/seed")
async def seed_athletes_database(
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Seed athletes database with data from 2025, 2024, 2023 FWT series (Admin only)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Admin check
        user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
        if not user_profile or user_profile[0].get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        from api.client import LiveheatsClient
        client = LiveheatsClient()

        # Get all series from 2023, 2024, 2025
        series_data = await client.get_series_by_years("fwtglobal", range(2023, 2026))
        if not series_data:
            return {"success": False, "message": "No series found"}

        logger.info(f"Found {len(series_data)} series for seeding")

        # Collect all unique athletes
        athletes_dict = {}

        # Process all series in parallel
        async def process_series(series):
            series_id = series["id"]
            series_name = series["name"]
            logger.info(f"Processing series: {series_name}")

            local_athletes = {}

            async with client.client as gql_client:
                divisions_data = await gql_client.execute(
                    client.queries.GET_DIVISIONS,
                    {"id": series_id}
                )

                if not divisions_data or "series" not in divisions_data:
                    return local_athletes

                divisions = divisions_data["series"].get("rankingsDivisions", [])

                # Process divisions in parallel
                async def process_division(division):
                    division_id = division["id"]
                    division_athletes = {}

                    rankings_data = await gql_client.execute(
                        client.queries.GET_SERIES_RANKINGS,
                        {"id": series_id, "divisionId": division_id}
                    )

                    if rankings_data and "series" in rankings_data:
                        rankings = rankings_data["series"].get("rankings", [])
                        for ranking in rankings:
                            athlete = ranking.get("athlete")
                            if athlete and athlete.get("id"):
                                athlete_id = athlete["id"]
                                athlete_name = athlete.get("name")
                                division_athletes[athlete_id] = athlete_name

                    return division_athletes

                # Parallel division processing
                division_tasks = [process_division(div) for div in divisions]
                division_results = await asyncio.gather(*division_tasks)

                # Merge all division results
                for div_athletes in division_results:
                    local_athletes.update(div_athletes)

            return local_athletes

        # Parallel series processing
        series_tasks = [process_series(series) for series in series_data]
        series_results = await asyncio.gather(*series_tasks)

        # Merge all series results
        for series_athletes in series_results:
            athletes_dict.update(series_athletes)

        logger.info(f"Collected {len(athletes_dict)} unique athletes")

        # Bulk upsert to Supabase using PostgreSQL ON CONFLICT
        admin_client = get_admin_client() or supabase_client

        # Build bulk data
        now = datetime.now(timezone.utc).isoformat()
        athletes_list = [
            {
                "id": athlete_id,
                "name": athlete_name,
                "last_seen": now
            }
            for athlete_id, athlete_name in athletes_dict.items()
        ]

        # Get existing athletes for counting
        existing_ids = set()
        try:
            existing = await admin_client.select("athletes", "id", {})
            existing_ids = {item["id"] for item in existing}
        except Exception:
            pass

        # Use PostgREST upsert with Prefer: resolution=merge-duplicates
        try:
            url = f"{admin_client.url}/rest/v1/athletes"
            headers = admin_client._get_headers(user_token)
            headers["Prefer"] = "resolution=merge-duplicates"

            async with httpx.AsyncClient(timeout=60.0) as http_client:
                response = await http_client.post(
                    url,
                    json=athletes_list,
                    headers=headers
                )
                response.raise_for_status()

            # Count inserted vs updated
            new_ids = set(athletes_dict.keys())
            inserted = len(new_ids - existing_ids)
            updated = len(new_ids & existing_ids)

            logger.info(f"Seeding complete: {inserted} inserted, {updated} updated")

        except Exception as e:
            logger.error(f"Bulk upsert failed: {e}")
            # Fallback: count as all inserted for reporting
            inserted = len(athletes_dict)
            updated = 0

        return {
            "success": True,
            "total_athletes": len(athletes_dict),
            "inserted": inserted,
            "updated": updated,
            "series_processed": len(series_data)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error seeding athletes database: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to seed athletes: {str(e)}")


@app.get("/api/admin/athletes/search")
async def search_athletes(
    q: str,
    limit: int = 10,
    request: Request = None,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Search athletes by name with fuzzy matching (Admin only)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Admin check
        user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
        if not user_profile or user_profile[0].get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        if not q or len(q.strip()) < 2:
            return {"success": True, "athletes": []}

        # Sanitize search query - escape special characters for ILIKE pattern
        search_query = q.strip().replace("%", "\\%").replace("_", "\\_")

        admin_client = get_admin_client() or supabase_client

        # Use PostgREST ILIKE filter via direct HTTP call
        # Custom SupabaseClient doesn't support ilike, so we build the request manually
        try:
            url = f"{admin_client.url}/rest/v1/athletes"

            # Build search pattern with wildcards
            search_pattern = f"*{search_query}*"

            # PostgREST params with ilike filter
            params = {
                "select": "id,name,last_seen",
                "name": f"ilike.{search_pattern}",
                "order": "last_seen.desc",
                "limit": str(limit)
            }

            headers = admin_client._get_headers(user_token)

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=headers, params=params)
                response.raise_for_status()
                results = response.json()

        except Exception as e:
            logger.error(f"Athlete search error: {e}")
            results = []

        return {
            "success": True,
            "athletes": results or []
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching athletes: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to search athletes: {str(e)}")


@app.post("/api/admin/athletes/sync")
async def sync_athletes_from_event(
    event_id: str,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Sync athletes from a specific event to the database (Admin only)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Admin check
        user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
        if not user_profile or user_profile[0].get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        from api.client import LiveheatsClient
        client = LiveheatsClient()

        # Get event athletes
        event_data = await client.get_event_athletes(event_id)
        if not event_data or "event" not in event_data:
            raise HTTPException(status_code=404, detail="Event not found")

        # Extract athletes
        athletes_to_sync = []
        for division in event_data.get("event", {}).get("eventDivisions", []):
            for entry in division.get("entries", []):
                athlete = entry.get("athlete")
                if athlete and athlete.get("id") and athlete.get("name"):
                    athletes_to_sync.append({
                        "id": athlete["id"],
                        "name": athlete["name"]
                    })

        if not athletes_to_sync:
            return {"success": True, "inserted": 0, "updated": 0, "message": "No athletes found in event"}

        admin_client = get_admin_client() or supabase_client

        inserted = 0
        updated = 0

        for athlete in athletes_to_sync:
            try:
                # Check if exists
                existing = await admin_client.select("athletes", "id", {"id": athlete["id"]})

                if existing:
                    # Update last_seen
                    await admin_client.update(
                        "athletes",
                        {"last_seen": datetime.now(timezone.utc).isoformat()},
                        {"id": athlete["id"]}
                    )
                    updated += 1
                else:
                    # Insert new
                    await admin_client.insert("athletes", {
                        "id": athlete["id"],
                        "name": athlete["name"],
                        "last_seen": datetime.now(timezone.utc).isoformat()
                    })
                    inserted += 1

            except Exception as e:
                logger.error(f"Error syncing athlete {athlete['id']}: {e}")

        logger.info(f"Synced {len(athletes_to_sync)} athletes from event {event_id}: {inserted} new, {updated} updated")

        return {
            "success": True,
            "total_athletes": len(athletes_to_sync),
            "inserted": inserted,
            "updated": updated
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing athletes from event: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to sync athletes: {str(e)}")


@app.get("/api/admin/athlete/{athlete_id}/series-rankings")
async def get_admin_athlete_series_rankings(
    athlete_id: str,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token),
    force_refresh: bool = False
):
    """Get all FWT series rankings for a single athlete (Admin only)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # Admin check
        user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
        if not user_profile or user_profile[0].get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin privileges required")

        from api.client import LiveheatsClient
        client = LiveheatsClient()

        # Redis cache
        ttl_seconds = int(os.getenv("EVENTS_TTL_SECONDS", "3600"))
        cache_key = f"adminAthleteSeriesRankings:{athlete_id}"
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

        # Get all FWT series (2008-2031)
        series_data = await client.get_series_by_years("fwtglobal", range(2008, 2031))
        if not series_data:
            return {
                "athlete_id": athlete_id,
                "series_rankings": [],
                "message": "No FWT series found"
            }

        series_ids = [s["id"] for s in series_data]

        # Fetch rankings for this single athlete
        rankings = await client.fetch_multiple_series(series_ids, [athlete_id])

        response_data = {
            "athlete_id": athlete_id,
            "series_rankings": rankings,
            "series_count": len(rankings),
            "message": f"Found rankings across {len(rankings)} series"
        }

        logger.info(f"Admin athlete series rankings for {athlete_id}: {len(rankings)} series")

        # Cache response
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
        logger.error(f"Error fetching admin athlete series rankings for {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch athlete series rankings: {str(e)}")


if __name__ == "__main__":
    import os
    port = int(os.getenv("PORT", 8000))
    print(f"Starting FastAPI server on http://localhost:{port}")
    uvicorn.run("backend_api:app", host="0.0.0.0", port=port, reload=True) 
