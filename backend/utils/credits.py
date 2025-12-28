"""
Credits System Utilities

Helper functions for user credits management.
"""

import logging
from datetime import datetime
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Default credits for new users
DEFAULT_NEW_USER_CREDITS = 5


async def get_or_initialize_user_credits(
    supabase_client,
    user_id: str,
    user_token: str,
    default_credits: int = DEFAULT_NEW_USER_CREDITS
) -> Tuple[int, bool]:
    """
    Get user's current credits, initializing if not exists.

    Args:
        supabase_client: Supabase client instance
        user_id: User's ID
        user_token: User's JWT token
        default_credits: Credits to give new users

    Returns:
        Tuple of (credits_value, was_initialized)
    """
    # Try to get existing credits
    result = await supabase_client.select(
        "user_credits",
        "credits",
        {"user_id": user_id},
        user_token=user_token
    )

    if result and len(result) > 0:
        return result[0].get("credits", 0), False

    # Initialize new user with default credits
    try:
        await supabase_client.insert(
            "user_credits",
            [{
                "user_id": user_id,
                "credits": default_credits,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }],
            user_token=user_token
        )
        logger.info(f"Initialized {default_credits} credits for new user {user_id}")
        return default_credits, True

    except Exception as e:
        # Race condition: another request might have created it
        logger.debug(f"Credits init race condition for {user_id}: {e}")

        # Re-read to get actual value
        reread = await supabase_client.select(
            "user_credits",
            "credits",
            {"user_id": user_id},
            user_token=user_token
        )

        if reread and len(reread) > 0:
            return reread[0].get("credits", 0), False

        return 0, False


async def deduct_credits(
    supabase_client,
    user_id: str,
    user_token: str,
    amount: int,
    description: str,
    event_id: Optional[str] = None
) -> Tuple[bool, int, str]:
    """
    Deduct credits from user's balance with transaction logging.

    Args:
        supabase_client: Supabase client instance
        user_id: User's ID
        user_token: User's JWT token
        amount: Amount to deduct (positive number)
        description: Transaction description
        event_id: Optional event ID for event purchases

    Returns:
        Tuple of (success, remaining_credits, message)
    """
    # Get current balance
    current_credits, _ = await get_or_initialize_user_credits(
        supabase_client, user_id, user_token
    )

    if current_credits < amount:
        return False, current_credits, f"Insufficient credits. Required: {amount}, Available: {current_credits}"

    new_balance = current_credits - amount

    # Update credits
    await supabase_client.update(
        "user_credits",
        {
            "credits": new_balance,
            "updated_at": datetime.now().isoformat()
        },
        {"user_id": user_id},
        user_token=user_token
    )

    # Log transaction
    transaction_data = {
        "user_id": user_id,
        "amount": -amount,
        "transaction_type": "spend",
        "credits_before": current_credits,
        "credits_after": new_balance,
        "description": description,
        "created_at": datetime.now().isoformat()
    }

    if event_id:
        transaction_data["event_id"] = event_id

    await supabase_client.insert(
        "credit_transactions",
        [transaction_data],
        user_token=user_token
    )

    return True, new_balance, "Credits deducted successfully"


async def grant_credits(
    supabase_client,
    user_id: str,
    user_token: Optional[str],
    amount: int,
    description: str
) -> Tuple[bool, int, str]:
    """
    Grant credits to user's balance with transaction logging.

    Args:
        supabase_client: Supabase client instance
        user_id: User's ID
        user_token: User's JWT token (can be None for admin operations)
        amount: Amount to grant (positive number)
        description: Transaction description

    Returns:
        Tuple of (success, new_balance, message)
    """
    # Get current balance
    current_credits, _ = await get_or_initialize_user_credits(
        supabase_client, user_id, user_token or ""
    )

    new_balance = current_credits + amount

    # Update credits
    await supabase_client.update(
        "user_credits",
        {
            "credits": new_balance,
            "updated_at": datetime.now().isoformat()
        },
        {"user_id": user_id},
        user_token=user_token
    )

    # Log transaction
    await supabase_client.insert(
        "credit_transactions",
        [{
            "user_id": user_id,
            "amount": amount,
            "transaction_type": "grant",
            "credits_before": current_credits,
            "credits_after": new_balance,
            "description": description,
            "created_at": datetime.now().isoformat()
        }],
        user_token=user_token
    )

    return True, new_balance, f"Granted {amount} credits"
