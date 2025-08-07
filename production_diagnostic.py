#!/usr/bin/env python3
"""
Production Diagnostic Script for FWT Dashboard
This script helps diagnose issues with the commentator info API in production.
"""

import asyncio
import httpx
import json
import os
from datetime import datetime

# Production URLs
PRODUCTION_API_URL = "https://fwt-dashboard.onrender.com"
PRODUCTION_FRONTEND_URL = "https://fwt-dashboard-1.onrender.com"

async def test_health_check():
    """Test if the backend is responding"""
    print("🔍 Testing backend health check...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{PRODUCTION_API_URL}/health")
            print(f"✅ Health check status: {response.status_code}")
            if response.status_code == 200:
                print(f"✅ Backend is healthy: {response.text}")
            else:
                print(f"❌ Backend health check failed: {response.text}")
            return response.status_code == 200
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

async def test_events_endpoint():
    """Test the events endpoint (no auth required)"""
    print("\n🔍 Testing events endpoint...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{PRODUCTION_API_URL}/api/events")
            print(f"✅ Events endpoint status: {response.status_code}")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Events endpoint working, found {len(data)} events")
            else:
                print(f"❌ Events endpoint failed: {response.text}")
            return response.status_code == 200
    except Exception as e:
        print(f"❌ Events endpoint failed: {e}")
        return False

async def test_commentator_info_without_auth():
    """Test commentator info endpoint without authentication"""
    print("\n🔍 Testing commentator info endpoint without auth...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Use a test athlete ID
            test_athlete_id = "test-athlete-123"
            response = await client.get(f"{PRODUCTION_API_URL}/api/commentator-info/{test_athlete_id}")
            print(f"✅ Commentator info (no auth) status: {response.status_code}")
            if response.status_code == 401:
                print("✅ Correctly requires authentication")
            elif response.status_code == 200:
                print("⚠️ Unexpectedly allowed access without auth")
                data = response.json()
                print(f"Data: {data}")
            else:
                print(f"❌ Unexpected status: {response.text}")
            return response.status_code == 401
    except Exception as e:
        print(f"❌ Commentator info test failed: {e}")
        return False

async def test_commentator_info_with_invalid_auth():
    """Test commentator info endpoint with invalid authentication"""
    print("\n🔍 Testing commentator info endpoint with invalid auth...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"Authorization": "Bearer invalid-token"}
            test_athlete_id = "test-athlete-123"
            response = await client.get(
                f"{PRODUCTION_API_URL}/api/commentator-info/{test_athlete_id}",
                headers=headers
            )
            print(f"✅ Commentator info (invalid auth) status: {response.status_code}")
            if response.status_code == 401:
                print("✅ Correctly rejected invalid token")
            else:
                print(f"❌ Unexpected status: {response.text}")
            return response.status_code == 401
    except Exception as e:
        print(f"❌ Commentator info test failed: {e}")
        return False

async def test_cors_headers():
    """Test CORS headers"""
    print("\n🔍 Testing CORS headers...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.options(f"{PRODUCTION_API_URL}/api/events")
            print(f"✅ CORS preflight status: {response.status_code}")
            
            cors_headers = {
                'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
                'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
                'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
            }
            print(f"✅ CORS headers: {cors_headers}")
            return True
    except Exception as e:
        print(f"❌ CORS test failed: {e}")
        return False

async def test_frontend_connectivity():
    """Test if frontend can be reached"""
    print("\n🔍 Testing frontend connectivity...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(PRODUCTION_FRONTEND_URL)
            print(f"✅ Frontend status: {response.status_code}")
            if response.status_code == 200:
                print("✅ Frontend is accessible")
            else:
                print(f"❌ Frontend returned status: {response.status_code}")
            return response.status_code == 200
    except Exception as e:
        print(f"❌ Frontend connectivity failed: {e}")
        return False

async def main():
    """Run all diagnostic tests"""
    print("🚀 Starting FWT Dashboard Production Diagnostics")
    print(f"📅 Time: {datetime.now().isoformat()}")
    print(f"🌐 Backend URL: {PRODUCTION_API_URL}")
    print(f"🌐 Frontend URL: {PRODUCTION_FRONTEND_URL}")
    print("=" * 60)
    
    results = {}
    
    # Run tests
    results['health_check'] = await test_health_check()
    results['events_endpoint'] = await test_events_endpoint()
    results['commentator_info_no_auth'] = await test_commentator_info_without_auth()
    results['commentator_info_invalid_auth'] = await test_commentator_info_with_invalid_auth()
    results['cors_headers'] = await test_cors_headers()
    results['frontend_connectivity'] = await test_frontend_connectivity()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 DIAGNOSTIC SUMMARY")
    print("=" * 60)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
    
    passed = sum(results.values())
    total = len(results)
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! The backend appears to be working correctly.")
        print("\n💡 Next steps:")
        print("1. Check if users are properly authenticated in the frontend")
        print("2. Verify that Supabase authentication is working")
        print("3. Check browser console for specific error messages")
    else:
        print("⚠️ Some tests failed. Check the logs above for details.")
        print("\n💡 Common issues:")
        print("1. Backend service not running")
        print("2. Environment variables not configured")
        print("3. Network connectivity issues")
        print("4. CORS configuration problems")

if __name__ == "__main__":
    asyncio.run(main()) 