from datetime import datetime
from typing import List, Dict, Optional
from .models import (
    Athlete, EventResult, SeriesResult, 
    AthleteStats, RankingsData
)
import re

class RankingsProcessor:
    @staticmethod
    def extract_year_from_series(series_name: str) -> int:
        """Extract year from series name."""
        match = re.search(r'(\d{4})', series_name)
        return int(match.group(1)) if match else datetime.now().year
    
    @staticmethod
    def process_event_result(raw_result: Dict) -> Optional[EventResult]:
        """Convert raw event result data to EventResult object."""
        try:
            event_data = raw_result['eventDivision']['event']
            return EventResult(
                event_name=event_data['name'],
                date=datetime.fromisoformat(event_data['date'].replace('Z', '+00:00')),
                place=int(raw_result['place']) if raw_result.get('place') else None,
                points=float(raw_result['points']) if raw_result.get('points') else None
            )
        except (KeyError, ValueError) as e:
            print(f"Warnung: Konnte Event Result nicht verarbeiten: {e}")
            return None
    
    @staticmethod
    def process_series_result(series_name: str, division_name: str, raw_ranking: Dict) -> Optional[SeriesResult]:
        """Convert raw series ranking data to SeriesResult object."""
        try:
            # Verarbeite nur Results, die gültige Daten haben
            valid_results = []
            for result in raw_ranking.get('results', []):
                processed_result = RankingsProcessor.process_event_result(result)
                if processed_result:
                    valid_results.append(processed_result)
            
            return SeriesResult(
                series_name=series_name,
                series_year=RankingsProcessor.extract_year_from_series(series_name),
                division_name=division_name,
                place=int(raw_ranking['place']) if raw_ranking.get('place') else 0,
                points=float(raw_ranking['points']) if raw_ranking.get('points') else 0.0,
                results=valid_results
            )
        except (KeyError, ValueError) as e:
            print(f"Warnung: Konnte Series Result nicht verarbeiten: {e}")
            return None

    @staticmethod
    def create_empty_series_result() -> SeriesResult:
        """Create an empty series result for new athletes."""
        return SeriesResult(
            series_name="New Athlete",
            series_year=datetime.now().year,
            division_name="No Division",
            place=0,
            points=0.0,
            results=[]
        )

    @staticmethod
    def calculate_athlete_stats(series_results: List[SeriesResult]) -> AthleteStats:
        """Calculate athlete statistics."""
        # Wenn keine Series-Ergebnisse vorhanden sind, erstelle leere Statistik
        if not series_results:
            return AthleteStats(
                best_result=None,
                oldest_result=None,
                best_series_place=None,
                best_pro_place=None,
                best_challenger_place=None,
                total_events=0,
                total_series=0,
                best_pro_event=None,
                best_challenger_event=None
            )

        all_events = []  # Sammelt alle Events
        unique_event_names = set()  # Für die Zählung einzigartiger Events
        best_series_by_place = None
        best_pro_by_place = None
        best_challenger_by_place = None
        best_pro_by_event = None
        best_challenger_by_event = None

        unique_seasons = {RankingsProcessor.extract_year_from_series(r.series_name) 
                      for r in series_results if r and r.series_name and r.series_name != "New Athlete"}
        
        relevant_series = [
            r for r in series_results
            if r and r.series_name  # Stelle sicher, dass die Serie gültig ist
            and not any(term.lower() in r.series_name.lower()
                        for term in ["National Ranking", "Seeding List"])  # Filtere irrelevante Serien
        ]


        for result in relevant_series:
            for e in result.results:
                if e and e.event_name:
                    # Kombiniere Eventnamen mit dem Jahr der Serie
                    event_key = (e.event_name, RankingsProcessor.extract_year_from_series(result.series_name))
                    if event_key not in unique_event_names:
                        unique_event_names.add(event_key)  # Füge neuen Event-Schlüssel hinzu
                        all_events.append(e)  # Event zur Liste hinzufügen

        for result in series_results:
            # Überspringe leere Series-Ergebnisse
            if not result or not result.series_name:
                continue

            # Track best series result by overall place
            if result.place and \
            (not best_series_by_place or result.place < best_series_by_place.place) and \
            not any(term.lower() in result.series_name.lower() for term in ["National Ranking", "Seeding List"]):
                best_series_by_place = result

            # Best Pro Event
            if 'Pro' in result.series_name:
                if result.place and (not best_pro_by_place or result.place < best_pro_by_place.place):
                    best_pro_by_place = result

                valid_pro_events = [
                    e for e in result.results 
                    if e and e.points is not None and any(term in e.event_name for term in ['Pro', 'Freeride World Tour'])
    ]
                if valid_pro_events:
                    current_best = max(valid_pro_events, key=lambda x: x.points)
                    if not best_pro_by_event or current_best.points > best_pro_by_event.points:
                        best_pro_by_event = current_best

            # Best Challenger Event
            if 'Challenger' in result.series_name:
                valid_challenger_events = [e for e in result.results if e and e.points is not None and 'Challenger' in e.event_name]
                if valid_challenger_events:
                    current_best = max(valid_challenger_events, key=lambda x: x.points)
                    if not best_challenger_by_event or current_best.points > best_challenger_by_event.points:
                        best_challenger_by_event = current_best


            # Collect all valid event results
            all_events.extend([e for e in result.results if e is not None])

        # Find best and oldest results
        valid_events = [e for e in all_events if e and e.points is not None and e.place is not None]
        
        best_event_by_points = None
        best_event_by_rank = None
        oldest_result = None
        
        if valid_events:
            best_event_by_points = max(valid_events, key=lambda x: x.points)
            best_event_by_rank = min(valid_events, key=lambda x: (x.place, -x.date.timestamp()))
            oldest_result = min(valid_events, key=lambda x: x.date)

        return AthleteStats(
            best_result={
                "by_points": best_event_by_points,
                "by_rank": best_event_by_rank
            },
            oldest_result=oldest_result,
            best_series_place=best_series_by_place,
            best_pro_place=best_pro_by_place,
            best_challenger_place=best_challenger_by_place,
            total_events=len(unique_event_names),
            total_series = len(unique_seasons),  # Anzahl der einzigartigen Jahre
            best_pro_event=best_pro_by_event,
            best_challenger_event=best_challenger_by_event
        )

    def process_rankings(self, raw_data: Dict, bib_mapping: Dict[str, str]) -> List[RankingsData]:
        """Process raw rankings data into structured format."""
        rankings_data = []
        athlete_processed = set()  # Track processed athletes
        
        # Verarbeite alle Series-Ergebnisse
        for series_data in raw_data.get('results', []):
            if not series_data:
                continue
                
            series_name = series_data['series_name']
            
            for division_name, rankings in series_data['divisions'].items():
                for ranking in rankings:
                    athlete_data = ranking.get('athlete', {})
                    if not athlete_data:
                        continue
                        
                    athlete_id = athlete_data.get('id')
                    if not athlete_id:
                        continue

                    # Create or update athlete object
                    athlete = Athlete(
                        id=athlete_id,
                        name=athlete_data.get('name', 'Unknown'),
                        nationality=athlete_data.get('nationality'),
                        dob=datetime.fromisoformat(athlete_data['dob'].replace('Z', '+00:00')) if athlete_data.get('dob') else None,
                        image=athlete_data.get('image'),
                        bib=bib_mapping.get(athlete_id)
                    )

                    # Process series result
                    series_result = self.process_series_result(series_name, division_name, ranking)
                    if not series_result:
                        continue

                    # Find or create rankings data for this athlete
                    athlete_rankings = next(
                        (r for r in rankings_data if r.athlete.id == athlete.id),
                        None
                    )
                    
                    if athlete_rankings:
                        athlete_rankings.series_results.append(series_result)
                    else:
                        athlete_rankings = RankingsData(
                            athlete=athlete,
                            stats=None,  # Will be calculated later
                            series_results=[series_result]
                        )
                        rankings_data.append(athlete_rankings)
                    
                    athlete_processed.add(athlete_id)

        # Verarbeite Athleten ohne Ergebnisse
        for athlete_id, bib in bib_mapping.items():
            if athlete_id not in athlete_processed:
                # Erstelle leeres RankingsData-Objekt für neue Athleten
                empty_athlete = Athlete(
                    id=athlete_id,
                    name=f"Athlete {bib}" if bib else f"Athlete {athlete_id}",
                    nationality=None,
                    dob=None,
                    image=None,
                    bib=bib
                )
                
                empty_rankings = RankingsData(
                    athlete=empty_athlete,
                    stats=None,  # Will be calculated below
                    series_results=[self.create_empty_series_result()]
                )
                rankings_data.append(empty_rankings)

        # Calculate stats for all athletes
        for rankings in rankings_data:
            rankings.stats = self.calculate_athlete_stats(rankings.series_results)

        # Sort by BIB number if available
        rankings_data.sort(
            key=lambda x: int(x.athlete.bib) if x.athlete.bib and x.athlete.bib.isdigit() else float('inf')
        )
        
        print(f"Verarbeitet: {len(rankings_data)} Athleten "
              f"({len(athlete_processed)} mit Ergebnissen, "
              f"{len(rankings_data) - len(athlete_processed)} ohne Ergebnisse)")
        
        return rankings_data