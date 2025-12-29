"""
Data Formatting Utilities

Helper functions for formatting and extracting data from event names, etc.
"""

import re
from datetime import datetime
from typing import Optional


def extract_location_from_name(event_name: str) -> str:
    """
    Extract location from event name.

    Args:
        event_name: Full event name (e.g., "FWT - Chamonix 2025")

    Returns:
        Location string (e.g., "Chamonix, France")
    """
    locations = {
        "Chamonix": "Chamonix, France",
        "Verbier": "Verbier, Switzerland",
        "Fieberbrunn": "Fieberbrunn, Austria",
        "Kicking Horse": "Kicking Horse, Canada",
        "Revelstoke": "Revelstoke, Canada",
        "Xtreme": "Verbier, Switzerland",
        "Ordino": "Ordino Arcalis, Andorra",
        "Baqueira": "Baqueira Beret, Spain",
        "Obertauern": "Obertauern, Austria",
        "La Clusaz": "La Clusaz, France",
    }

    for location_key, full_location in locations.items():
        if location_key.lower() in event_name.lower():
            return full_location

    # Fallback: try to extract from event name
    parts = event_name.split(" - ")
    if len(parts) > 1:
        return parts[0].strip()

    return "TBD"


def extract_event_location(event_name: str) -> str:
    """
    Extract location from event name with improved pattern matching.
    Handles various FWT event naming conventions.
    """
    # Known location mappings for better accuracy
    location_mappings = {
        "chamonix": "Chamonix",
        "verbier": "Verbier",
        "fieberbrunn": "Fieberbrunn",
        "kicking horse": "Kicking Horse",
        "revelstoke": "Revelstoke",
        "xtreme": "Verbier",  # Special case: Xtreme = Verbier
        "ordino": "Ordino",
        "baqueira": "Baqueira",
        "obertauern": "Obertauern",
        "la clusaz": "La Clusaz",
        "andorra": "Ordino"
    }

    # Normalize event name
    normalized = event_name.strip()
    normalized = re.sub(r'^(FWT\s*-?\s*)', '', normalized, flags=re.IGNORECASE)
    normalized = re.sub(r'^(IFSA\s*-?\s*)', '', normalized, flags=re.IGNORECASE)
    normalized = re.sub(r'\s+', ' ', normalized).strip()

    # Check for non-location events
    non_location_patterns = [
        r"freeride'?her",
        r"world championship",
        r"qualifying list",
        r"national rankings",
        r"challenger by \w+",
        r"region \d+ [a-z-]+"
    ]

    name_lower = normalized.lower()
    for pattern in non_location_patterns:
        if re.search(pattern, name_lower):
            return "Generic"

    # Try exact location matching first
    for location_key, location_name in location_mappings.items():
        if location_key in name_lower:
            return location_name

    # Pattern-based extraction
    location_patterns = [
        r'^\d{4}\s+([A-Za-z][A-Za-z\s]+?)(?:\s+(?:Challenger|Qualifier|Open|Freeride|by))',
        r'^([A-Za-z][A-Za-z\s]+?)\s+\d{4}',
        r'(?:Freeride\s+Week\s+(?:at\s+)?)?([A-Za-z][A-Za-z\s]+?)(?:\s+(?:Challenger|Qualifier|by|Freeride))',
        r'^([A-Za-z][A-Za-z\s]{2,}?)(?:\s+(?:Open|Faces|Week))'
    ]

    for pattern in location_patterns:
        match = re.search(pattern, normalized, re.IGNORECASE)
        if match:
            location = match.group(1).strip()
            excluded_words = ['open', 'freeride', 'week', 'by', 'faces', 'the', 'and', 'of', 'in']
            if location.lower() not in excluded_words and len(location) > 2:
                return re.sub(r'\s+', ' ', location).strip()

    # Fallback
    words = normalized.split()
    for word in words:
        if (len(word) > 3 and
            word.isalpha() and
            word.lower() not in ['open', 'freeride', 'week', 'faces', 'challenger', 'qualifier'] and
            not re.match(r'^\d+\*?$', word)):
            return word

    return "Unknown"


def extract_year_from_name(event_name: str) -> int:
    """Extract year from event name."""
    match = re.search(r'\b(20\d{2})\b', event_name)
    return int(match.group(1)) if match else 0


