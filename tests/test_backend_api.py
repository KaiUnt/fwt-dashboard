"""Fast, hermetic API and critical purchase-path tests."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.models import MultiEventPurchaseRequest
from backend.routers.event_access import purchase_multiple_events
from backend_api import app, sanitized_http_exception_handler


client = TestClient(app)


def test_health_check_is_live_and_hardened():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_internal_http_exception_details_are_not_returned():
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/test",
        "headers": [],
        "query_string": b"",
        "server": ("testserver", 80),
        "client": ("testclient", 123),
        "scheme": "http",
    })
    response = asyncio.run(
        sanitized_http_exception_handler(
            request,
            HTTPException(status_code=500, detail="secret database details"),
        )
    )

    assert response.status_code == 500
    assert b"secret database details" not in response.body
    assert b"Internal server error" in response.body


@pytest.mark.parametrize(
    "path",
    [
        "/api/credits/balance",
        "/api/commentator-info/export",
        "/api/events/test-event/purchase",
    ],
)
def test_protected_endpoints_reject_missing_credentials(path):
    response = client.get(path) if path.endswith("balance") or path.endswith("export") else client.post(path)
    assert response.status_code in {401, 403}


def test_multi_purchase_request_rejects_duplicates():
    with pytest.raises(ValidationError):
        MultiEventPurchaseRequest(event_ids=["event-1", "event-1"])


def test_multi_purchase_request_requires_matching_names():
    with pytest.raises(ValidationError):
        MultiEventPurchaseRequest(
            event_ids=["event-1", "event-2"],
            event_names=["Only one name"],
        )


def test_multi_purchase_uses_one_authenticated_rpc_call():
    class FakeSupabase:
        def __init__(self):
            self.calls = []

        async def rpc(self, function_name, params, user_token=None):
            self.calls.append((function_name, params, user_token))
            return {
                "success": True,
                "message": "ok",
                "credits_remaining": 3,
                "purchased_events": ["event-1", "event-2"],
                "failed_events": [],
            }

    fake_supabase = FakeSupabase()
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(supabase_client=fake_supabase))
    )
    payload = MultiEventPurchaseRequest(
        event_ids=["event-1", "event-2"],
        event_names=["Event One", "Event Two"],
    )

    result = asyncio.run(
        purchase_multiple_events(
            request_data=payload,
            request=request,
            current_user_id="user-1",
            user_token="signed-user-token",
        )
    )

    assert result.success is True
    assert result.credits_remaining == 3
    assert fake_supabase.calls == [
        (
            "purchase_multiple_event_access",
            {
                "event_ids_param": ["event-1", "event-2"],
                "event_names_param": ["Event One", "Event Two"],
            },
            "signed-user-token",
        )
    ]
