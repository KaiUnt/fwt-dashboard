"""
Backend API Tests for FWT Dashboard
Comprehensive test suite for all API endpoints with security testing
"""

import pytest
import asyncio
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock
import json
from datetime import datetime

# Import the FastAPI app
from backend_api import app, validate_environment, SupabaseClient

# Test client
client = TestClient(app)

class TestSecurityValidation:
    """Test security validation functions"""
    
    def test_validate_environment_success(self):
        """Test environment validation with valid config"""
        # Should not raise any exception
        validate_environment()
    
    def test_supabase_client_validation(self):
        """Test Supabase client input validation"""
        # Test valid initialization
        supabase = SupabaseClient("https://test.supabase.co", "test-key")
        assert supabase.url == "https://test.supabase.co"
        assert supabase.key == "test-key"
        
        # Test invalid initialization
        with pytest.raises(ValueError):
            SupabaseClient("", "test-key")
        
        with pytest.raises(ValueError):
            SupabaseClient("https://test.supabase.co", "")

class TestAPIEndpoints:
    """Test API endpoints for functionality and security"""
    
    def test_root_endpoint(self):
        """Test root endpoint"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "version" in data
        assert "status" in data
        assert data["status"] == "healthy"
    
    def test_health_check_endpoint(self):
        """Test health check endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "timestamp" in data
        assert "version" in data
        assert "supabase_available" in data
        assert data["status"] == "healthy"
    
    def test_security_headers(self):
        """Test security headers are properly set"""
        response = client.get("/")
        headers = response.headers
        
        # Check for security headers
        assert headers.get("X-Content-Type-Options") == "nosniff"
        assert headers.get("X-Frame-Options") == "DENY"
        assert headers.get("X-XSS-Protection") == "1; mode=block"
        assert "Strict-Transport-Security" in headers
    
    @patch('backend_api.LiveheatsClient')
    def test_get_events_success(self, mock_client_class):
        """Test events endpoint with successful response"""
        # Mock the client
        mock_client = AsyncMock()
        mock_client_class.return_value = mock_client
        
        # Mock response data
        mock_events = [
            {
                "id": "event-123",
                "name": "Test Event 2024",
                "date": "2024-12-20T10:00:00Z"
            }
        ]
        mock_client.get_future_events.return_value = mock_events
        
        response = client.get("/api/events")
        assert response.status_code == 200
        
        data = response.json()
        assert "events" in data
        assert "total" in data
        assert "message" in data
        assert len(data["events"]) == 1
        assert data["events"][0]["id"] == "event-123"
    
    @patch('backend_api.LiveheatsClient')
    def test_get_events_validation(self, mock_client_class):
        """Test events endpoint input validation"""
        # Mock the client to return invalid data
        mock_client = AsyncMock()
        mock_client_class.return_value = mock_client
        mock_client.get_future_events.return_value = "invalid_data"  # Not a list
        
        response = client.get("/api/events")
        assert response.status_code == 500
    
    @patch('backend_api.LiveheatsClient')
    def test_get_events_filters_invalid_data(self, mock_client_class):
        """Test that invalid event data is filtered out"""
        mock_client = AsyncMock()
        mock_client_class.return_value = mock_client
        
        # Mix of valid and invalid events
        mock_events = [
            {"id": "valid-1", "name": "Valid Event", "date": "2024-12-20T10:00:00Z"},
            {"name": "No ID Event"},  # Missing ID
            "invalid_string",  # Not a dict
            {"id": "valid-2", "name": "Another Valid Event", "date": "2024-12-21T10:00:00Z"}
        ]
        mock_client.get_future_events.return_value = mock_events
        
        response = client.get("/api/events")
        assert response.status_code == 200
        
        data = response.json()
        # Should only have 2 valid events
        assert len(data["events"]) == 2
        assert data["events"][0]["id"] == "valid-1"
        assert data["events"][1]["id"] == "valid-2"

