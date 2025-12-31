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
