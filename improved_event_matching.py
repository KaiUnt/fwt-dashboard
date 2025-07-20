# Improved Event Matching Logic for FWT Dashboard
# This is a proposed solution - not yet integrated

import re
from typing import List, Dict, Optional, Tuple

class FWTEventMatcher:
    """Intelligent event matching for FWT Dashboard event history"""
    
    def __init__(self):
        # Known location mappings for better accuracy
        self.location_mappings = {
            "Chamonix": "Chamonix, France",
            "Verbier": "Verbier, Switzerland", 
            "Fieberbrunn": "Fieberbrunn, Austria",
            "Kicking Horse": "Kicking Horse, Canada",
            "Revelstoke": "Revelstoke, Canada",
            "Xtreme": "Verbier, Switzerland",  # Special case
            "Ordino": "Ordino Arcalís, Andorra",
            "Baqueira": "Baqueira Beret, Spain",
            "Obertauern": "Obertauern, Austria",
            "La Clusaz": "La Clusaz, France",
            "Andorra": "Ordino Arcalís, Andorra"
        }
        
        # Event type patterns that don't have specific locations
        self.non_location_patterns = [
            r"freeride'?her",
            r"world championship",
            r"qualifying list",
            r"national rankings",
            r"challenger by \w+",
            r"region \d+ [a-z-]+"
        ]
    
    def extract_location_info(self, event_name: str) -> Dict[str, any]:
        """
        Extract location and matching information from event name
        Returns: {
            'location': str,
            'confidence': float,  # 0.0 - 1.0
            'match_type': str,    # 'exact_location', 'similar_pattern', 'no_location'
            'normalized_name': str
        }
        """
        
        # Normalize event name
        normalized = self._normalize_event_name(event_name)
        
        # Check for non-location events first
        if self._is_non_location_event(normalized):
            return {
                'location': None,
                'confidence': 0.0,
                'match_type': 'no_location',
                'normalized_name': normalized
            }
        
        # Try exact location matching
        location = self._extract_known_location(normalized)
        if location:
            return {
                'location': location,
                'confidence': 1.0,
                'match_type': 'exact_location',
                'normalized_name': normalized
            }
        
        # Try pattern-based extraction
        location = self._extract_pattern_location(normalized)
        if location:
            return {
                'location': location,
                'confidence': 0.7,
                'match_type': 'pattern_extracted',
                'normalized_name': normalized
            }
        
        # Fallback: no location found
        return {
            'location': None,
            'confidence': 0.0,
            'match_type': 'unknown',
            'normalized_name': normalized
        }
    
    def calculate_event_similarity(self, event1: str, event2: str) -> float:
        """
        Calculate similarity between two events (0.0 - 1.0)
        Uses location, year, and event pattern matching
        """
        info1 = self.extract_location_info(event1)
        info2 = self.extract_location_info(event2)
        
        # If both have no location, check for pattern similarity
        if info1['location'] is None and info2['location'] is None:
            return self._calculate_pattern_similarity(info1['normalized_name'], info2['normalized_name'])
        
        # If one has location and other doesn't, low similarity
        if (info1['location'] is None) != (info2['location'] is None):
            return 0.1
        
        # If both have locations, compare them
        if info1['location'] and info2['location']:
            if info1['location'].lower() == info2['location'].lower():
                return 0.9  # Same location, high similarity
            else:
                return 0.0  # Different locations
        
        return 0.0
    
    def find_historical_matches(self, current_event: str, historical_events: List[str], 
                              min_similarity: float = 0.7) -> List[Tuple[str, float]]:
        """
        Find historical events that match the current event
        Returns: List of (event_name, similarity_score) tuples
        """
        matches = []
        current_info = self.extract_location_info(current_event)
        
        for historical_event in historical_events:
            similarity = self.calculate_event_similarity(current_event, historical_event)
            if similarity >= min_similarity:
                matches.append((historical_event, similarity))
        
        # Sort by similarity score (highest first)
        matches.sort(key=lambda x: x[1], reverse=True)
        return matches
    
    def _normalize_event_name(self, event_name: str) -> str:
        """Normalize event name for better matching"""
        # Remove common prefixes
        normalized = event_name.strip()
        normalized = re.sub(r'^(FWT\s*-?\s*)', '', normalized, flags=re.IGNORECASE)
        normalized = re.sub(r'^(IFSA\s*-?\s*)', '', normalized, flags=re.IGNORECASE)
        
        # Normalize whitespace
        normalized = re.sub(r'\s+', ' ', normalized)
        
        return normalized.strip()
    
    def _is_non_location_event(self, normalized_name: str) -> bool:
        """Check if event is a non-location type (championships, rankings, etc.)"""
        name_lower = normalized_name.lower()
        
        for pattern in self.non_location_patterns:
            if re.search(pattern, name_lower):
                return True
        
        return False
    
    def _extract_known_location(self, normalized_name: str) -> Optional[str]:
        """Extract location using known location mappings"""
        name_lower = normalized_name.lower()
        
        for location_key, location_full in self.location_mappings.items():
            if location_key.lower() in name_lower:
                return location_key
        
        return None
    
    def _extract_pattern_location(self, normalized_name: str) -> Optional[str]:
        """Extract location using various regex patterns"""
        
        # Pattern 1: Year followed by location (e.g., "2025 Obertauern Challenger")
        match = re.search(r'^\d{4}\s+([A-Za-z][A-Za-z\s]+?)(?:\s+(?:Challenger|Qualifier|Open|Freeride))', 
                         normalized_name, re.IGNORECASE)
        if match:
            location = match.group(1).strip()
            # Filter out common non-location words
            if not re.match(r'^(Open|Freeride|Week|by|Faces)$', location, re.IGNORECASE):
                return location
        
        # Pattern 2: Location followed by year (e.g., "Chamonix 2025")
        match = re.search(r'^([A-Za-z][A-Za-z\s]+?)\s+\d{4}', normalized_name)
        if match:
            return match.group(1).strip()
        
        # Pattern 3: Location in middle with specific context
        match = re.search(r'(?:Freeride\s+Week\s+)?(?:at\s+)?([A-Za-z][A-Za-z\s]+?)(?:\s+(?:Challenger|Qualifier|by))', 
                         normalized_name, re.IGNORECASE)
        if match:
            location = match.group(1).strip()
            if len(location) > 2:  # Avoid single letters
                return location
        
        return None
    
    def _calculate_pattern_similarity(self, name1: str, name2: str) -> float:
        """Calculate similarity for non-location events based on pattern matching"""
        name1_lower = name1.lower()
        name2_lower = name2.lower()
        
        # Extract key components
        def extract_components(name):
            components = {
                'has_qualifier': 'qualifier' in name,
                'has_challenger': 'challenger' in name,
                'has_junior': 'junior' in name,
                'has_world_champ': 'world championship' in name,
                'stars': re.findall(r'\d+\*', name),
                'region': re.findall(r'region\s+\d+', name),
                'brand': re.findall(r'by\s+\w+', name)
            }
            return components
        
        comp1 = extract_components(name1_lower)
        comp2 = extract_components(name2_lower)
        
        # Calculate similarity based on shared components
        similarity = 0.0
        total_checks = 0
        
        # Boolean components
        for key in ['has_qualifier', 'has_challenger', 'has_junior', 'has_world_champ']:
            if comp1[key] == comp2[key]:
                similarity += 0.2
            total_checks += 1
        
        # List components (stars, region, brand)
        for key in ['stars', 'region', 'brand']:
            if comp1[key] == comp2[key] and comp1[key]:  # Non-empty and equal
                similarity += 0.2
            total_checks += 1
        
        return similarity / total_checks if total_checks > 0 else 0.0


