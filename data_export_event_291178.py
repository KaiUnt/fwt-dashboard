#!/usr/bin/env python3

import asyncio
import sys
import json
import os
from datetime import datetime
from typing import Dict, List, Any

# Add current directory to Python path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api.client import LiveheatsClient

class EventDataExporter:
    """Comprehensive data exporter for FWT events."""
    
    def __init__(self, event_id: str):
        self.event_id = event_id
        self.client = LiveheatsClient()
        self.export_data = {
            "event_id": event_id,
            "export_timestamp": datetime.now().isoformat(),
            "event_info": {},
            "athletes": [],
            "series_rankings": [],
            "athlete_results": {},
            "summary": {}
        }
    
    async def export_complete_event_data(self) -> Dict[str, Any]:
        """Export all data for the specified event."""
        print(f"🚀 Starting comprehensive data export for Event {self.event_id}")
        print("=" * 80)
        
        try:
            # Step 1: Get event athletes
            print("\n📋 Step 1: Fetching event athletes...")
            await self._fetch_event_athletes()
            
            # Step 2: Get series rankings for all athletes
            print("\n📊 Step 2: Fetching series rankings...")
            await self._fetch_series_rankings()
            
            # Step 3: Get detailed results for each athlete
            print("\n🏆 Step 3: Fetching individual athlete results...")
            await self._fetch_athlete_results()
            
            # Step 4: Generate summary statistics
            print("\n📈 Step 4: Generating summary statistics...")
            self._generate_summary()
            
            print(f"\n✅ Data export completed successfully!")
            return self.export_data
            
        except Exception as e:
            print(f"❌ Error during data export: {str(e)}")
            raise
    
    async def _fetch_event_athletes(self):
        """Fetch all athletes participating in the event."""
        result = await self.client.get_event_athletes(self.event_id)
        
        if not result or 'event' not in result:
            raise ValueError(f"Event {self.event_id} not found")
        
        # Store event information
        self.export_data["event_info"] = result['event']
        
        # Extract and store athlete data
        athletes = []
        athlete_ids = []
        
        for division in result['event']['eventDivisions']:
            division_name = division['division']['name']
            
            for entry in division['entries']:
                if entry['status'] in ['confirmed', 'waitlisted']:
                    athlete = entry['athlete']
                    athlete_data = {
                        "id": athlete['id'],
                        "name": athlete['name'],
                        "nationality": athlete.get('nationality'),
                        "dob": athlete.get('dob'),
                        "image": athlete.get('image'),
                        "bib": entry.get('bib'),
                        "status": entry['status'],
                        "division": division_name
                    }
                    athletes.append(athlete_data)
                    athlete_ids.append(athlete['id'])
        
        # Sort by BIB number
        athletes.sort(key=lambda x: int(x['bib'] or 999))
        
        self.export_data["athletes"] = athletes
        self.athlete_ids = athlete_ids
        
        print(f"   ✓ Found {len(athletes)} athletes across {len(result['event']['eventDivisions'])} divisions")
        print(f"   ✓ Event: {result['event']['name']} ({result['event']['date']})")
    
    async def _fetch_series_rankings(self):
        """Fetch series rankings for all athletes in the event."""
        if not self.athlete_ids:
            print("   ⚠️  No athletes found, skipping series rankings")
            return
        
        # Get FWT series from both organizations for complete history
        series_fwtglobal = await self.client.get_series_by_years("fwtglobal", range(2008, 2031))
        series_fwt = await self.client.get_series_by_years("fwt", range(2008, 2031))
        
        # Combine both organizations
        series_data = []
        if series_fwtglobal:
            series_data.extend(series_fwtglobal)
        if series_fwt:
            series_data.extend(series_fwt)
        
        if not series_data:
            print("   ⚠️  No FWT series found")
            return
        
        series_ids = [s["id"] for s in series_data]
        
        # Fetch rankings for all series
        rankings = await self.client.fetch_multiple_series(series_ids, self.athlete_ids)
        
        self.export_data["series_rankings"] = rankings
        
        print(f"   ✓ Collected rankings from {len(rankings)} series")
        print(f"   ✓ Series IDs processed: {len(series_ids)}")
    
    async def _fetch_athlete_results(self):
        """Fetch detailed results for each athlete."""
        if not self.athlete_ids:
            print("   ⚠️  No athletes found, skipping individual results")
            return
        
        print(f"   📥 Fetching individual results for {len(self.athlete_ids)} athletes...")
        
        # Get complete FWT series history from both organizations
        series_fwtglobal = await self.client.get_series_by_years("fwtglobal", range(2008, 2031))
        series_fwt = await self.client.get_series_by_years("fwt", range(2008, 2031))
        
        # Combine both organizations
        series_data = []
        if series_fwtglobal:
            series_data.extend(series_fwtglobal)
        if series_fwt:
            series_data.extend(series_fwt)
        
        if not series_data:
            print("   ⚠️  No FWT series found for individual results")
            return
        
        series_ids = [s["id"] for s in series_data]
        
        # Process athletes in batches to avoid overwhelming the API
        batch_size = 10
        total_results_collected = 0
        
        for i in range(0, len(self.athlete_ids), batch_size):
            batch = self.athlete_ids[i:i + batch_size]
            print(f"   📊 Processing batch {i//batch_size + 1}/{(len(self.athlete_ids) + batch_size - 1)//batch_size} ({len(batch)} athletes)")
            
            # Get rankings which include results
            rankings = await self.client.fetch_multiple_series(series_ids, batch)
            
            # Extract results from rankings for each athlete
            for athlete_id in batch:
                athlete_results = []
                
                for series in rankings:
                    for division_name, division_rankings in series["divisions"].items():
                        for ranking in division_rankings:
                            if ranking["athlete"]["id"] == athlete_id:
                                for result in ranking.get("results", []):
                                    athlete_results.append({
                                        "series_name": series["series_name"],
                                        "series_id": series["series_id"],
                                        "division": division_name,
                                        "event_name": result.get("eventDivision", {}).get("event", {}).get("name", "Unknown Event"),
                                        "event_date": result.get("eventDivision", {}).get("event", {}).get("date"),
                                        "place": result.get("place"),
                                        "points": result.get("points"),
                                        "full_result_data": result
                                    })
                
                # Sort by date (newest first)
                athlete_results.sort(key=lambda x: x.get("event_date", ""), reverse=True)
                
                self.export_data["athlete_results"][athlete_id] = athlete_results
                total_results_collected += len(athlete_results)
        
        print(f"   ✓ Collected {total_results_collected} individual results across all athletes")
    
    def _generate_summary(self):
        """Generate summary statistics for the exported data."""
        summary = {
            "total_athletes": len(self.export_data["athletes"]),
            "total_series": len(self.export_data["series_rankings"]),
            "total_individual_results": sum(len(results) for results in self.export_data["athlete_results"].values()),
            "divisions": {},
            "nationalities": {},
            "athletes_with_results": 0,
            "athletes_without_results": 0
        }
        
        # Analyze divisions
        for athlete in self.export_data["athletes"]:
            division = athlete["division"]
            summary["divisions"][division] = summary["divisions"].get(division, 0) + 1
        
        # Analyze nationalities
        for athlete in self.export_data["athletes"]:
            nationality = athlete.get("nationality") or "Unknown"
            summary["nationalities"][nationality] = summary["nationalities"].get(nationality, 0) + 1
        
        # Analyze results coverage
        for athlete_id in self.athlete_ids:
            results_count = len(self.export_data["athlete_results"].get(athlete_id, []))
            if results_count > 0:
                summary["athletes_with_results"] += 1
            else:
                summary["athletes_without_results"] += 1
        
        # Add event information to summary
        if self.export_data["event_info"]:
            summary["event_name"] = self.export_data["event_info"].get("name", "Unknown")
            summary["event_date"] = self.export_data["event_info"].get("date", "Unknown")
            summary["event_status"] = self.export_data["event_info"].get("status", "Unknown")
        
        self.export_data["summary"] = summary
        
        print(f"   ✓ Summary Statistics:")
        print(f"     • Athletes: {summary['total_athletes']}")
        print(f"     • Series: {summary['total_series']}")
        print(f"     • Individual Results: {summary['total_individual_results']}")
        print(f"     • Athletes with Results: {summary['athletes_with_results']}")
        print(f"     • Athletes without Results: {summary['athletes_without_results']}")
        print(f"     • Divisions: {list(summary['divisions'].keys())}")
        print(f"     • Top Nationalities: {sorted(summary['nationalities'].items(), key=lambda x: x[1], reverse=True)[:5]}")

async def main():
    """Main function to export event data."""
    event_id = "291178"
    
    print(f"🎯 FWT Event Data Exporter")
    print(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🏆 Target Event ID: {event_id}")
    print("=" * 80)
    
    try:
        # Create exporter and run export
        exporter = EventDataExporter(event_id)
        data = await exporter.export_complete_event_data()
        
        # Save to file
        filename = f"event_{event_id}_complete_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        print(f"\n💾 Saving data to file: {filename}")
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        file_size_mb = os.path.getsize(filename) / (1024 * 1024)
        print(f"✅ Export completed successfully!")
        print(f"📄 File: {filename}")
        print(f"📊 Size: {file_size_mb:.2f} MB")
        print(f"🏆 Event: {data['summary'].get('event_name', 'Unknown')}")
        print(f"👥 Athletes: {data['summary']['total_athletes']}")
        print(f"🏅 Total Results: {data['summary']['total_individual_results']}")
        
    except Exception as e:
        print(f"❌ Export failed: {str(e)}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code) 