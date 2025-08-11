#!/usr/bin/env python3
"""
Test Authentication Flow
Tests the authentication flow to see if tokens are being sent correctly
"""
import asyncio
import httpx
import json
import os
from datetime import datetime

PRODUCTION_API_URL = os.getenv("NEXT_PUBLIC_API_URL", "https://fwt-dashboard.onrender.com")

async def test_auth_flow():
    """Test the authentication flow"""
    athlete_id = "950480"
    
    print(f"=== Authentication Flow Test - {datetime.now()} ===")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Test 1: No auth header
            print("\n1. Testing without Authorization header:")
            response = await client.get(f"{PRODUCTION_API_URL}/api/commentator-info/{athlete_id}")
            print(f"Status: {response.status_code}")
            print(f"Expected: 401 (Unauthorized)")
            print(f"Actual: {response.status_code}")
            
            # Test 2: Empty auth header
            print("\n2. Testing with empty Authorization header:")
            headers = {"Authorization": ""}
            response = await client.get(f"{PRODUCTION_API_URL}/api/commentator-info/{athlete_id}", headers=headers)
            print(f"Status: {response.status_code}")
            print(f"Expected: 401 (Unauthorized)")
            print(f"Actual: {response.status_code}")
            
            # Test 3: Invalid Bearer token
            print("\n3. Testing with invalid Bearer token:")
            headers = {"Authorization": "Bearer invalid-token"}
            response = await client.get(f"{PRODUCTION_API_URL}/api/commentator-info/{athlete_id}", headers=headers)
            print(f"Status: {response.status_code}")
            print(f"Expected: 401 (Unauthorized)")
            print(f"Actual: {response.status_code}")
            
            # Test 4: Malformed Bearer token
            print("\n4. Testing with malformed Bearer token:")
            headers = {"Authorization": "Bearer"}
            response = await client.get(f"{PRODUCTION_API_URL}/api/commentator-info/{athlete_id}", headers=headers)
            print(f"Status: {response.status_code}")
            print(f"Expected: 401 (Unauthorized)")
            print(f"Actual: {response.status_code}")
            
            # Test 5: Check if any endpoint requires auth
            print("\n5. Testing health endpoint (should not require auth):")
            response = await client.get(f"{PRODUCTION_API_URL}/health")
            print(f"Status: {response.status_code}")
            print(f"Expected: 200 (OK)")
            print(f"Actual: {response.status_code}")
            
        except Exception as e:
            print(f"Error: {e}")

async def main():
    await test_auth_flow()

if __name__ == "__main__":
    asyncio.run(main()) 