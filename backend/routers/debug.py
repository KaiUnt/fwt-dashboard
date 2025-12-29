"""
Debug Router - Debug and diagnostic endpoints.

Endpoints:
- GET /api/debug/user-role - Debug endpoint to check user role
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/debug", tags=["Debug"])

security = HTTPBearer(auto_error=True)


def get_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract raw user JWT token from credentials"""
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Authorization token required")
    return credentials.credentials


def get_supabase_client(request: Request):
    """Get Supabase client from app state."""
    return getattr(request.app.state, "supabase_client", None)


async def extract_user_id_from_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Import and use the main app's token extraction."""
    import sys
    if "backend_api" in sys.modules:
        main_module = sys.modules["backend_api"]
        return await main_module.extract_user_id_from_token(credentials)

    # Fallback: decode token directly
    import jwt
    token = credentials.credentials if credentials else None
    if not token:
        raise HTTPException(status_code=401, detail="Authorization token required")

    try:
        claims = jwt.decode(token, options={"verify_signature": False})
        user_id = claims.get("sub", "").strip()
        if not user_id:
            raise HTTPException(status_code=401, detail="User ID not found in token")
        return user_id
    except Exception as e:
        logger.error(f"Token decode error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")


@router.get("/user-role")
async def debug_user_role(
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Debug endpoint to check current user's role and token info"""
    supabase_client = get_supabase_client(request)
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