def format_event_date(date_str: Optional[str]) -> str:
    """
    Format ISO date string to display format.

    Args:
        date_str: ISO format date string

    Returns:
        Formatted date string (e.g., "25.12.2024")
    """
    if not date_str:
        return ""

    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y")
    except (ValueError, TypeError):
        return ""


def normalize_event_for_matching(event_name: str) -> str:
    """
    Normalize event name for historical matching.
    Removes: years, sponsors, organizations but keeps: location, event type, star rating.
    """
    normalized = event_name.strip()

    # Remove year (2024, 2025, etc.)
    normalized = re.sub(r'\b20\d{2}\b', '', normalized)

    # Remove organization prefixes
    normalized = re.sub(r'^(FWT\s*-?\s*|IFSA\s*-?\s*)', '', normalized, flags=re.IGNORECASE)

    # Remove sponsor parts
    normalized = re.sub(
        r'\s+by\s+[A-Za-z][A-Za-z\s&]+?(?=\s+(?:Qualifier|Challenger|Open|Championship|$))',
        '',
        normalized,
        flags=re.IGNORECASE
    )

    # Check for known sponsors at beginning
    words = normalized.split()
    if len(words) > 2:
        first_word = words[0].lower()
        known_sponsors = ['dynastar', 'salomon', 'atomic', 'rossignol', 'volkl', 'k2', 'peak', 'performance', 'orage', 'north', 'face']
        if any(sponsor in first_word for sponsor in known_sponsors):
            normalized = ' '.join(words[1:])

    # Clean up
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized.lower()


def calculate_event_core_similarity(event1_norm: str, event2_norm: str) -> float:
    """
    Calculate similarity between normalized event names.
    Focus on core components: location, event type, star rating.
    """
    def extract_core_components(name):
        components = {
            'words': set(word for word in name.split() if len(word) > 2),
            'star_rating': re.findall(r'\d+\*', name),
            'event_type': [],
            'has_qualifier': 'qualifier' in name,
            'has_challenger': 'challenger' in name,
            'has_open': 'open' in name,
            'has_faces': 'faces' in name,
            'has_week': 'week' in name,
            'has_freeride': 'freeride' in name
        }

        event_keywords = ['qualifier', 'challenger', 'open', 'faces', 'week', 'championship', 'freeride']
        for keyword in event_keywords:
            if keyword in name:
                components['event_type'].append(keyword)

        return components

    comp1 = extract_core_components(event1_norm)
    comp2 = extract_core_components(event2_norm)

    total_score = 0
    max_score = 0

    # Word overlap
    if comp1['words'] and comp2['words']:
        word_overlap = len(comp1['words'].intersection(comp2['words'])) / len(comp1['words'].union(comp2['words']))
        total_score += word_overlap * 4
        max_score += 4

    # Star rating must match exactly
    if comp1['star_rating'] == comp2['star_rating']:
        total_score += 2
    max_score += 2

    # Event type similarity
    event_type_overlap = len(set(comp1['event_type']).intersection(set(comp2['event_type']))) / max(len(set(comp1['event_type']).union(set(comp2['event_type']))), 1)
    total_score += event_type_overlap * 2
    max_score += 2

    # Boolean features
    boolean_features = ['has_qualifier', 'has_challenger', 'has_open', 'has_faces', 'has_week', 'has_freeride']
    matching_booleans = sum(1 for feature in boolean_features if comp1[feature] == comp2[feature])
    total_score += (matching_booleans / len(boolean_features)) * 1
    max_score += 1

    return total_score / max_score if max_score > 0 else 0


def events_match_historically(current_event: str, historical_event: str) -> bool:
    """
    Check if events are the same across years with sponsor flexibility.
    Returns True if they represent the same event in different years.
    """
    if current_event == historical_event:
        return False

    current_norm = normalize_event_for_matching(current_event)
    historical_norm = normalize_event_for_matching(historical_event)

    if current_norm == historical_norm:
        return True

    similarity = calculate_event_core_similarity(current_norm, historical_norm)
    return similarity > 0.85


def is_main_series(series_name: str) -> bool:
    """Check if series is a main series (Pro Tour, World Tour) to avoid duplicates."""
    name_lower = series_name.lower()
    return any(keyword in name_lower for keyword in [
        "pro tour", "world tour", "freeride world tour"
    ]) and not any(keyword in name_lower for keyword in [
        "qualifier", "challenger", "junior"
    ])