# Example usage and testing
if __name__ == "__main__":
    matcher = FWTEventMatcher()
    
    # Test cases
    test_events = [
        "2025 Open Faces Obertauern Challenger",
        "2025 Verbier Freeride Week by Dynastar Qualifier 2*",
        "2025 Verbier Freeride Week by Dynastar Qualifier 3*",
        "Freeride'her by Peak Performance Qualifier 2*",
        "FWT - Chamonix 2025",
        "FWT - Verbier 2025",
        "2024 Verbier Freeride Week Qualifier 1*",
        "Freeride Junior World Championships Ranking 2024"
    ]
    
    print("=== Event Location Extraction Test ===")
    for event in test_events:
        info = matcher.extract_location_info(event)
        print(f"{event}")
        print(f"  → Location: {info['location']}")
        print(f"  → Confidence: {info['confidence']}")
        print(f"  → Type: {info['match_type']}")
        print()
    
    print("=== Event Similarity Test ===")
    current = "2025 Verbier Freeride Week by Dynastar Qualifier 2*"
    historical = [
        "2024 Verbier Freeride Week Qualifier 1*",
        "2023 Verbier Open Faces",
        "2024 Chamonix Qualifier",
        "2024 Verbier Freeride Week by Dynastar Qualifier 3*"
    ]
    
    matches = matcher.find_historical_matches(current, historical, min_similarity=0.5)
    print(f"Current event: {current}")
    print("Historical matches:")
    for event, similarity in matches:
        print(f"  {similarity:.2f} - {event}")