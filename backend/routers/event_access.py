"""
Event Access Router - Supabase-based event access control and purchases.

Internal business logic endpoints for managing user access to events.

Endpoints:
- GET  /api/events/{event_id}/access - Check if user has access to an event
- POST /api/events/access-batch - Check access for multiple events
- POST /api/events/{event_id}/purchase - Purchase access to single event
- POST /api/events/purchase-multiple - Purchase access to multiple events
- GET  /api/user/events - Get all events user has access to
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging

from backend.models import (
    EventAccessResponse,
    PurchaseEventAccessRequest,
    PurchaseEventAccessResponse,
    MultiEventPurchaseRequest,
    MultiEventPurchaseResponse,
    BatchEventAccessRequest,
    BatchEventAccessResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Event Access"])

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
    """Import and use the main app's token extraction with full signature verification."""
    import sys
    if "backend_api" in sys.modules:
        main_module = sys.modules["backend_api"]
        return await main_module.extract_user_id_from_token(credentials)

    # Security: Never decode without verification - fail fast if main module not loaded
    logger.error("backend_api module not loaded - cannot verify JWT signature")
    raise HTTPException(status_code=500, detail="Authentication module not available")


@router.get("/api/events/{event_id}/access", response_model=EventAccessResponse)
async def check_event_access(
    event_id: str,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Check if user has access to a specific event"""
    supabase_client = get_supabase_client(request)
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        # 7-day free rule: if event is older than 7 days, grant access
        try:
            event_info = await supabase_client.select("events", "date", {"id": event_id}, user_token=user_token)
            if event_info and len(event_info) > 0:
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


@router.post("/api/events/access-batch", response_model=BatchEventAccessResponse)
async def check_batch_event_access(
    request_data: BatchEventAccessRequest,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Check if user has access to multiple events in a single request"""
    supabase_client = get_supabase_client(request)
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
                date_map = {}
                for e in events_info or []:
                    date_map[str(e.get("id"))] = e.get("date")
            except Exception:
                date_map = {}

            # Create set of accessible event IDs for fast lookup
            accessible_events = {item["event_id"] for item in user_access_result}

            # Check each requested event ID with free rule
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

        return BatchEventAccessResponse(
            success=True,
            access_status=access_status,
            message=f"Batch access check completed for {len(request_data.event_ids)} events"
        )

    except Exception as e:
        logger.error(f"Error in batch event access check: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to check batch event access: {str(e)}")


@router.post("/api/events/{event_id}/purchase", response_model=PurchaseEventAccessResponse)
async def purchase_event_access(
    event_id: str,
    request_data: PurchaseEventAccessRequest,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Purchase access to an event using credits (using secure RPC function)"""
    supabase_client = get_supabase_client(request)
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


@router.post("/api/events/purchase-multiple", response_model=MultiEventPurchaseResponse)
async def purchase_multiple_events(
    request_data: MultiEventPurchaseRequest,
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Purchase access to multiple events using credits"""
    supabase_client = get_supabase_client(request)
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    try:
        logger.info(
            "Multi-event purchase request for user %s (%d events)",
            current_user_id,
            len(request_data.event_ids),
        )

        result = await supabase_client.rpc(
            "purchase_multiple_event_access",
            {
                "event_ids_param": request_data.event_ids,
                "event_names_param": request_data.event_names,
            },
            user_token=user_token,
        )

        if not isinstance(result, dict):
            logger.error("Unexpected multi-event purchase RPC response type: %s", type(result).__name__)
            raise HTTPException(status_code=502, detail="Invalid response from purchase service")

        if not result.get("success", False):
            error_type = result.get("error", "purchase_failed")
            message = result.get("message", "Purchase failed")
            if error_type == "insufficient_credits":
                raise HTTPException(status_code=402, detail=message)
            if error_type == "invalid_request":
                raise HTTPException(status_code=400, detail=message)
            raise HTTPException(status_code=409, detail=message)

        return MultiEventPurchaseResponse(
            success=True,
            message=result.get("message", "Event access purchased successfully"),
            credits_remaining=int(result.get("credits_remaining", 0)),
            purchased_events=result.get("purchased_events", request_data.event_ids),
            failed_events=result.get("failed_events", []),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in multi-event purchase")
        raise HTTPException(status_code=500, detail="Failed to purchase events")


@router.get("/api/user/events")
async def get_user_accessible_events(
    request: Request,
    current_user_id: str = Depends(extract_user_id_from_token),
    user_token: str = Depends(get_user_token)
):
    """Get all events that user has access to"""
    supabase_client = get_supabase_client(request)
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
