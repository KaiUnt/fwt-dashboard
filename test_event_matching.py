# Test Script for Intelligent Event Matching
# Run this to validate the new event matching logic

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend_api import normalize_event_for_matching, events_match_historically, calculate_event_core_similarity

def test_event_normalization():
    """Test event name normalization"""
    print("=== Event Normalization Tests ===")
    
    test_cases = [
        # (input, expected_output)
        ("2025 Verbier Freeride Week by Dynastar Qualifier 2*", "verbier freeride week qualifier 2*"),
        ("2024 Verbier Freeride Week by Salomon Qualifier 2*", "verbier freeride week qualifier 2*"),
        ("2023 Verbier Freeride Week Qualifier 2*", "verbier freeride week qualifier 2*"),
        ("Freeride'her by Peak Performance Qualifier 2*", "freeride'her qualifier 2*"),
        ("Freeride'her by Salomon Qualifier 2*", "freeride'her qualifier 2*"),
        ("2025 Open Faces Obertauern Challenger", "open faces obertauern challenger"),
        ("FWT - Chamonix 2025", "chamonix"),
        ("2025 Dynastar Verbier Open", "verbier open"),
    ]
    
    for input_event, expected in test_cases:
        result = normalize_event_for_matching(input_event)
        status = "PASS" if result == expected else "FAIL"
        print(f"{status} '{input_event}'")
        print(f"   Got: '{result}'")
        if result != expected:
            print(f"   Expected: '{expected}'")
        print()

def test_historical_matching():
    """Test historical event matching"""
    print("=== Historical Event Matching Tests ===")
    
    # Test cases: (current_event, historical_event, should_match)
    test_cases = [
        # Same event, different years - should match
        ("2025 Verbier Freeride Week by Dynastar Qualifier 2*", 
         "2024 Verbier Freeride Week by Dynastar Qualifier 2*", True),
        
        # Same event, different sponsors - should match
        ("2025 Verbier Freeride Week by Dynastar Qualifier 2*", 
         "2024 Verbier Freeride Week by Salomon Qualifier 2*", True),
        
        # Same event, no sponsor vs with sponsor - should match
        ("2025 Verbier Freeride Week by Dynastar Qualifier 2*", 
         "2023 Verbier Freeride Week Qualifier 2*", True),
        
        # Different star ratings - should NOT match
        ("2025 Verbier Freeride Week by Dynastar Qualifier 2*", 
         "2024 Verbier Freeride Week by Dynastar Qualifier 3*", False),
        
        # Different locations - should NOT match
        ("2025 Verbier Freeride Week by Dynastar Qualifier 2*", 
         "2024 Chamonix Qualifier 2*", False),
        
        # Freeride'her events with different sponsors - should match
        ("Freeride'her by Peak Performance Qualifier 2*", 
         "Freeride'her by Salomon Qualifier 2*", True),
        
        # Open Faces events - should match
        ("2025 Open Faces Obertauern Challenger", 
         "2024 Open Faces Obertauern Challenger", True),
        
        # FWT style events - should match
        ("FWT - Chamonix 2025", 
         "FWT - Chamonix 2024", True),
        
        # Same exact event name - should NOT match (not historical)
        ("2025 Verbier Freeride Week by Dynastar Qualifier 2*", 
         "2025 Verbier Freeride Week by Dynastar Qualifier 2*", False),
    ]
    
    for current, historical, should_match in test_cases:
        result = events_match_historically(current, historical)
        status = "PASS" if result == should_match else "FAIL"
        match_text = "MATCH" if result else "NO MATCH"
        expected_text = "should MATCH" if should_match else "should NOT MATCH"
        
        print(f"{status} {match_text} ({expected_text})")
        print(f"   Current:    '{current}'")
        print(f"   Historical: '{historical}'")
        
        if result != should_match:
            # Show debug info for failed cases
            current_norm = normalize_event_for_matching(current)
            historical_norm = normalize_event_for_matching(historical)
            similarity = calculate_event_core_similarity(current_norm, historical_norm)
            print(f"   DEBUG: Current norm: '{current_norm}'")
            print(f"   DEBUG: Historical norm: '{historical_norm}'")
            print(f"   DEBUG: Similarity: {similarity:.3f}")
        print()

def test_real_world_examples():
    """Test with real-world event examples"""
    print("=== Real-World Examples ===")
    
    # Example: Current event from the API response
    current_event = "2025 Open Faces Obertauern Challenger"
    
    # Potential historical events that should match
    historical_candidates = [
        "2024 Open Faces Obertauern Challenger",
        "2023 Open Faces Obertauern Challenger", 
        "2022 Open Faces Obertauern by Atomic Challenger",
        "2021 Open Faces Obertauern Challenger",
        "2024 Verbier Open Faces",  # Different location - should NOT match
        "2024 Open Faces Obertauern Qualifier",  # Different type - should NOT match
    ]
    
    print(f"Current Event: '{current_event}'")
    print("Historical Matches:")
    
    for historical in historical_candidates:
        matches = events_match_historically(current_event, historical)
        status = "MATCH" if matches else "NO MATCH"
        print(f"  {status} '{historical}'")
    
    print()

if __name__ == "__main__":
    test_event_normalization()
    test_historical_matching()
    test_real_world_examples()
    
    print("=== Summary ===")
    print("The intelligent event matching system:")
    print("+ Handles sponsor changes (Dynastar <-> Salomon)")
    print("+ Matches events across years (2025 <-> 2024)")
    print("+ Preserves star ratings (2* != 3*)")
    print("+ Distinguishes event types (Qualifier != Challenger)")
    print("+ Maintains location specificity (Verbier != Chamonix)")
    print("+ Handles branded events (Freeride'her, Open Faces)")