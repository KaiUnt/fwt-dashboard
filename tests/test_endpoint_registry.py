#!/usr/bin/env python3
"""
Endpoint Registry Snapshot Test

This test ensures that all API endpoints remain registered after refactoring.
Run this BEFORE and AFTER any refactoring to verify no endpoints were lost.

This version uses STATIC PARSING (regex) to avoid import dependency issues.

Usage:
    pytest tests/test_endpoint_registry.py -v
    python tests/test_endpoint_registry.py  # standalone
"""

import sys
import os
import re
from pathlib import Path

# Path to backend_api.py and routers
BACKEND_API_PATH = Path(__file__).parent.parent / "backend_api.py"
ROUTERS_PATH = Path(__file__).parent.parent / "backend" / "routers"

# ============================================
# ENDPOINT REGISTRY SNAPSHOT
# Generated from backend_api.py analysis
# Total: 52 endpoints
# ============================================

EXPECTED_ENDPOINTS = {
    # Core
    ("GET", "/"),
    ("GET", "/health"),

    # Events
    ("GET", "/api/events"),
    ("GET", "/api/events/{event_id}/athletes"),
    ("GET", "/api/events/multi/{event_id1}/{event_id2}/athletes"),
    ("GET", "/api/events/{event_id}/access"),
    ("POST", "/api/events/access-batch"),
    ("POST", "/api/events/{event_id}/purchase"),
    ("POST", "/api/events/purchase-multiple"),

    # Series/Rankings
    ("GET", "/api/series/rankings/{event_id}"),
    ("GET", "/api/fullresults"),
    ("GET", "/api/fullresults/{series_id}"),

    # Athletes
    ("GET", "/api/athlete/{athlete_id}/results"),

    # Commentator Info
    ("GET", "/api/commentator-info"),
    ("GET", "/api/commentator-info/batch"),
    ("GET", "/api/commentator-info/{athlete_id}"),
    ("POST", "/api/commentator-info"),
    ("PUT", "/api/commentator-info/{athlete_id}"),
    ("DELETE", "/api/commentator-info/{athlete_id}"),
    ("GET", "/api/commentator-info/{athlete_id}/friends"),
    ("GET", "/api/commentator-info/export"),
    ("POST", "/api/commentator-info/import"),
    ("POST", "/api/commentator-info/bulk-import"),

    # Friends
    ("GET", "/api/friends"),
    ("POST", "/api/friends/request"),
    ("GET", "/api/friends/pending"),
    ("GET", "/api/friends/pending/received"),
    ("GET", "/api/friends/pending/sent"),
    ("PUT", "/api/friends/accept/{connection_id}"),
    ("PUT", "/api/friends/decline/{connection_id}"),
    ("DELETE", "/api/friends/{connection_id}"),

    # Users
    ("GET", "/api/users/check-username/{username}"),
    ("GET", "/api/user/events"),

    # Credits
    ("GET", "/api/credits/balance"),
    ("GET", "/api/credits/transactions"),
    ("GET", "/api/credits/packages"),

    # Profile
    ("POST", "/api/profile/update"),
    ("POST", "/api/profile/verify-password"),
    ("POST", "/api/profile/change-password"),

    # Activity
    ("POST", "/api/activity/log-login"),
    ("GET", "/api/activity/overview"),

    # Admin - Users
    ("GET", "/api/admin/users"),
    ("GET", "/api/admin/users/summary"),
    ("GET", "/api/admin/overview"),

    # Admin - Credits
    ("POST", "/api/admin/credits/grant/{user_id}"),
    ("GET", "/api/admin/credits/stats"),
    ("POST", "/api/admin/credits/adjust/{target_user_id}"),
    ("GET", "/api/admin/credits/purchases"),

    # Admin - Athletes
    ("POST", "/api/admin/athletes/seed"),
    ("GET", "/api/admin/athletes/search"),
    ("POST", "/api/admin/athletes/sync"),
    ("GET", "/api/admin/athlete/{athlete_id}/series-rankings"),

    # Debug
    ("GET", "/api/debug/user-role"),
}


