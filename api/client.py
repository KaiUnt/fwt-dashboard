import aiohttp
import asyncio
import re
from typing import Dict, Optional, Any, List
try:
    from ..utils.logging import get_logger
except ImportError:
    # Fallback für direkte Ausführung
    from utils.logging import get_logger
try:
    from .queries import GraphQLQueries
except ImportError:
    # Fallback für direkte Ausführung
    from api.queries import GraphQLQueries
from datetime import datetime, timezone, timedelta
import os
print(f"Lade Client.py von: {os.path.abspath(__file__)}")


logger = get_logger(__name__)

class GraphQLClient:
    """Base GraphQL client for Liveheats API interactions."""
    
    def __init__(self, base_url: str = "https://liveheats.com/api/graphql"):
        self.base_url = base_url
        self._session: Optional[aiohttp.ClientSession] = None
        
    async def __aenter__(self):
        self._session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._session:
            await self._session.close()
            
    async def execute(self, query: str, variables: Dict[str, Any] = None) -> Dict:
        """Execute a GraphQL query."""
        if not self._session:
            raise RuntimeError("Client not initialized. Use 'async with' context manager.")
            
        try:
            logger.debug(f"Sende Anfrage: {variables}")
            async with self._session.post(
                self.base_url,
                json={
                    "query": query,
                    "variables": variables or {}
                }
            ) as response:
                if response.status != 200:
                    logger.error(f"HTTP Error {response.status} für Variables: {variables}")
                    response_text = await response.text()
                    logger.error(f"Response: {response_text}")
                    return None
                    
                data = await response.json()
                if "errors" in data:
                    logger.error(f"GraphQL Error: {data['errors']}")
                    return None
                    
                return data.get("data")
                
        except Exception as e:
            logger.error(f"Request failed: {str(e)}")
            return None
        
