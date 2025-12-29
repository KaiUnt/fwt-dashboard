"""
Commentator Router - Commentator info management endpoints.
"""

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.models import CommentatorInfoCreate, CommentatorInfoUpdate

logger = logging.getLogger(__name__)
security = HTTPBearer()

router = APIRouter(prefix="/api/commentator-info", tags=["Commentator"])


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


@router.get("/batch")
async def get_batch_commentator_info(
    athlete_ids: str,  # Comma-separated IDs: "id1,id2,id3"
    source: str = "all",
    request: Request = None,
    user_token: str = Depends(get_user_token)
):
    """Get commentator info for multiple athletes in one request"""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        # Parse athlete IDs
        athlete_id_list = [id.strip() for id in athlete_ids.split(",") if id.strip()]
        if not athlete_id_list:
            return {
                "success": True,
                "data": {},
                "total": 0
            }

        # Get all commentator info for these athletes in one query.
        # Use our authenticated Supabase client so RLS applies correctly for the current user.
        result = await supabase_client.select(
            "commentator_info",
            "*",
            {"athlete_id": athlete_id_list},
            user_token=user_token
        )

        if not result:
            return {
                "success": True,
                "data": {athlete_id: [] for athlete_id in athlete_id_list},
                "total": 0
            }

        # Group by athlete_id and add authorship info
        grouped = {}
        for item in result:
            athlete_id = item.get("athlete_id")
            if not athlete_id:
                continue

            if athlete_id not in grouped:
                grouped[athlete_id] = []

            # Filter by source if needed
            is_own = item.get("created_by") == current_user_id

            if source == "mine" and not is_own:
                continue
            elif source == "friends" and is_own:
                continue

            # Add enhanced data with authorship flag
            grouped[athlete_id].append({
                **item,
                "is_own_data": is_own
            })

        # Ensure all requested athletes are in the result (even with empty arrays)
        for athlete_id in athlete_id_list:
            if athlete_id not in grouped:
                grouped[athlete_id] = []

        return {
            "success": True,
            "data": grouped,
            "total": len(result)
        }

    except Exception as e:
        logger.error(f"Error fetching batch commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch batch commentator info: {str(e)}")


