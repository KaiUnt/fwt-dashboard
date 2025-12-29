"""
Friends Router - Friend connections and requests.
"""

import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.models import FriendRequestCreate

logger = logging.getLogger(__name__)
security = HTTPBearer()

router = APIRouter(prefix="/api/friends", tags=["Friends"])


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


@router.post("/request")
async def create_friend_request(
    friend_request: FriendRequestCreate,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Send a friend request to another user by username."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        # Find user by username
        user_result = await supabase_client.select(
            "user_profiles", "*", {"full_name": friend_request.username}, user_token
        )

        if not user_result:
            raise HTTPException(status_code=404, detail="User not found")

        target_user = user_result[0]

        if target_user["id"] == current_user_id:
            raise HTTPException(status_code=400, detail="Cannot send friend request to yourself")

        # Check for outgoing request
        outgoing_connection = await supabase_client.select(
            "user_connections", "*",
            {"requester_id": current_user_id, "addressee_id": target_user["id"]},
            user_token
        )

        # Check for incoming request
        incoming_connection = await supabase_client.select(
            "user_connections", "*",
            {"requester_id": target_user["id"], "addressee_id": current_user_id},
            user_token
        )

        if outgoing_connection:
            raise HTTPException(status_code=409, detail="Friend request already exists")

        if incoming_connection:
            if incoming_connection[0].get("status") == "pending":
                raise HTTPException(
                    status_code=409,
                    detail="This user has already sent you a friend request. Please accept it instead."
                )
            elif incoming_connection[0].get("status") == "accepted":
                raise HTTPException(status_code=409, detail="You are already friends with this user")

        # Create friend request
        connection_data = {
            "requester_id": current_user_id,
            "addressee_id": target_user["id"],
            "status": "pending"
        }

        result = await supabase_client.insert("user_connections", connection_data, user_token)

        return {
            "success": True,
            "data": result[0] if result else None,
            "message": "Friend request sent successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating friend request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create friend request: {str(e)}")


@router.get("/pending/received")
async def get_received_pending_friend_requests(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get pending friend requests received by current user."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        result = await supabase_client.select(
            "user_connections", "*",
            {"addressee_id": current_user_id, "status": "pending"},
            user_token
        )

        pending_requests = []
        for connection in result:
            requester = await supabase_client.select(
                "user_profiles", "*", {"id": connection["requester_id"]}, user_token
            )
            if requester:
                pending_requests.append({**connection, "requester": requester[0]})

        return {"success": True, "data": pending_requests, "total": len(pending_requests)}

    except Exception as e:
        logger.error(f"Error fetching received pending friend requests: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch received pending requests: {str(e)}")


@router.get("/pending/sent")
async def get_sent_pending_friend_requests(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get pending friend requests sent by current user."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        result = await supabase_client.select(
            "user_connections", "*",
            {"requester_id": current_user_id, "status": "pending"},
            user_token
        )

        sent_requests = []
        for connection in result:
            addressee = await supabase_client.select(
                "user_profiles", "*", {"id": connection["addressee_id"]}, user_token
            )
            if addressee:
                sent_requests.append({**connection, "addressee": addressee[0]})

        return {"success": True, "data": sent_requests, "total": len(sent_requests)}

    except Exception as e:
        logger.error(f"Error fetching sent pending friend requests: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch sent pending requests: {str(e)}")


@router.get("/pending")
async def get_pending_friend_requests(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get all pending friend requests (deprecated, use /received or /sent instead)."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        result = await supabase_client.select(
            "user_connections", "*",
            {"addressee_id": current_user_id, "status": "pending"},
            user_token
        )

        pending_requests = []
        for connection in result:
            requester = await supabase_client.select(
                "user_profiles", "*", {"id": connection["requester_id"]}, user_token
            )
            if requester:
                pending_requests.append({**connection, "requester": requester[0]})

        return {"success": True, "data": pending_requests, "total": len(pending_requests)}

    except Exception as e:
        logger.error(f"Error fetching pending friend requests: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch pending requests: {str(e)}")


@router.put("/accept/{connection_id}")
async def accept_friend_request(
    connection_id: str,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Accept a friend request."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        result = await supabase_client.update(
            "user_connections",
            {"status": "accepted"},
            {"id": connection_id, "addressee_id": current_user_id},
            user_token
        )

        if not result:
            raise HTTPException(status_code=404, detail="Friend request not found")

        # Log user action
        try:
            updated = result[0] if result else None
            if isinstance(updated, dict):
                friend_id = (
                    updated.get("requester_id")
                    if updated.get("addressee_id") == current_user_id
                    else updated.get("addressee_id")
                )
                await supabase_client.insert(
                    "user_actions",
                    [{
                        "user_id": current_user_id,
                        "action_type": "friend_accept",
                        "resource_type": "user",
                        "resource_id": friend_id,
                        "action_details": {"connection_id": connection_id},
                        "timestamp": datetime.utcnow().isoformat()
                    }],
                    user_token=user_token
                )
        except Exception as log_err:
            logger.warning(f"Failed to log friend acceptance action: {log_err}")

        return {
            "success": True,
            "data": result[0] if result else None,
            "message": "Friend request accepted"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting friend request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to accept friend request: {str(e)}")


@router.put("/decline/{connection_id}")
async def decline_friend_request(
    connection_id: str,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Decline a friend request."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        result = await supabase_client.update(
            "user_connections",
            {"status": "declined"},
            {"id": connection_id, "addressee_id": current_user_id},
            user_token
        )

        if not result:
            raise HTTPException(status_code=404, detail="Friend request not found")

        return {
            "success": True,
            "data": result[0] if result else None,
            "message": "Friend request declined"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error declining friend request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to decline friend request: {str(e)}")


@router.delete("/{connection_id}")
async def remove_friend(
    connection_id: str,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Remove a friend connection."""
    supabase_client = await get_supabase(request)
    await get_current_user_id(request, user_token)  # Verify auth

    try:
        result = await supabase_client.delete(
            "user_connections",
            {"id": connection_id},
            user_token
        )

        if not result:
            raise HTTPException(status_code=404, detail="Friend connection not found")

        return {"success": True, "message": "Friend removed successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing friend: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove friend: {str(e)}")


@router.get("")
async def get_friends(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get list of accepted friends."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        result = await supabase_client.select(
            "user_connections", "*", {"status": "accepted"}, user_token
        )

        # Filter connections where current user is involved
        user_connections = [
            conn for conn in result
            if conn["requester_id"] == current_user_id or conn["addressee_id"] == current_user_id
        ]

        friends = []
        for connection in user_connections:
            friend_id = (
                connection["addressee_id"]
                if connection["requester_id"] == current_user_id
                else connection["requester_id"]
            )
            friend = await supabase_client.select("user_profiles", "*", {"id": friend_id}, user_token)
            if friend:
                friends.append({**connection, "friend": friend[0]})

        return {"success": True, "data": friends, "total": len(friends)}

    except Exception as e:
        logger.error(f"Error fetching friends: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch friends: {str(e)}")
