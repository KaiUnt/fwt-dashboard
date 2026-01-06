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
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
import uvicorn
import logging
import time as _time
import httpx
import re

# Import from backend modules
from backend.db import SupabaseClient
from backend.routers import core as core_router
from backend.routers import credits as credits_router
from backend.routers import profile as profile_router
from backend.routers import activity as activity_router
from backend.routers import friends as friends_router
from backend.routers import commentator as commentator_router
from backend.routers import admin as admin_router
from backend.routers import results as results_router
from backend.routers import users as users_router
from backend.routers import events as events_router
from backend.routers import event_access as event_access_router
from backend.routers import video as video_router
from backend.routers import livescoring as livescoring_router
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import time
import jwt
import json
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
    docs_url="/docs" if os.getenv("ENVIRONMENT") == "development" else None,
    redoc_url="/redoc" if os.getenv("ENVIRONMENT") == "development" else None
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
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
    ],
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
app.include_router(events_router.router)

# Debug router disabled for security - only enable explicitly in local development
# To enable: set ENABLE_DEBUG_ROUTER=true AND ENVIRONMENT=development
if os.getenv("ENABLE_DEBUG_ROUTER") == "true" and os.getenv("ENVIRONMENT") == "development":
    from backend.routers import debug as debug_router
    app.include_router(debug_router.router)
    logger.warning("Debug router enabled - disable in production!")
app.include_router(event_access_router.router)
app.include_router(video_router.router)
app.include_router(livescoring_router.router)

# Register events router limiter
app.state.limiter = events_router.limiter

# Store service client for activity router
app.state.service_supabase_client = service_supabase_client

# Store admin client for admin router
app.state.admin_supabase_client = get_admin_client()

# Events endpoints moved to backend/routers/events.py

# Event access endpoints moved to backend/routers/event_access.py




if __name__ == "__main__":
    import os
    port = int(os.getenv("PORT", 8000))
    print(f"Starting FastAPI server on http://localhost:{port}")
    uvicorn.run("backend_api:app", host="0.0.0.0", port=port, reload=True) 
