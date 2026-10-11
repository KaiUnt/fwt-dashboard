"""Hermetic regressions for public LiveHeats event loading and upstream failures."""

import asyncio
from copy import deepcopy
import json
import re

import aiohttp
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from api.client import GraphQLClient, LiveheatsAPIError, LiveheatsClient
from api.queries import GraphQLQueries
from backend.routers import events, results


class FakeResponse:
    def __init__(self, payload, status=200, error=None):
        self.payload = payload
        self.status = status
        self.error = error

    async def __aenter__(self):
        if self.error is not None:
            raise self.error
        return self

    async def __aexit__(self, *args):
        return False

    async def json(self):
        return deepcopy(self.payload)

    async def text(self):
        return json.dumps(self.payload)


class FakeSession:
    def __init__(self, response):
        self.response = response
        self.requests = []
        self.closed = False

    def post(self, url, *, json):
        self.requests.append((url, json))
        return self.response

    async def close(self):
        self.closed = True


class FakeRedis:
    def __init__(self):
        self.writes = []

    async def get(self, key):
        return None

    async def setex(self, key, ttl, value):
        self.writes.append((key, ttl, json.loads(value)))


@pytest.fixture
def upstream(monkeypatch):
    """Patch the transport while exercising the actual GraphQL client."""
    def configure(payload=None, *, status=200, error=None):
        session = FakeSession(FakeResponse(payload, status, error))
        monkeypatch.setattr("api.client.aiohttp.ClientSession", lambda: session)
        return session

    return configure


@pytest.fixture
def api(monkeypatch):
    """Mount only the relevant routers, without production DB/auth initialization."""
    app = FastAPI()
    app.include_router(events.router)
    app.include_router(results.router)
    app.dependency_overrides[events.extract_user_id_from_token] = lambda: "test-user"
    app.dependency_overrides[results.extract_user_id_from_token] = lambda: "test-user"
    redis = FakeRedis()

    async def get_redis(request):
        return redis

    monkeypatch.setattr(events, "get_redis_client", get_redis)
    monkeypatch.setattr(results, "get_redis_client", get_redis)
    with TestClient(app) as client:
        yield client, redis


def event_data(status="scheduled", entries=None, *, divisions=True):
    return {
        "event": {
            "id": "test-event",
            "name": "Test Freeride Event",
            "date": "2026-01-15T09:00:00Z",
            "status": status,
            "eventDivisions": [{
                "division": {"name": "Ski Men"},
                "status": status,
                "entries": entries or [],
            }] if divisions else [],
        }
    }


def confirmed_entry():
    return {
        "athlete": {
            "id": "athlete-1",
            "name": "Test Athlete",
            "nationality": "AUT",
            "image": None,
        },
        "status": "confirmed",
        "bib": "12",
    }


def execute_query(*, strict=True):
    async def execute():
        async with GraphQLClient() as client:
            return await client.execute(
                GraphQLQueries.GET_EVENT_ATHLETES,
                {"id": "test-event"},
                raise_on_error=strict,
            )

    return asyncio.run(execute())


@pytest.mark.parametrize("query", [
    GraphQLQueries.GET_EVENT_ATHLETES,
    GraphQLQueries.GET_SERIES_RANKINGS,
], ids=["event-athletes", "series-rankings"])
def test_public_athlete_queries_do_not_request_private_birth_date(query):
    # Requesting dob makes otherwise public event/roster queries return HTTP 401.
    assert re.search(r"\bdob\b", query) is None


def test_http_401_is_an_upstream_failure_in_strict_mode(upstream):
    session = upstream({"errors": [{"message": "Unauthorized"}]}, status=401)

    with pytest.raises(LiveheatsAPIError) as error:
        execute_query()

    assert error.value.status_code == 401
    assert session.closed


def test_default_query_mode_preserves_optional_failure_behavior(upstream):
    upstream({"errors": [{"message": "Unauthorized"}]}, status=401)
    assert execute_query(strict=False) is None


