"""
Users Router - User-related endpoints.

Endpoints:
- GET /api/users/check-username/{username} - Check username availability
"""

from fastapi import APIRouter, HTTPException, Request
from typing import Optional
import re
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["Users"])


def get_supabase_client(request: Request):
    """Get Supabase client from app state."""
    return getattr(request.app.state, "supabase_client", None)


@router.get("/check-username/{username}")
async def check_username_availability(username: str, request: Request):
    """Check if a username/full name is available.
    Allows letters (incl. Unicode), numbers, spaces, dots, underscores and hyphens, 2-30 chars.
    """
    supabase_client = get_supabase_client(request)
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
