"""
Credits Router - User credits balance and transactions.
"""

import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.models import CreditsBalanceResponse

logger = logging.getLogger(__name__)
security = HTTPBearer()

router = APIRouter(prefix="/api/credits", tags=["Credits"])


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
    """Extract user ID from token - delegates to main app's function."""
    # Import the function from the main app to avoid duplication
    from backend_api import extract_user_id_from_token
    from fastapi.security import HTTPAuthorizationCredentials
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    return await extract_user_id_from_token(creds)


@router.get("/balance", response_model=CreditsBalanceResponse)
async def get_user_credits(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get current user's credits balance."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        result = await supabase_client.select(
            "user_credits",
            "credits",
            {"user_id": current_user_id},
            user_token=user_token
        )

        credits_value = 0
        if not result or len(result) == 0:
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
                credits_value = 5
            except Exception:
                # If insert fails (race/exists), try re-read
                reread = await supabase_client.select(
                    "user_credits",
                    "credits",
                    {"user_id": current_user_id},
                    user_token=user_token
                )
                credits_value = (reread[0].get("credits", 0) if reread else 0)
        else:
            credits_value = result[0].get("credits", 0)

        return CreditsBalanceResponse(
            success=True,
            credits=credits_value,
            message="Credits balance retrieved successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user credits: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get credits balance: {str(e)}")


@router.get("/transactions")
async def get_user_credit_transactions(
    request: Request,
    user_token: str = Depends(get_user_token)
):
    """Get user's credit transaction history."""
    supabase_client = await get_supabase(request)
    current_user_id = await get_current_user_id(request, user_token)

    try:
        result = await supabase_client.select(
            "credit_transactions",
            "*",
            {"user_id": current_user_id},
            user_token=user_token
        )

        # Sort by created_at descending
        transactions = sorted(result, key=lambda x: x.get("created_at", ""), reverse=True)

        return {
            "success": True,
            "data": transactions,
            "total": len(transactions)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting credit transactions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get transactions: {str(e)}")


@router.get("/packages")
async def get_credit_packages_disabled():
    """Credit packages are deprecated and disabled."""
    return Response(
        content=json.dumps({
            "success": False,
            "packages": [],
            "message": "Credit packages are disabled"
        }),
        status_code=410,
        media_type="application/json"
    )
