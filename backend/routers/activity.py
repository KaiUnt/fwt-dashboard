"""
Activity Router - User activity logging and overview.
"""

import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.models import LogLoginRequest

logger = logging.getLogger(__name__)
security = HTTPBearer()

router = APIRouter(prefix="/api/activity", tags=["Activity"])


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


def get_admin_client(request: Request):
    """Get admin/service client from app state."""
    return getattr(request.app.state, 'service_supabase_client', None)


@router.post("/log-login")
async def log_login_activity(
    payload: LogLoginRequest,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Log user login activity."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)
    service_client = get_admin_client(request)

    client = service_client or supabase_client
    if not client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        data = [{
            "user_id": current_user_id,
            "login_timestamp": datetime.utcnow().isoformat(),
            "ip_address": payload.ip,
            "user_agent": payload.user_agent,
            "login_method": (payload.login_method or "email"),
        }]
        token_for_request = None if client is service_client else user_token
        await client.insert("user_login_activity", data, user_token=token_for_request)
        return {"success": True}

    except Exception as e:
        logger.error(f"Error logging login activity: {e}")
        raise HTTPException(status_code=500, detail="Failed to log login activity")


@router.get("/overview")
async def get_activity_overview(
    filter: str = "all",
    request: Request = None,
    user_token: str = Depends(get_user_token)
):
    """Get activity overview for current user."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

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
        actions = await supabase_client.select(
            "user_actions", "*", {"user_id": current_user_id}, user_token
        )
        if since:
            actions = [a for a in (actions or []) if a.get("timestamp", "") >= since]
        actions_sorted = sorted(actions or [], key=lambda a: a.get("timestamp", ""), reverse=True)[:50]

        # Login activity
        logins = await supabase_client.select(
            "user_login_activity", "*", {"user_id": current_user_id}, user_token
        )
        logins_sorted = sorted(logins or [], key=lambda a: a.get("login_timestamp", ""), reverse=True)[:20]

        # Stats
        total_actions = len(actions_sorted)
        today_actions = len([
            a for a in (actions or [])
            if a.get("timestamp", "").startswith(today.strftime("%Y-%m-%d"))
        ])
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

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building activity overview: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get activity overview: {str(e)}")
