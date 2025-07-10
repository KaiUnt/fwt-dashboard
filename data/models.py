from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Dict

@dataclass
class Athlete:
    id: str
    name: str
    nationality: Optional[str] = None
    dob: Optional[datetime] = None
    image: Optional[str] = None
    bib: Optional[str] = None

@dataclass
class EventResult:
    event_name: str
    date: datetime
    place: Optional[int]
    points: Optional[float]

@dataclass
class SeriesResult:
    series_name: str
    series_year: int
    division_name: str
    place: int
    points: float
    results: List[EventResult]

@dataclass
class AthleteStats:
    best_result: Optional[Dict[str, EventResult]]  # {"by_points": ..., "by_rank": ...}
    oldest_result: Optional[EventResult]
    best_series_place: Optional[SeriesResult]
    best_pro_place: Optional[SeriesResult]
    best_challenger_place: Optional[SeriesResult]
    total_events: int
    total_series: int
    best_pro_event: Optional[EventResult] = None  # Neu: Bestes Event in Pro-Serie
    best_challenger_event: Optional[EventResult] = None  # Neu: Bestes Event in Challenger-Serie


@dataclass
class RankingsData:
    athlete: Athlete
    stats: AthleteStats
    series_results: List[SeriesResult]