class TestInputValidation:
    """Test input validation and sanitization"""
    
    def test_event_id_validation_valid(self):
        """Test valid event ID patterns"""
        from backend_api import EventIdSchema
        
        valid_ids = ["event-123", "event_456", "123", "abc-def-ghi"]
        for event_id in valid_ids:
            schema = EventIdSchema(event_id=event_id)
            assert schema.event_id == event_id
    
    def test_event_id_validation_invalid(self):
        """Test invalid event ID patterns"""
        from backend_api import EventIdSchema
        from pydantic import ValidationError
        
        invalid_ids = ["", "a" * 101, "event with spaces", "event/slash", "event;semicolon"]
        for event_id in invalid_ids:
            with pytest.raises(ValidationError):
                EventIdSchema(event_id=event_id)
    
    def test_commentator_info_validation(self):
        """Test commentator info validation"""
        from backend_api import CommentatorInfoCreate
        from pydantic import ValidationError
        
        # Valid data
        valid_data = {
            "athlete_id": "athlete-123",
            "homebase": "Chamonix, France",
            "team": "Test Team",
            "social_media": {
                "instagram": "https://instagram.com/athlete",
                "youtube": "https://youtube.com/athlete"
            }
        }
        
        info = CommentatorInfoCreate(**valid_data)
        assert info.athlete_id == "athlete-123"
        assert info.homebase == "Chamonix, France"
        
        # Invalid social media key
        invalid_data = valid_data.copy()
        invalid_data["social_media"] = {"invalid_platform": "https://example.com"}
        
        with pytest.raises(ValidationError):
            CommentatorInfoCreate(**invalid_data)
    
    def test_data_sanitization(self):
        """Test data sanitization functionality"""
        from backend_api import SupabaseClient
        
        # Create a test client (won't actually connect)
        with pytest.raises(ValueError):  # Will fail due to empty credentials
            client = SupabaseClient("", "")
        
        # Test with valid credentials but test sanitization
        supabase = SupabaseClient("https://test.supabase.co", "test-key")
        
        # Test data with potential XSS
        test_data = {
            "name": "Test <script>alert('xss')</script> Name",
            "description": "Normal description",
            "invalid-key!": "This should be filtered",
            "valid_key": "a" * 20000  # Very long string
        }
        
        sanitized = supabase._sanitize_data(test_data)
        
        # XSS should be removed
        assert "<script>" not in sanitized["name"]
        assert "alert" not in sanitized["name"]
        
        # Invalid key should be filtered out
        assert "invalid-key!" not in sanitized
        
        # Valid key should be present
        assert "valid_key" in sanitized
        
        # Long string should be truncated
        assert len(sanitized["valid_key"]) <= 10000

class TestRateLimiting:
    """Test rate limiting functionality"""
    
    def test_rate_limiting_root_endpoint(self):
        """Test rate limiting on root endpoint"""
        # Make multiple requests quickly
        responses = []
        for i in range(15):  # Limit is 10/minute
            response = client.get("/")
            responses.append(response)
        
        # Should have some rate limited responses
        rate_limited = [r for r in responses if r.status_code == 429]
        successful = [r for r in responses if r.status_code == 200]
        
        # Should have at least some successful requests
        assert len(successful) >= 5
        # And some rate limited
        assert len(rate_limited) >= 3

class TestErrorHandling:
    """Test error handling and logging"""
    
    @patch('backend_api.LiveheatsClient')
    def test_api_error_handling(self, mock_client_class):
        """Test API error handling when external service fails"""
        mock_client = AsyncMock()
        mock_client_class.return_value = mock_client
        
        # Mock an exception
        mock_client.get_future_events.side_effect = Exception("External API error")
        
        response = client.get("/api/events")
        assert response.status_code == 500
        
        data = response.json()
        assert "detail" in data
        # Should not expose internal error details
        assert "External API error" not in data["detail"]
    
    def test_invalid_endpoint(self):
        """Test handling of invalid endpoints"""
        response = client.get("/api/nonexistent")
        assert response.status_code == 404

class TestCORSConfiguration:
    """Test CORS configuration"""
    
    def test_cors_headers_present(self):
        """Test CORS headers are present in responses"""
        response = client.options("/api/events")
        # Note: TestClient doesn't fully simulate CORS, but we can check the setup
        # In a real environment, we'd test with actual cross-origin requests

if __name__ == "__main__":
    pytest.main([__file__]) 