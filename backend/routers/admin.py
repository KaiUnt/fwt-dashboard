"""
Admin Router - Admin panel endpoints for user management, credits, and athletes.
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.models import GrantCreditsRequest, AdminCreditsAdjustRequest

logger = logging.getLogger(__name__)
security = HTTPBearer()

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def get_user_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract raw token from credentials."""
    return credentials.credentials


async def get_supabase(request: Request):
    """Get supabase client from app state."""
    client = getattr(request.app.state, 'supabase_client', None)
    if not client:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    return client


async def get_admin_client(request: Request):
    """Get admin supabase client from app state."""
    return getattr(request.app.state, 'admin_supabase_client', None)


async def get_current_user_id(request: Request, token: str = Depends(get_user_token)) -> str:
    """Extract user ID from token."""
    from backend_api import extract_user_id_from_token
    from fastapi.security import HTTPAuthorizationCredentials
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    return await extract_user_id_from_token(creds)


async def require_admin(request: Request, user_token: str) -> str:
    """Check if user is admin and return user_id."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
    if not user_profile or user_profile[0].get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")

    return current_user_id


@router.post("/credits/grant/{user_id}")
async def grant_credits_to_user(
    user_id: str,
    grant_request: GrantCreditsRequest,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Grant credits to a user (Admin only)"""
    supabase_client = await get_supabase(request)

    try:
        # Check if current user is admin - this is done in the RPC function
        result = await supabase_client.rpc("grant_admin_credits", {
            "target_user_id": user_id,
            "credits_to_grant": grant_request.credits,
            "admin_note": grant_request.note
        }, user_token)

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


