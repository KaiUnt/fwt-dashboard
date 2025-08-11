#!/usr/bin/env python3
"""
Simple Production API Test
Tests the commentator info endpoint directly
"""
import asyncio
import httpx
import json
import os
from datetime import datetime

PRODUCTION_API_URL = os.getenv("NEXT_PUBLIC_API_URL", "https://fwt-dashboard.onrender.com")

async def test_commentator_info_endpoint():
    """Test the commentator info endpoint directly"""
    athlete_id = "950480"  # The athlete ID from the logs
    
    print(f"Testing commentator info endpoint for athlete {athlete_id}")
    print(f"URL: {PRODUCTION_API_URL}/api/commentator-info/{athlete_id}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Test without auth first
            print("\n1. Testing without authentication:")
            response = await client.get(f"{PRODUCTION_API_URL}/api/commentator-info/{athlete_id}")
            print(f"Status: {response.status_code}")
            print(f"Headers: {dict(response.headers)}")
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    print(f"Response data: {json.dumps(data, indent=2)}")
                except:
                    print(f"Response text: {response.text[:500]}")
            else:
                print(f"Error response: {response.text}")
            
            # Test with invalid auth
            print("\n2. Testing with invalid authentication:")
            headers = {"Authorization": "Bearer invalid-token"}
            response = await client.get(f"{PRODUCTION_API_URL}/api/commentator-info/{athlete_id}", headers=headers)
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text[:200]}")
            
            # Test health endpoint
            print("\n3. Testing health endpoint:")
            response = await client.get(f"{PRODUCTION_API_URL}/health")
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            
        except Exception as e:
            print(f"Error: {e}")

async def main():
    print(f"=== Production API Test - {datetime.now()} ===")
    await test_commentator_info_endpoint()

if __name__ == "__main__":
    asyncio.run(main()) 