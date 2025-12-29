"""
Pydantic Models / Schemas

All request/response models for the API.
Extracted from backend_api.py for modularity.
"""

import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, validator


# ============================================
# Validation Schemas
# ============================================

class EventIdSchema(BaseModel):
    event_id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')


class AthleteIdSchema(BaseModel):
    athlete_id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')


# ============================================
# User / Profile Models
# ============================================

class UserProfile(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    organization: str
    is_active: bool
    created_at: str
    updated_at: str


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    organization: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    password: str


class VerifyPasswordRequest(BaseModel):
    email: str
    password: str


# ============================================
# Friends System Models
# ============================================

# Reserved usernames that cannot be used
RESERVED_USERNAMES = [
    'admin', 'administrator', 'root', 'system', 'api', 'www',
    'ftp', 'mail', 'test', 'user', 'guest', 'null', 'undefined'
]


class FriendRequestCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=30)

    @validator('username')
    def validate_username(cls, v):
        # Username validation rules
        if not re.match(r'^[\w .-]+$', v, flags=re.UNICODE):
            raise ValueError('Username can only contain letters, numbers, spaces, dots, underscores, and hyphens')
        if re.match(r'^[0-9]+$', v):
            raise ValueError('Username cannot be only numbers')
        if re.match(r'^[_-]', v) or re.match(r'[_-]$', v):
            raise ValueError('Username cannot start or end with underscore or hyphen')
        if v.lower() in RESERVED_USERNAMES:
            raise ValueError('This username is reserved')
        return v.strip()


class FriendRequestResponse(BaseModel):
    id: str
    requester_id: str
    addressee_id: str
    status: str
    created_at: str
    updated_at: str


# ============================================
# Commentator Info Models
# ============================================

ALLOWED_SOCIAL_MEDIA_KEYS = {'instagram', 'youtube', 'website', 'facebook', 'tiktok'}


def validate_social_media(v):
    """Shared validator for social_media field."""
    if v is None:
        return v

    for key in v.keys():
        if key not in ALLOWED_SOCIAL_MEDIA_KEYS:
            raise ValueError(f"Invalid social media key: {key}")
        if not isinstance(v[key], str) or len(v[key]) > 500:
            raise ValueError(f"Invalid social media URL for {key}")

    return v


def validate_custom_fields(v):
    """Shared validator for custom_fields field."""
    if v is None:
        return v

    if not isinstance(v, dict):
        raise ValueError("Custom fields must be a dictionary")

    if len(v) > 50:
        raise ValueError("Too many custom fields (max 50 allowed)")

    for key, value in v.items():
        if not isinstance(key, str) or len(key) > 100:
            raise ValueError(f"Invalid custom field key: {key}")
        if not isinstance(value, (str, int, float, bool)) or (isinstance(value, str) and len(value) > 1000):
            raise ValueError(f"Invalid custom field value for {key}")

    return v


class CommentatorInfoCreate(BaseModel):
    athlete_id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    homebase: Optional[str] = Field(None, max_length=200)
    team: Optional[str] = Field(None, max_length=200)
    sponsors: Optional[str] = Field(None, max_length=1000)
    favorite_trick: Optional[str] = Field(None, max_length=200)
    achievements: Optional[str] = Field(None, max_length=2000)
    injuries: Optional[str] = Field(None, max_length=2000)
    fun_facts: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)
    social_media: Optional[Dict[str, str]] = Field(None)
    custom_fields: Optional[Dict[str, Any]] = Field(None)

    _validate_social_media = validator('social_media', allow_reuse=True)(validate_social_media)
    _validate_custom_fields = validator('custom_fields', allow_reuse=True)(validate_custom_fields)


class CommentatorInfoUpdate(BaseModel):
    homebase: Optional[str] = Field(None, max_length=200)
    team: Optional[str] = Field(None, max_length=200)
    sponsors: Optional[str] = Field(None, max_length=1000)
    favorite_trick: Optional[str] = Field(None, max_length=200)
    achievements: Optional[str] = Field(None, max_length=2000)
    injuries: Optional[str] = Field(None, max_length=2000)
    fun_facts: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)
    social_media: Optional[Dict[str, str]] = Field(None)
    custom_fields: Optional[Dict[str, Any]] = Field(None)

    _validate_social_media = validator('social_media', allow_reuse=True)(validate_social_media)
    _validate_custom_fields = validator('custom_fields', allow_reuse=True)(validate_custom_fields)


class CommentatorInfoWithAuthor(BaseModel):
    id: str
    athlete_id: str
    homebase: Optional[str]
    team: Optional[str]
    sponsors: Optional[str]
    favorite_trick: Optional[str]
    achievements: Optional[str]
    injuries: Optional[str]
    fun_facts: Optional[str]
    notes: Optional[str]
    social_media: Optional[Dict[str, str]]
    custom_fields: Optional[Dict[str, Any]]
    created_at: str
    updated_at: str
    deleted_at: Optional[str]
    created_by: Optional[str]
    author_name: Optional[str]
    is_own_data: bool


# ============================================
# Credits System Models
# ============================================

class CreditsBalanceResponse(BaseModel):
    success: bool
    credits: int
    message: str


class EventAccessResponse(BaseModel):
    success: bool
    has_access: bool
    message: str


class PurchaseEventAccessRequest(BaseModel):
    event_id: str = Field(..., min_length=1, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    event_name: Optional[str] = Field(None, max_length=500)


class PurchaseEventAccessResponse(BaseModel):
    success: bool
    message: str
    credits_remaining: int
    event_id: str


class MultiEventPurchaseRequest(BaseModel):
    event_ids: List[str]
    event_names: Optional[List[str]] = None


class MultiEventPurchaseResponse(BaseModel):
    success: bool
    message: str
    credits_remaining: int
    purchased_events: List[str]
    failed_events: List[str] = []
    error: Optional[str] = None


class CreditPackage(BaseModel):
    package_type: str
    credits: int
    price_cents: int
    price_display: str


class CreditsTransactionResponse(BaseModel):
    id: str
    transaction_type: str
    amount: int
    credits_before: int
    credits_after: int
    description: str
    created_at: str
    event_id: Optional[str] = None


class BatchEventAccessRequest(BaseModel):
    event_ids: List[str] = Field(..., min_items=0, max_items=1000)

    @validator('event_ids')
    def validate_event_ids(cls, v):
        for event_id in v:
            if not isinstance(event_id, str) or len(event_id.strip()) == 0:
                raise ValueError('All event IDs must be non-empty strings')
            if not re.match(r'^[a-zA-Z0-9_-]+$', event_id.strip()):
                raise ValueError('Event IDs can only contain letters, numbers, underscores, and hyphens')
        return [event_id.strip() for event_id in v]


class BatchEventAccessResponse(BaseModel):
    success: bool
    access_status: Dict[str, bool]
    message: str


# ============================================
# Admin Models
# ============================================

class GrantCreditsRequest(BaseModel):
    credits: int = Field(..., gt=0, le=100)
    note: str = Field("Admin grant", max_length=500)


class AdminCreditsAdjustRequest(BaseModel):
    delta: int = Field(..., ge=-1000, le=1000)
    note: Optional[str] = Field(None, max_length=500)


# ============================================
# Activity Models
# ============================================

class LogLoginRequest(BaseModel):
    login_method: Optional[str] = Field(None, description="email|google|github|microsoft|other")
    ip: Optional[str] = None
    user_agent: Optional[str] = None