@router.get("/export")
async def export_all_commentator_info(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Export all commentator info for backup purposes"""
    supabase_client = await get_supabase(request)

    try:
        result = await supabase_client.select("commentator_info", "*")

        # Add metadata to the export
        export_data = {
            "export_timestamp": datetime.now().isoformat(),
            "total_records": len(result),
            "version": "1.0",
            "data": result
        }

        return export_data

    except Exception as e:
        logger.error(f"Error exporting commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export commentator info: {str(e)}")


@router.get("/{athlete_id}")
async def get_commentator_info(
    athlete_id: str,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get commentator info for a specific athlete with user token"""
    supabase_client = await get_supabase(request)

    try:
        # Use user token for RLS policy enforcement
        result = await supabase_client.select("commentator_info", "*", {"athlete_id": athlete_id}, user_token=user_token)

        if result:
            logger.info(f"Found commentator info for athlete {athlete_id}")
            return {
                "success": True,
                "data": result[0]
            }
        else:
            logger.info(f"No commentator info found for athlete {athlete_id}")
            return {
                "success": True,
                "data": None,
                "message": "No commentator info found for this athlete"
            }

    except Exception as e:
        logger.error(f"Error fetching commentator info for athlete {athlete_id}: {e}")
        logger.error(f"Exception type: {type(e)}")
        logger.error(f"Exception details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch commentator info: {str(e)}")


@router.post("")
async def create_commentator_info(
    info: CommentatorInfoCreate,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Create commentator info for an athlete"""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        # Check if info already exists
        existing = await supabase_client.select("commentator_info", "*", {"athlete_id": info.athlete_id})

        if existing:
            raise HTTPException(status_code=409, detail="Commentator info already exists for this athlete")

        # Add user info to the data
        info_data = info.dict()
        info_data["created_by"] = current_user_id

        # Get user profile for author name
        user_profile = await supabase_client.select("user_profiles", "full_name", {"id": current_user_id})
        if user_profile:
            info_data["author_name"] = user_profile[0]["full_name"]

        # Create new record
        result = await supabase_client.insert("commentator_info", info_data)

        return {
            "success": True,
            "data": result[0] if result else None,
            "message": "Commentator info created successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create commentator info: {str(e)}")


@router.put("/{athlete_id}")
async def update_commentator_info(
    athlete_id: str,
    info: CommentatorInfoUpdate,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Update commentator info for an athlete with user token forwarding"""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        logger.info(f"Updating commentator info for athlete {athlete_id} with user token")

        # Check if record exists for this user specifically (not friends' data)
        existing = await supabase_client.select("commentator_info", "*", {
            "athlete_id": athlete_id,
            "created_by": current_user_id
        }, user_token=user_token)

        if not existing:
            # Create new record if it doesn't exist
            create_data = CommentatorInfoCreate(athlete_id=athlete_id, **info.dict())
            create_data_dict = create_data.dict()
            create_data_dict["created_by"] = current_user_id

            # Get user profile for author name (using user token)
            user_profile = await supabase_client.select("user_profiles", "full_name", {"id": current_user_id}, user_token=user_token)
            if user_profile:
                create_data_dict["author_name"] = user_profile[0]["full_name"]

            result = await supabase_client.insert("commentator_info", create_data_dict, user_token=user_token)
        else:
            # Update existing record (using user token for RLS)
            update_data = {k: v for k, v in info.dict().items() if v is not None}
            result = await supabase_client.update("commentator_info", update_data, {"athlete_id": athlete_id}, user_token=user_token)

        logger.info(f"Successfully updated commentator info for athlete {athlete_id}")

        response_data = {
            "success": True,
            "data": result[0] if result else None,
            "message": "Commentator info updated successfully"
        }

        return response_data

    except HTTPException as http_ex:
        # Re-raise HTTP exceptions (including 401 from Supabase)
        logger.error(f"HTTP error updating commentator info for athlete {athlete_id}: {http_ex.status_code} - {http_ex.detail}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error updating commentator info for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update commentator info: {str(e)}")


@router.delete("/{athlete_id}")
async def delete_commentator_info(
    athlete_id: str,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Delete commentator info for an athlete"""
    supabase_client = await get_supabase(request)

    try:
        # Direct delete - RLS will ensure user can only delete their own data
        result = await supabase_client.delete(
            "commentator_info",
            {"athlete_id": athlete_id},
            user_token=user_token
        )

        if not result:
            raise HTTPException(status_code=404, detail="Commentator info not found or you don't have permission to delete it")

        return {
            "success": True,
            "message": "Commentator info deleted successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting commentator info for athlete {athlete_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete commentator info: {str(e)}")


@router.get("")
async def get_all_commentator_info(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get all commentator info records"""
    supabase_client = await get_supabase(request)

    try:
        result = await supabase_client.select("commentator_info", "*")

        return {
            "success": True,
            "data": result,
            "total": len(result)
        }

    except Exception as e:
        logger.error(f"Error fetching all commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch commentator info: {str(e)}")


@router.get("/{athlete_id}/friends")
async def get_commentator_info_with_friends(
    athlete_id: str,
    source: str = "mine",
    request: Request = None,
    user_token: str = Depends(get_user_token)
):
    """Get commentator info including friends' data with user token"""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        if source == "mine":
            # Get only user's own data
            result = await supabase_client.select(
                "commentator_info",
                "*",
                {"athlete_id": athlete_id, "created_by": current_user_id},
                user_token=user_token
            )
        elif source == "friends":
            # Get friends' data
            # First get accepted friends
            friends_result = await supabase_client.select(
                "user_connections",
                "*",
                {"status": "accepted"},
                user_token=user_token
            )

            user_connections = [
                conn for conn in friends_result
                if conn["requester_id"] == current_user_id or conn["addressee_id"] == current_user_id
            ]

            friend_ids = []
            for connection in user_connections:
                friend_id = connection["addressee_id"] if connection["requester_id"] == current_user_id else connection["requester_id"]
                friend_ids.append(friend_id)

            # Get commentator info from friends
            result = []
            for friend_id in friend_ids:
                friend_data = await supabase_client.select(
                    "commentator_info",
                    "*",
                    {"athlete_id": athlete_id, "created_by": friend_id},
                    user_token=user_token
                )
                if friend_data:
                    result.extend(friend_data)
        else:  # "all"
            # Get all data (own + friends) - this is handled by RLS policies
            result = await supabase_client.select("commentator_info", "*", {"athlete_id": athlete_id}, user_token=user_token)

        # Add authorship info
        enhanced_result = []
        for item in result:
            is_own = item.get("created_by") == current_user_id
            enhanced_result.append({
                **item,
                "is_own_data": is_own
            })

        return {
            "success": True,
            "data": enhanced_result,
            "total": len(enhanced_result)
        }

    except Exception as e:
        logger.error(f"Error fetching commentator info with friends: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch commentator info: {str(e)}")


@router.post("/import")
async def import_commentator_info(
    import_data: dict,
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Import commentator info from backup file"""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        # Validate import data structure
        if "data" not in import_data:
            raise HTTPException(status_code=400, detail="Invalid import data structure")

        imported_count = 0
        updated_count = 0
        errors = []

        for record in import_data["data"]:
            try:
                athlete_id = record.get("athlete_id")
                if not athlete_id:
                    errors.append("Missing athlete_id in record")
                    continue

                # Check if record already exists
                existing = await supabase_client.select("commentator_info", "*", {"athlete_id": athlete_id})

                if existing:
                    # Update existing record
                    update_data = {k: v for k, v in record.items() if k not in ["id", "created_at", "updated_at"]}
                    await supabase_client.update("commentator_info", update_data, {"athlete_id": athlete_id})
                    updated_count += 1
                else:
                    # Insert new record
                    insert_data = {k: v for k, v in record.items() if k not in ["id", "created_at", "updated_at"]}
                    # Add user info to imported data
                    insert_data["created_by"] = current_user_id

                    # Get user profile for author name
                    user_profile = await supabase_client.select("user_profiles", "full_name", {"id": current_user_id})
                    if user_profile:
                        insert_data["author_name"] = user_profile[0]["full_name"]

                    await supabase_client.insert("commentator_info", insert_data)
                    imported_count += 1

            except Exception as e:
                errors.append(f"Error processing record for athlete {athlete_id}: {str(e)}")

        return {
            "success": True,
            "imported_count": imported_count,
            "updated_count": updated_count,
            "errors": errors,
            "total_processed": imported_count + updated_count
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to import commentator info: {str(e)}")


@router.post("/bulk-import")
async def bulk_import_commentator_info(
    data: List[Dict[str, Any]],
    request: Request,
    target_user_id: Optional[str] = None,
    user_token: str = Depends(get_user_token)
):
    """Bulk import commentator info from CSV data with user token"""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        # Check if target_user_id is specified and current user is admin
        effective_user_id = current_user_id
        if target_user_id:
            # Check if current user is admin
            user_profile = await supabase_client.select("user_profiles", "role", {"id": current_user_id}, user_token)
            if not user_profile or user_profile[0].get("role") != "admin":
                raise HTTPException(status_code=403, detail="Admin privileges required to upload for other users")
            effective_user_id = target_user_id
            logger.info(f"Admin {current_user_id} uploading data for user {target_user_id}")

        results = {"success": 0, "failed": 0, "errors": []}
        logger.info(f"Starting bulk import for {len(data)} items by user {current_user_id} (effective_user: {effective_user_id})")

        for item in data:
            try:
                athlete_id = item.get("athlete_id")

                if not athlete_id:
                    results["failed"] += 1
                    results["errors"].append("Missing athlete_id")
                    continue

                # Check if record exists for the effective user
                existing = await supabase_client.select("commentator_info", "*", {
                    "athlete_id": athlete_id,
                    "created_by": effective_user_id
                }, user_token=user_token)

                # Prepare data for insert/update
                info_data = {
                    "athlete_id": athlete_id,
                    "homebase": item.get("homebase", ""),
                    "team": item.get("team", ""),
                    "sponsors": item.get("sponsors", ""),
                    "favorite_trick": item.get("favorite_trick", ""),
                    "achievements": item.get("achievements", ""),
                    "injuries": item.get("injuries", ""),
                    "fun_facts": item.get("fun_facts", ""),
                    "notes": item.get("notes", ""),
                    "social_media": item.get("social_media", {}),
                    "custom_fields": item.get("custom_fields", {})
                }

                if existing:
                    # Merge: Only update fields that have non-empty values in CSV
                    existing_record = existing[0]
                    update_data = {}

                    # Standard text fields - only update if CSV has a value
                    for field in ["homebase", "team", "sponsors", "favorite_trick",
                                  "achievements", "injuries", "fun_facts", "notes"]:
                        csv_value = info_data.get(field, "")
                        if csv_value and csv_value.strip():
                            update_data[field] = csv_value

                    # Social media - merge individual fields
                    csv_social = info_data.get("social_media", {})
                    existing_social = existing_record.get("social_media", {})
                    merged_social = existing_social.copy() if existing_social else {}

                    for social_field in ["instagram", "youtube", "website"]:
                        csv_social_value = csv_social.get(social_field, "")
                        if csv_social_value and csv_social_value.strip():
                            merged_social[social_field] = csv_social_value

                    if merged_social != existing_social:
                        update_data["social_media"] = merged_social

                    # Custom fields - merge with existing
                    csv_custom = info_data.get("custom_fields", {})
                    existing_custom = existing_record.get("custom_fields", {})
                    merged_custom = existing_custom.copy() if existing_custom else {}

                    for custom_key, custom_value in csv_custom.items():
                        if custom_value and str(custom_value).strip():
                            merged_custom[custom_key] = custom_value

                    if merged_custom != existing_custom:
                        update_data["custom_fields"] = merged_custom

                    # Only perform update if there are changes
                    if update_data:
                        await supabase_client.update("commentator_info", update_data, {
                            "athlete_id": athlete_id,
                            "created_by": effective_user_id
                        }, user_token=user_token)
                        logger.info(f"Merged CSV data for athlete {athlete_id}: updated {len(update_data)} fields")
                    else:
                        logger.info(f"No changes needed for athlete {athlete_id} - CSV data matches existing")
                else:
                    # Create new record - add user info
                    info_data["created_by"] = effective_user_id

                    # Get user profile for author name (target user)
                    user_profile = await supabase_client.select("user_profiles", "full_name", {"id": effective_user_id}, user_token=user_token)
                    if user_profile:
                        info_data["author_name"] = user_profile[0]["full_name"]

                    await supabase_client.insert("commentator_info", info_data, user_token=user_token)

                results["success"] += 1

            except Exception as item_error:
                results["failed"] += 1
                results["errors"].append(f"Athlete {item.get('athlete_id', 'unknown')}: {str(item_error)}")
                logger.error(f"Error processing bulk import item {item.get('athlete_id')}: {item_error}")

        logger.info(f"Bulk import completed: {results['success']} success, {results['failed']} failed")
        return {
            "success": True,
            "data": results
        }

    except Exception as e:
        logger.error(f"Error in bulk import commentator info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to bulk import: {str(e)}")
