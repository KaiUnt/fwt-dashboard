"""
Shared FastAPI Dependencies

Reusable dependency functions to reduce code duplication across endpoints.
"""

from fastapi import HTTPException, Depends
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def require_supabase(client):
    """
    Dependency that ensures Supabase client is available.

    Usage:
        @app.get("/api/example")
        async def example(
            _: None = Depends(lambda: require_supabase(supabase_client))
        ):
            ...

    Or use the factory function get_supabase_dependency() below.
    """
    if not client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    return client


def get_supabase_dependency(client):
    """
    Factory that creates a dependency for Supabase client check.

    Usage:
        supabase_required = get_supabase_dependency(supabase_client)

        @app.get("/api/example")
        async def example(db = Depends(supabase_required)):
            result = await db.select(...)
    """
    async def dependency():
        if not client:
            raise HTTPException(status_code=503, detail="Supabase not configured")
        return client
    return dependency


async def require_admin(
    current_user_id: str,
    user_token: str,
    supabase_client,
) -> None:
    """
    Verify that the current user has admin privileges.

    Raises HTTPException 403 if not admin.

    Usage:
        await require_admin(current_user_id, user_token, supabase_client)
    """
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        user_profile = await supabase_client.select(
            "user_profiles",
            "role",
            {"id": current_user_id},
            user_token
        )

        if not user_profile or user_profile[0].get("role") != "admin":
            logger.warning(f"Admin access denied for user {current_user_id}")
            raise HTTPException(status_code=403, detail="Admin privileges required")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking admin status: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify admin status")


def create_admin_dependency(supabase_client, extract_user_id_from_token, get_user_token):
    """
    Factory that creates an admin-required dependency.

    Usage:
        admin_required = create_admin_dependency(supabase_client, extract_user_id_from_token, get_user_token)

        @app.get("/api/admin/something")
        async def admin_endpoint(
            current_user_id: str = Depends(extract_user_id_from_token),
            user_token: str = Depends(get_user_token),
            _: None = Depends(admin_required)
        ):
            ...
    """
    async def dependency(
        current_user_id: str = Depends(extract_user_id_from_token),
        user_token: str = Depends(get_user_token)
    ):
        await require_admin(current_user_id, user_token, supabase_client)
        return current_user_id

    return dependency
