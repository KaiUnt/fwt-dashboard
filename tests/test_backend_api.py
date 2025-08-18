#!/usr/bin/env python3
"""
Simple test script to verify backend API functionality
"""

import asyncio
import httpx
import os
from typing import Optional

# Test configuration
API_BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:8000')
TEST_ATHLETE_ID = "950480"  # The athlete ID from the logs

async def test_health_check():
    """Test basic health check endpoint"""
    print("🔍 Testing health check...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{API_BASE_URL}/health")
            print(f"✅ Health check status: {response.status_code}")
            print(f"✅ Health check response: {response.text}")
            return response.status_code == 200
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

async def test_commentator_info_without_auth():
    """Test commentator info endpoint without authentication"""
    print("🔍 Testing commentator info without auth...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{API_BASE_URL}/api/commentator-info/{TEST_ATHLETE_ID}")
            print(f"📡 Response status: {response.status_code}")
            print(f"📡 Response text: {response.text}")
            
            if response.status_code == 401:
                print("✅ Correctly rejected without authentication")
                return True
            else:
                print(f"❌ Unexpected response: {response.status_code}")
                return False
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

async def test_commentator_info_with_fake_auth():
    """Test commentator info endpoint with fake authentication"""
    print("🔍 Testing commentator info with fake auth...")
    try:
        headers = {
            "Authorization": "Bearer fake-token-12345"
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{API_BASE_URL}/api/commentator-info/{TEST_ATHLETE_ID}", headers=headers)
            print(f"📡 Response status: {response.status_code}")
            print(f"📡 Response text: {response.text}")
            
            if response.status_code in [401, 500]:
                print("✅ Correctly handled invalid token")
                return True
            else:
                print(f"❌ Unexpected response: {response.status_code}")
                return False
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

async def test_events_endpoint():
    """Test events endpoint (should work without auth)"""
    print("🔍 Testing events endpoint...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{API_BASE_URL}/api/events")
            print(f"📡 Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Events endpoint working, found {len(data)} events")
                return True
            else:
                print(f"❌ Events endpoint failed: {response.status_code}")
                return False
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

async def main():
    """Run all tests"""
    print("🚀 Starting backend API tests...")
    print(f"🌐 API Base URL: {API_BASE_URL}")
    print(f"👤 Test Athlete ID: {TEST_ATHLETE_ID}")
    print("=" * 50)
    
    tests = [
        ("Health Check", test_health_check),
        ("Events Endpoint", test_events_endpoint),
        ("Commentator Info (No Auth)", test_commentator_info_without_auth),
        ("Commentator Info (Fake Auth)", test_commentator_info_with_fake_auth),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n🧪 Running: {test_name}")
        try:
            result = await test_func()
            results.append((test_name, result))
            print(f"{'✅ PASSED' if result else '❌ FAILED'}: {test_name}")
        except Exception as e:
            print(f"❌ ERROR in {test_name}: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 50)
    print("📊 Test Results:")
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"  {status}: {test_name}")
    
    print(f"\n🎯 Overall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Backend is working correctly.")
    else:
        print("⚠️ Some tests failed. Check the logs above for details.")

if __name__ == "__main__":
    asyncio.run(main()) 