"""
Core Router - Health check and root endpoints.
"""

from datetime import datetime
from fastapi import APIRouter, Request

router = APIRouter(tags=["Core"])


@router.get("/")
async def root(request: Request):
    """Root endpoint - API status."""
    return {
        "message": "FWT Events API is running",
        "version": "1.0.0",
        "status": "healthy"
    }


@router.get("/health")
async def health_check(request: Request):
    """Health check endpoint for monitoring."""
    # Access supabase_client from app state
    supabase_available = getattr(request.app.state, 'supabase_client', None) is not None

    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "supabase_available": supabase_available
    }
