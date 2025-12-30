"""
Profile Router - User profile management endpoints.
"""

import os
import logging
from datetime import datetime
from typing import Dict, Any
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.models import ProfileUpdateRequest, VerifyPasswordRequest, PasswordChangeRequest

logger = logging.getLogger(__name__)
security = HTTPBearer()

# Rate limiter for sensitive endpoints
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api/profile", tags=["Profile"])


def get_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract raw token from credentials."""
    return credentials.credentials


async def get_supabase(request: Request):
    """Get supabase client from app state."""
    client = getattr(request.app.state, 'supabase_client', None)
    if not client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    return client


async def get_current_user_id(request: Request, token: str = Depends(get_user_token)) -> str:
    """Extract user ID from token."""
    from backend_api import extract_user_id_from_token
    from fastapi.security import HTTPAuthorizationCredentials
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    return await extract_user_id_from_token(creds)


@router.post("/update")
async def update_profile(
    req: ProfileUpdateRequest,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Update user profile information."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        update_data: Dict[str, Any] = {"updated_at": datetime.utcnow().isoformat()}
        if req.full_name is not None:
            update_data["full_name"] = req.full_name
        if req.organization is not None:
            update_data["organization"] = req.organization

        await supabase_client.update("user_profiles", update_data, {"id": current_user_id}, user_token)
        return {"success": True, "message": "Profile updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating profile: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")


@router.post("/verify-password")
@limiter.limit("5/minute")
async def verify_password(
    req: VerifyPasswordRequest,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Verify user's current password by attempting a password grant with Supabase Auth."""
    # Get current user to ensure authenticated
    await get_current_user_id(request, user_token)

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


@router.post("/change-password")
@limiter.limit("5/minute")
async def change_password(
    req: PasswordChangeRequest,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Change the authenticated user's password using Supabase Admin API."""
    current_user_id = await get_current_user_id(request, user_token)

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