class LiveheatsClient:
    """Specialized client for Liveheats API operations."""
    
    def __init__(self):
        self.client = GraphQLClient()
        self.queries = GraphQLQueries()
        self.athlete_details = {}  # Cache für Athleten-Details
        
    async def get_event_athletes(self, event_id: str) -> Dict:
        """Fetch athletes for a specific event and cache their details."""
        async with self.client as client:
            result = await client.execute(
                self.queries.GET_EVENT_ATHLETES,
                {"id": event_id}
            )
            
            if not result or "event" not in result:
                logger.error(f"Keine Event-Daten gefunden für ID: {event_id}")
                return None

            # Cache athlete details from event
            for division in result["event"]["eventDivisions"]:
                for entry in division["entries"]:
                    if entry["status"] in ["confirmed", "waitlisted"]:
                        athlete = entry["athlete"]
                        athlete_id = athlete["id"]
                        # Erweitere Athleten-Details um BIB und Status
                        self.athlete_details[athlete_id] = {
                            **athlete,
                            "bib": entry.get("bib"),
                            "status": entry["status"]
                        }
                        logger.debug(f"Cached athlete details: {athlete['name']} (ID: {athlete_id})")
            
            logger.info(f"Cached details for {len(self.athlete_details)} athletes")
            return result
        
    async def get_fwt_series(self, organisation_short_name: str = "fwtglobal") -> List[str]:
        """Fetch all FWT series IDs from Liveheats."""
        async with self.client as client:
            result = await client.execute(
                self.queries.GET_FWT_SERIES,
                {"shortName": organisation_short_name}
            )
            
            if not result or "organisationByShortName" not in result:
                logger.error(f"Keine Organisation gefunden für: {organisation_short_name}")
                return []
                
            org_data = result["organisationByShortName"]
            series_list = org_data.get("series", [])
            
            relevant_series = [
                series for series in series_list 
                if series.get("rankingsDivisions") and len(series["rankingsDivisions"]) > 0
            ]
            
            return [series["id"] for series in relevant_series]
        
    async def fetch_multiple_series(self, series_ids: List[str], athlete_ids: List[str]) -> list:
        """Fetch rankings data for multiple series and create uniform data structure for all athletes."""
        async with self.client as client:
            # Track processed athletes
            processed_athletes = set()
            
            # Create tasks for all series
            tasks = [
                self._process_series(client, series_id, athlete_ids)
                for series_id in series_ids
            ]
            
            # Execute all tasks in parallel
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Filter valid results
            valid_results = []
            for r in results:
                if r is not None and not isinstance(r, Exception):
                    valid_results.append(r)
                    # Track athletes found in rankings
                    for division_data in r['divisions'].values():
                        for ranking in division_data:
                            processed_athletes.add(ranking['athlete']['id'])
            
            # Find athletes without any results
            athletes_without_results = set(athlete_ids) - processed_athletes
            
            if athletes_without_results:
                logger.info(f"Gefunden: {len(athletes_without_results)} Athleten ohne Ergebnisse")
                
                # Erstelle leere Series für Athleten ohne Ergebnisse
                empty_series = {
                    'series_id': 'new_athlete',
                    'series_name': 'New Athlete',
                    'divisions': {'New Athletes': []}
                }
                
                # Füge jeden Athleten ohne Ergebnisse hinzu
                for athlete_id in athletes_without_results:
                    # Hole gespeicherte Athleten-Details
                    athlete_data = self.athlete_details.get(athlete_id)
                    if athlete_data:
                        empty_ranking = {
                            'athlete': {
                                'id': athlete_id,
                                'name': athlete_data['name'],
                                'nationality': athlete_data.get('nationality'),
                                'dob': athlete_data.get('dob'),
                                'image': athlete_data.get('image')
                            },
                            'place': None,
                            'points': None,
                            'results': []
                        }
                        empty_series['divisions']['New Athletes'].append(empty_ranking)
                        logger.debug(f"Added new athlete: {athlete_data['name']} (ID: {athlete_id})")
                    else:
                        logger.warning(f"Keine Details gefunden für Athlet ID: {athlete_id}")

                # Füge die leere Series nur hinzu, wenn sie Athleten enthält
                if empty_series['divisions']['New Athletes']:
                    valid_results.append(empty_series)
            
            total_athletes = len(processed_athletes) + len(athletes_without_results)
            logger.info(f"Verarbeitet: {len(valid_results)} Series")
            logger.info(f"Gefundene Athleten insgesamt: {total_athletes}")
            
            if total_athletes != len(self.athlete_details):
                logger.warning(
                    f"Warnung: Anzahl verarbeiteter Athleten ({total_athletes}) "
                    f"weicht von gecachten Athleten ({len(self.athlete_details)}) ab"
                )
            
            return valid_results
        
    async def get_series_by_years(self, short_name: str = "fwtglobal", years: range = range(2008, 2031)) -> list:
        """Fetch series from an organisation and filter by year."""
        async with self.client as client:
            result = await client.execute(self.queries.GET_ORGANISATION_SERIES, {"shortName": short_name})
            
            if not result or "organisationByShortName" not in result:
                logger.error(f"Keine Organisation gefunden mit ShortName: {short_name}")
                return []
            
            series = result["organisationByShortName"].get("series", [])
            logger.info(f"{len(series)} Serien gefunden.")
            
            # Filter Serien basierend auf Jahreszahlen (2008-2030)
            filtered_series = []
            for s in series:
                # Erweiterte Suche für Jahre 2008-2030
                match = re.search(r'\b(20(?:0[8-9]|1[0-9]|2[0-9]|30))\b', s["name"])
                if match and int(match.group(1)) in years:
                    filtered_series.append(s)
            
            logger.info(f"{len(filtered_series)} Serien in den Jahren {years} gefunden.")
            return filtered_series

    async def get_events_from_series(self, series_ids: list, include_past: bool = False) -> list:
        """Fetch events from a list of series IDs.
        
        Args:
            series_ids: List of series IDs to fetch events from
            include_past: If True, include all events. If False, filter to future events 
                         with 5-day grace period for recently ended events.
        """
        async with self.client as client:
            events = []
            # Concurrency limit to avoid overwhelming upstream API
            concurrency_limit = int(os.getenv("EVENTS_FETCH_CONCURRENCY", "6"))
            semaphore = asyncio.Semaphore(concurrency_limit)

            async def fetch_series_events(series_id: str):
                try:
                    async with semaphore:
                        return await client.execute(self.queries.GET_EVENTS_BY_SERIES, {"id": series_id})
                except Exception as e:
                    logger.error(f"Fehler beim Laden der Events für Serie {series_id}: {str(e)}")
                    return None

            tasks = [fetch_series_events(series_id) for series_id in series_ids]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for result in results:
                if isinstance(result, Exception) or not result:
                    continue
                if "series" in result and "events" in result["series"]:
                    events.extend(result["series"]["events"])
            
            logger.info(f"{len(events)} Events vor Filterung/Deduplikation gefunden.")
            
            if include_past:
                # Alle Events (keine Datum-Filterung)
                unique_events = self._deduplicate_events_by_id(events)
                logger.info(f"{len(unique_events)} Events (inkl. vergangene) nach Deduplikation.")
                return unique_events
            else:
                # Nach Datum filtern (nur zukünftige Events mit Grace-Periode)
                filtered_events = self._filter_events_by_date_with_grace(events, grace_days=5)
                unique_events = self._deduplicate_events_by_id(filtered_events)
                logger.info(f"{len(unique_events)} zukünftige Events nach Filter/Deduplikation.")
                return unique_events


    async def get_future_events(self) -> list:
        """Fetch future events for FWT series in recent years."""
        # Hole die Serien der Organisation (nur neuere Jahre für Performance)
        series = await self.get_series_by_years("fwtglobal", range(2024, 2030))
        if not series:
            return []
        
        # Extrahiere und dedupliziere Serien-IDs
        series_ids = [s["id"] for s in series]
        series_ids = list(dict.fromkeys(series_ids))  # Preserve order, remove duplicates
        logger.info(f"{len(series_ids)} eindeutige Serien-IDs für Future Events.")
        
        # Hole Events aus den Serien
        return await self.get_events_from_series(series_ids, include_past=False)

    async def get_all_events(self) -> list:
        """Fetch ALL events (including past) for FWT series since 2008."""
        # Hole Serien nur von fwtglobal Organisation (komplette FWT Historie)
        series = await self.get_series_by_years("fwtglobal", range(2008, 2031))
        if not series:
            return []
        
        # Extrahiere und dedupliziere Serien-IDs
        series_ids = [s["id"] for s in series]
        series_ids = list(dict.fromkeys(series_ids))  # Preserve order, remove duplicates
        logger.info(f"{len(series_ids)} eindeutige Serien-IDs für All Events.")
        
        # Hole ALLE Events aus den Serien (inkl. vergangene)
        return await self.get_events_from_series(series_ids, include_past=True)
            
    async def _process_series(self, client: GraphQLClient, series_id: str, athlete_ids: List[str]) -> Optional[Dict]:
        """Process a single series and its divisions."""
        try:
            if not series_id or series_id.lower() == "id":
                logger.debug(f"Überspringe ungültige Series ID: {series_id}")
                return None
                
            logger.debug(f"Verarbeite Series ID: {series_id}")
            
            # Get divisions for series
            divisions_data = await client.execute(
                self.queries.GET_DIVISIONS,
                {"id": str(series_id)}
            )
            
            if not divisions_data or "series" not in divisions_data:
                return None
                
            series_data = divisions_data["series"]
            if not series_data:
                return None
            
            divisions = series_data.get("rankingsDivisions", [])
            if not divisions:
                return None
                
            results = {}
            series_has_results = False
            
            for division in divisions:
                rankings = await client.execute(
                    self.queries.GET_SERIES_RANKINGS,
                    {"id": series_id, "divisionId": division["id"]}
                )
                
                if rankings and "series" in rankings and "rankings" in rankings["series"]:
                    filtered_rankings = [
                        r for r in rankings["series"]["rankings"]
                        if r["athlete"]["id"] in athlete_ids
                    ]
                    
                    if filtered_rankings:
                        results[division["name"]] = filtered_rankings
                        series_has_results = True
                        logger.debug(
                            f"Gefunden: {len(filtered_rankings)} Athleten "
                            f"in Division {division['name']}"
                        )
            
            if series_has_results:
                return {
                    "series_id": series_id,
                    "series_name": series_data["name"],
                    "divisions": results
                }
            
            return None
                
        except Exception as e:
            logger.error(f"Fehler bei Series {series_id}: {str(e)}")
            return None

    def _deduplicate_events_by_id(self, events: list) -> list:
        """Helper: Remove duplicate events by ID."""
        unique_events = {event["id"]: event for event in events if "id" in event}
        return list(unique_events.values())

    def _filter_events_by_date_with_grace(self, events: list, grace_days: int = 5) -> list:
        """Helper: Filter events to include future events and recent past (grace period)."""
        if not events:
            return []
            
        now = datetime.now(timezone.utc)
        grace_period = now - timedelta(days=grace_days)
        
        future_events = []
        for event in events:
            try:
                if "date" not in event or not event["date"]:
                    logger.warning(f"Event ohne Datum übersprungen: {event.get('id', 'Unknown')}")
                    continue
                    
                event_date = datetime.fromisoformat(event["date"].replace("Z", "+00:00"))
                if event_date >= grace_period:
                    future_events.append(event)
            except Exception as e:
                logger.warning(f"Fehler beim Parsen des Datums für Event {event.get('id', 'Unknown')}: {e}")
                continue
                
        return future_events