@router.get("/credits/stats")
async def get_credits_statistics(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get credits system statistics (Admin only)"""
    supabase_client = await get_supabase(request)
    current_user_id = await require_admin(request, user_token)

    try:
        # Get various statistics
        total_users = await supabase_client.select("user_credits", "COUNT(*)", {}, user_token)
        total_credits_distributed = await supabase_client.select("user_credits", "SUM(credits)", {}, user_token)
        total_transactions = await supabase_client.select("credit_transactions", "COUNT(*)", {}, user_token)
        total_purchases = await supabase_client.select("credit_purchases", "COUNT(*)", {"payment_status": "completed"}, user_token)

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


@router.get("/users")
async def get_admin_users(
    request: Request,
    search: str = "",
    limit: int = 200,
    offset: int = 0,
    user_token: str = Depends(get_user_token)
):
    """List users for the admin panel (Admin only)."""
    supabase_client = await get_supabase(request)
    current_user_id = await require_admin(request, user_token)

    try:
        admin_client = await get_admin_client(request) or supabase_client

        # Fetch users - select minimal fields
        users = await admin_client.select(
            "user_profiles",
            "id, full_name, email, role, organization",
            {},
            user_token,
        )

        if users is None:
            users = []

        # Filter by search term (case-insensitive) if provided
        if search:
            search_lower = search.lower()
            users = [
                u for u in users
                if search_lower in (u.get("full_name") or "").lower()
                or search_lower in (u.get("email") or "").lower()
            ]

        total = len(users)

        # Apply pagination
        users = users[offset: offset + limit]

        return {
            "success": True,
            "data": users,
            "total": total,
            "limit": limit,
            "offset": offset
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing admin users: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list users: {str(e)}")


@router.get("/users/summary")
async def get_users_summary(
    request: Request,
    search: str = "",
    limit: int = 20,
    offset: int = 0,
    user_token: str = Depends(get_user_token)
):
    """Get user summary with credits and purchased events (Admin only)"""
    supabase_client = await get_supabase(request)
    current_user_id = await require_admin(request, user_token)

    try:
        admin_client = await get_admin_client(request) or supabase_client

        # Get all user profiles
        users = await admin_client.select("user_profiles", "*", {}, user_token)
        if users is None:
            users = []

        # Get all credits
        credits = await admin_client.select("user_credits", "*", {}, user_token)
        if credits is None:
            credits = []

        # Get all event access records
        event_access = await admin_client.select("user_event_access", "user_id, id", {}, user_token)
        if event_access is None:
            event_access = []

        # Build lookups
        credits_lookup = {c["user_id"]: c.get("credits", 0) for c in credits}

        # Count purchased events per user
        events_count_lookup = {}
        for access in event_access:
            user_id = access.get("user_id")
            if user_id:
                events_count_lookup[user_id] = events_count_lookup.get(user_id, 0) + 1

        # Build user summary list
        user_summaries = []
        for u in users:
            user_id = u.get("id")
            user_summaries.append({
                "id": user_id,
                "full_name": u.get("full_name"),
                "email": u.get("email"),
                "role": u.get("role"),
                "organization": u.get("organization"),
                "is_active": u.get("is_active"),
                "created_at": u.get("created_at"),
                "credits": credits_lookup.get(user_id, 0),
                "purchased_events_count": events_count_lookup.get(user_id, 0),
            })

        # Filter by search term if provided
        if search:
            search_lower = search.lower()
            user_summaries = [
                u for u in user_summaries
                if search_lower in (u.get("full_name") or "").lower()
                or search_lower in (u.get("email") or "").lower()
            ]

        total = len(user_summaries)

        # Apply pagination
        user_summaries = user_summaries[offset: offset + limit]

        return {
            "success": True,
            "users": user_summaries,
            "total": total,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting users summary: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get summary: {str(e)}")


@router.get("/overview")
async def get_admin_overview(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get admin dashboard overview (Admin only)"""
    supabase_client = await get_supabase(request)
    current_user_id = await require_admin(request, user_token)

    try:
        admin_client = await get_admin_client(request) or supabase_client

        # Get all user profiles for the users list
        users = await admin_client.select("user_profiles", "*", {}, user_token)
        if users is None:
            users = []

        # Get today's logins
        from datetime import timedelta
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        login_activity = await admin_client.select("user_login_activity", "*", {}, user_token)
        if login_activity is None:
            login_activity = []

        today_logins = [x for x in login_activity if (x.get("login_timestamp") or "").startswith(today_str)]
        today_logins_sorted = sorted(today_logins, key=lambda entry: entry.get("login_timestamp", ""), reverse=True)[:50]

        # Build user lookup for login details
        user_lookup = {u.get("id"): u for u in users}
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

        return {
            "success": True,
            "data": {
                "users": users,
                "today_logins_count": len(today_logins),
                "today_logins": today_login_details,
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting admin overview: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get overview: {str(e)}")


@router.post("/credits/adjust/{target_user_id}")
async def adjust_user_credits(
    target_user_id: str,
    adjustment: AdminCreditsAdjustRequest,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Adjust credits for a user (Admin only)"""
    supabase_client = await get_supabase(request)
    current_user_id = await require_admin(request, user_token)

    try:
        delta = adjustment.delta
        reason = adjustment.note or "Admin adjustment"

        if delta == 0:
            raise HTTPException(status_code=400, detail="Amount cannot be zero")

        # Get current credits
        credits_row = await supabase_client.select(
            "user_credits",
            "credits",
            {"user_id": target_user_id},
            user_token,
        )

        current_credits = credits_row[0].get("credits", 0) if credits_row else 0
        new_credits = max(0, current_credits + delta)

        # Update credits
        if credits_row:
            await supabase_client.update(
                "user_credits",
                {"credits": new_credits, "updated_at": datetime.now().isoformat()},
                {"user_id": target_user_id},
                user_token,
            )
        else:
            await supabase_client.insert(
                "user_credits",
                [{
                    "user_id": target_user_id,
                    "credits": new_credits,
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }],
                user_token,
            )

        transaction_type = "grant" if delta > 0 else "spend"

        # Log transaction
        await supabase_client.insert(
            "credit_transactions",
            [{
                "user_id": target_user_id,
                "amount": delta,
                "transaction_type": transaction_type,
                "credits_before": current_credits,
                "credits_after": new_credits,
                "description": f"Admin adjustment by {current_user_id}: {reason}",
                "created_at": datetime.now().isoformat()
            }],
            user_token,
        )

        return {
            "success": True,
            "message": f"Credits adjusted by {delta}",
            "credits_before": current_credits,
            "credits_after": new_credits
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adjusting credits: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to adjust credits: {str(e)}")


@router.get("/credits/purchases")
async def list_credit_purchases(
    request: Request,
    search: str = "",
    status: str = None,
    limit: int = 20,
    offset: int = 0,
    user_token: str = Depends(get_user_token)
):
    """List event purchases with user and event info (Admin only)"""
    supabase_client = await get_supabase(request)
    current_user_id = await require_admin(request, user_token)

    try:
        admin_client = await get_admin_client(request) or supabase_client

        # Get event access records (these are the "purchases")
        event_access = await admin_client.select("user_event_access", "*", {}, user_token)
        if event_access is None:
            event_access = []

        # Get user profiles for lookup
        users = await admin_client.select("user_profiles", "id, full_name, email", {}, user_token)
        user_lookup = {u["id"]: u for u in (users or [])}

        # Build purchase rows with user info
        purchases = []
        for access in event_access:
            user_id = access.get("user_id")
            user_info = user_lookup.get(user_id, {})
            purchases.append({
                "user_id": user_id,
                "user_full_name": user_info.get("full_name"),
                "user_email": user_info.get("email"),
                "event_id": access.get("event_id"),
                "event_name": access.get("event_name"),
                "granted_at": access.get("granted_at") or access.get("created_at"),
                "access_type": access.get("access_type"),
            })

        # Filter by search term if provided
        if search:
            search_lower = search.lower()
            purchases = [
                p for p in purchases
                if search_lower in (p.get("user_full_name") or "").lower()
                or search_lower in (p.get("user_email") or "").lower()
                or search_lower in (p.get("event_name") or "").lower()
                or search_lower in (p.get("event_id") or "").lower()
            ]

        # Sort by granted_at descending
        purchases = sorted(purchases, key=lambda x: x.get("granted_at") or "", reverse=True)

        total = len(purchases)

        # Apply pagination
        purchases = purchases[offset: offset + limit]

        return {
            "success": True,
            "purchases": purchases,
            "total": total
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing purchases: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list purchases: {str(e)}")


@router.post("/athletes/seed")
async def seed_athletes_database(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Seed athletes database with data from last 3 years FWT series (Admin only)"""
    supabase_client = await get_supabase(request)
    current_user_id = await require_admin(request, user_token)

    try:
        from api.client import LiveheatsClient

        client = LiveheatsClient()
        admin_client = await get_admin_client(request) or supabase_client

        # Get FWT series from current and next year only (to avoid timeout)
        current_year = datetime.now().year
        years = range(current_year, current_year + 2)  # e.g. 2025, 2026
        series_data = await client.get_series_by_years("fwtglobal", years)

        if not series_data:
            return {
                "success": True,
                "message": "No series found",
                "athletes_added": 0,
                "athletes_updated": 0
            }

        series_ids = [s["id"] for s in series_data]

        # Use optimized seed function - lightweight query, batched processing
        athletes_map = await client.seed_all_athletes(series_ids, batch_size=5)

        added = 0
        updated = 0

        for athlete_id, athlete_data in athletes_map.items():
            try:
                existing = await admin_client.select("athletes", "id", {"id": athlete_id}, user_token)
                if existing:
                    await admin_client.update(
                        "athletes",
                        {"last_seen": datetime.now(timezone.utc).isoformat()},
                        {"id": athlete_id},
                        user_token,
                    )
                    updated += 1
                else:
                    await admin_client.insert("athletes", {
                        "id": athlete_id,
                        "name": athlete_data["name"],
                        "last_seen": datetime.now(timezone.utc).isoformat()
                    }, user_token)
                    added += 1
            except Exception as e:
                logger.debug(f"Error seeding athlete {athlete_id}: {e}")

        return {
            "success": True,
            "message": f"Seeded athletes database",
            "athletes_added": added,
            "athletes_updated": updated,
            "total_processed": len(athletes_map)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error seeding athletes: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to seed athletes: {str(e)}")


@router.get("/athletes/search")
async def search_athletes(
    request: Request,
    q: str = "",
    limit: int = 50,
    user_token: str = Depends(get_user_token)
):
    """Search athletes in database (Admin only)"""
    supabase_client = await get_supabase(request)
    current_user_id = await require_admin(request, user_token)

    try:
        admin_client = await get_admin_client(request) or supabase_client

        athletes = await admin_client.select("athletes", "*", {}, user_token)
        if athletes is None:
            athletes = []

        # Filter by search term
        if q:
            q_lower = q.lower()
            athletes = [
                a for a in athletes
                if q_lower in (a.get("name") or "").lower()
                or q_lower in (a.get("id") or "").lower()
            ]

        # Sort by name
        athletes = sorted(athletes, key=lambda x: x.get("name", ""))

        # Apply limit
        athletes = athletes[:limit]

        return {
            "success": True,
            "data": athletes,
            "total": len(athletes)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching athletes: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to search athletes: {str(e)}")


@router.post("/athletes/sync")
async def sync_athletes_from_event(
    request: Request,
    event_id: str = None,
    user_token: str = Depends(get_user_token)
):
    """Sync athletes from a specific event (Admin only)"""
    supabase_client = await get_supabase(request)
    current_user_id = await require_admin(request, user_token)

    if not event_id:
        raise HTTPException(status_code=400, detail="event_id is required")

    try:
        from api.client import LiveheatsClient

        client = LiveheatsClient()
        admin_client = await get_admin_client(request) or supabase_client

        # Fetch event athletes
        event_data = await client.get_event_athletes(event_id)
        if not event_data:
            raise HTTPException(status_code=404, detail="Event not found")

        athletes_in_event = []
        for division in event_data.get('event', {}).get('eventDivisions', []):
            for entry in division.get('entries', []):
                athlete = entry.get('athlete')
                if athlete and athlete.get('id') and athlete.get('name'):
                    athletes_in_event.append({
                        "id": athlete["id"],
                        "name": athlete["name"],
                        "last_seen": datetime.now(timezone.utc).isoformat()
                    })

        added = 0
        updated = 0

        for athlete in athletes_in_event:
            try:
                existing = await admin_client.select("athletes", "id", {"id": athlete["id"]}, user_token)
                if existing:
                    await admin_client.update(
                        "athletes",
                        {"last_seen": athlete["last_seen"]},
                        {"id": athlete["id"]},
                        user_token,
                    )
                    updated += 1
                else:
                    await admin_client.insert("athletes", athlete, user_token)
                    added += 1
            except Exception as e:
                logger.debug(f"Error syncing athlete {athlete['id']}: {e}")

        return {
            "success": True,
            "message": f"Synced athletes from event",
            "event_name": event_data['event'].get('name'),
            "athletes_added": added,
            "athletes_updated": updated,
            "total_in_event": len(athletes_in_event)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing athletes from event: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to sync athletes: {str(e)}")


@router.get("/athlete/{athlete_id}/series-rankings")
async def get_athlete_series_rankings(
    athlete_id: str,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get series rankings for a specific athlete (Admin only)"""
    supabase_client = await get_supabase(request)
    current_user_id = await require_admin(request, user_token)

    try:
        from api.client import LiveheatsClient

        client = LiveheatsClient()

        # Get FWT series
        series_data = await client.get_series_by_years("fwtglobal", range(2008, 2031))
        if not series_data:
            return {
                "success": True,
                "athlete_id": athlete_id,
                "series_rankings": [],
                "series_count": 0,
                "message": "No FWT series found"
            }

        series_ids = [s["id"] for s in series_data]

        # Fetch rankings for this athlete - returns same format as event endpoint
        rankings = await client.fetch_multiple_series(series_ids, [athlete_id])

        return {
            "success": True,
            "athlete_id": athlete_id,
            "series_rankings": rankings,
            "series_count": len(rankings),
            "message": f"Found {len(rankings)} series for athlete"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting athlete series rankings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get rankings: {str(e)}")