@pytest.mark.parametrize("failure", [
    asyncio.TimeoutError("upstream timed out"),
    aiohttp.ClientConnectionError("upstream unavailable"),
])
def test_transport_failure_is_not_a_missing_event(upstream, failure):
    upstream(error=failure)

    with pytest.raises(LiveheatsAPIError) as error:
        execute_query()

    assert error.value.__cause__ is failure


@pytest.mark.parametrize("payload", [
    {"errors": [{"message": "Query rejected"}]},
    {"data": {"event": None}, "errors": [{"message": "Partial failure"}]},
    {"data": None},
    {},
])
def test_graphql_or_invalid_response_is_not_a_missing_event(upstream, payload):
    upstream(payload)
    with pytest.raises(LiveheatsAPIError):
        execute_query()


def test_successful_null_event_is_actually_missing(upstream):
    upstream({"data": {"event": None}})
    assert asyncio.run(LiveheatsClient().get_event_athletes("missing-event")) is None


def test_completed_event_loads_confirmed_roster_and_athlete_details(upstream):
    data = event_data("completed", [confirmed_entry()])
    session = upstream({"data": data})
    client = LiveheatsClient()

    assert asyncio.run(client.get_event_athletes("test-event")) == data
    assert client.athlete_details["athlete-1"] == {
        **confirmed_entry()["athlete"], "bib": "12", "status": "confirmed",
    }
    assert session.requests[0][1]["variables"] == {"id": "test-event"}


@pytest.mark.parametrize("path", [
    "/api/events/missing-event/athletes",
    "/api/series/rankings/missing-event",
])
def test_only_successful_missing_event_returns_404(api, upstream, path):
    client, redis = api
    upstream({"data": {"event": None}})

    response = client.get(path)

    assert response.status_code == 404
    assert response.json()["detail"] == "Event not found"
    assert redis.writes == []


@pytest.mark.parametrize("divisions", [False, True])
def test_scheduled_event_without_entries_is_still_available(api, upstream, divisions):
    client, redis = api
    data = event_data(divisions=divisions)
    upstream({"data": data})

    response = client.get("/api/events/test-event/athletes")

    assert response.status_code == 200
    assert response.json() == data
    assert sum(len(d["entries"]) for d in response.json()["event"]["eventDivisions"]) == 0
    assert redis.writes[0][0] == "eventAthletes:test-event"
    assert redis.writes[0][2] == data


def test_completed_event_is_available_with_roster(api, upstream):
    client, redis = api
    data = event_data("completed", [confirmed_entry()])
    upstream({"data": data})

    response = client.get("/api/events/test-event/athletes")

    assert response.status_code == 200
    assert response.json()["event"]["eventDivisions"][0]["entries"] == [confirmed_entry()]
    assert redis.writes[0][2] == data


@pytest.mark.parametrize("path", [
    "/api/events/test-event/athletes",
    "/api/series/rankings/test-event",
    "/api/events/multi/test-event/other-event/athletes",
])
def test_upstream_401_returns_502_without_caching_a_missing_event(api, upstream, path):
    client, redis = api
    upstream({"errors": [{"message": "Unauthorized"}]}, status=401)

    response = client.get(path)

    assert response.status_code == 502
    assert response.json()["detail"] != "Event not found"
    assert "cache-control" not in response.headers
    assert redis.writes == []


@pytest.mark.parametrize("data", [
    {},
    {"other": {}},
    {"event": {}},
    {"event": []},
], ids=["empty-data", "missing-event-key", "empty-event", "invalid-event-type"])
def test_malformed_success_response_returns_502_without_cache(api, upstream, data):
    client, redis = api
    upstream({"data": data})

    response = client.get("/api/events/test-event/athletes")

    assert response.status_code == 502
    assert response.json()["detail"] != "Event not found"
    assert "cache-control" not in response.headers
    assert redis.writes == []