def get_registered_endpoints():
    """Extract all registered endpoints from backend_api.py and routers using regex parsing."""
    endpoints = set()

    # Read the main source file
    if not BACKEND_API_PATH.exists():
        raise FileNotFoundError(f"Backend API not found: {BACKEND_API_PATH}")

    content = BACKEND_API_PATH.read_text(encoding="utf-8")

    # Regex pattern to match @app.get("/path"), @app.post("/path"), etc.
    app_pattern = r'@app\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']'

    for match in re.finditer(app_pattern, content, re.IGNORECASE):
        method = match.group(1).upper()
        path = match.group(2)
        endpoints.add((method, path))

    # Also scan router files for @router.get("/path"), etc.
    if ROUTERS_PATH.exists():
        router_pattern = r'@router\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']*)["\']'
        prefix_pattern = r'APIRouter\s*\([^)]*prefix\s*=\s*["\']([^"\']+)["\']'

        for router_file in ROUTERS_PATH.glob("*.py"):
            if router_file.name.startswith("_"):
                continue
            router_content = router_file.read_text(encoding="utf-8")

            # Extract prefix if defined
            prefix = ""
            prefix_match = re.search(prefix_pattern, router_content)
            if prefix_match:
                prefix = prefix_match.group(1)

            for match in re.finditer(router_pattern, router_content, re.IGNORECASE):
                method = match.group(1).upper()
                path = match.group(2)
                # Combine prefix with path
                if path == "" or path == "/":
                    full_path = prefix if prefix else "/"
                elif path.startswith("/"):
                    full_path = prefix + path
                else:
                    full_path = prefix + "/" + path if prefix else "/" + path
                endpoints.add((method, full_path))

    return endpoints


def test_all_endpoints_registered():
    """Test that all expected endpoints are registered."""
    registered = get_registered_endpoints()

    missing = EXPECTED_ENDPOINTS - registered
    extra = registered - EXPECTED_ENDPOINTS

    # Report missing endpoints
    if missing:
        print("\n[FAIL] MISSING ENDPOINTS (were expected but not found):")
        for method, path in sorted(missing):
            print(f"   {method} {path}")

    # Report extra endpoints (new ones added)
    if extra:
        print("\n[WARN] EXTRA ENDPOINTS (found but not in snapshot):")
        for method, path in sorted(extra):
            print(f"   {method} {path}")

    # The test fails only if endpoints are MISSING
    assert len(missing) == 0, f"Missing {len(missing)} endpoints! See above."

    print(f"\n[OK] All {len(EXPECTED_ENDPOINTS)} endpoints are registered.")

    if extra:
        print(f"   (Plus {len(extra)} new endpoints not in snapshot)")


def test_endpoint_count():
    """Test that we have at least the expected number of endpoints."""
    registered = get_registered_endpoints()

    # Filter out non-API routes
    api_endpoints = {(m, p) for m, p in registered if p.startswith("/api") or p in ("/", "/health")}

    print(f"\nTotal API endpoints: {len(api_endpoints)}")
    print(f"Expected minimum: {len(EXPECTED_ENDPOINTS)}")

    assert len(api_endpoints) >= len(EXPECTED_ENDPOINTS), \
        f"Expected at least {len(EXPECTED_ENDPOINTS)} endpoints, found {len(api_endpoints)}"


def print_endpoint_summary():
    """Print a summary of all endpoints grouped by category."""
    registered = get_registered_endpoints()

    categories = {
        "Core": [],
        "Events": [],
        "Series": [],
        "Athletes": [],
        "Commentator": [],
        "Friends": [],
        "Users": [],
        "Credits": [],
        "Profile": [],
        "Activity": [],
        "Admin": [],
        "Debug": [],
        "Other": [],
    }

    for method, path in sorted(registered):
        if path in ("/", "/health"):
            categories["Core"].append((method, path))
        elif "/events" in path:
            categories["Events"].append((method, path))
        elif "/series" in path or "/fullresults" in path:
            categories["Series"].append((method, path))
        elif "/athlete" in path and "/admin" not in path:
            categories["Athletes"].append((method, path))
        elif "/commentator" in path:
            categories["Commentator"].append((method, path))
        elif "/friends" in path:
            categories["Friends"].append((method, path))
        elif "/users" in path or "/user/" in path:
            categories["Users"].append((method, path))
        elif "/credits" in path and "/admin" not in path:
            categories["Credits"].append((method, path))
        elif "/profile" in path:
            categories["Profile"].append((method, path))
        elif "/activity" in path:
            categories["Activity"].append((method, path))
        elif "/admin" in path:
            categories["Admin"].append((method, path))
        elif "/debug" in path:
            categories["Debug"].append((method, path))
        else:
            categories["Other"].append((method, path))

    print("\n" + "=" * 60)
    print("ENDPOINT REGISTRY SUMMARY")
    print("=" * 60)

    total = 0
    for category, endpoints in categories.items():
        if endpoints:
            print(f"\n{category} ({len(endpoints)} endpoints):")
            for method, path in endpoints:
                print(f"  {method:6} {path}")
            total += len(endpoints)

    print("\n" + "=" * 60)
    print(f"TOTAL: {total} endpoints")
    print("=" * 60)


if __name__ == "__main__":
    print("Running Endpoint Registry Tests...\n")

    try:
        # Run tests
        test_all_endpoints_registered()
        test_endpoint_count()

        # Print summary
        print_endpoint_summary()

        print("\n[OK] All endpoint registry tests passed!")

    except AssertionError as e:
        print(f"\n[FAIL] Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
