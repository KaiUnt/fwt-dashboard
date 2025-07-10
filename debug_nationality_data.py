#!/usr/bin/env python3

import asyncio
import sys
import json
sys.path.append('.')

from api.client import LiveheatsClient

async def debug_nationality_data():
    """Deep dive into nationality data from LiveHeats API"""
    client = LiveheatsClient()
    
    print("🔍 DEEP DIVE: NATIONALITY DATA ANALYSIS")
    print("=" * 60)
    
    try:
        # Get available events
        events = await client.get_future_events()
        if not events:
            print("❌ No events found")
            return
        
        print(f"Found {len(events)} available events:")
        for i, event in enumerate(events[:5]):
            print(f"{i+1}. {event['name']} ({event['date']})")
        
        # Test with the first event
        test_event = events[0]
        event_id = test_event['id']
        
        print(f"\n🎯 TESTING EVENT: {test_event['name']}")
        print(f"Event ID: {event_id}")
        print("=" * 60)
        
        # Use the existing method that works
        print("\n📡 EVENT ATHLETE DATA (via existing method):")
        print("-" * 50)
        
        result = await client.get_event_athletes(event_id)
        
        if not result:
            print("❌ No event data retrieved")
            return
            
        event_data = result['event']
        print(f"Event Name: {event_data['name']}")
        print(f"Event Date: {event_data['date']}")
        print(f"Event Status: {event_data['status']}")
        print(f"Total Divisions: {len(event_data['eventDivisions'])}")
        
        # Detailed athlete analysis
        total_athletes = 0
        nationality_stats = {}
        missing_nationality_athletes = []
        all_athlete_data = []
        
        for div_idx, division in enumerate(event_data['eventDivisions']):
            division_name = division['division']['name']
            entries = division['entries']
            
            print(f"\n📊 Division {div_idx+1}: {division_name}")
            print(f"  Total entries: {len(entries)}")
            
            confirmed_athletes = [e for e in entries if e['status'] in ['confirmed', 'waitlisted']]
            print(f"  Confirmed/Waitlisted: {len(confirmed_athletes)}")
            
            for entry in confirmed_athletes:
                athlete = entry['athlete']
                total_athletes += 1
                
                # Raw data inspection
                athlete_id = athlete['id']
                name = athlete['name']
                nationality = athlete.get('nationality')
                dob = athlete.get('dob')
                image = athlete.get('image')
                bib = entry.get('bib')
                status = entry['status']
                
                # Store for later analysis
                all_athlete_data.append({
                    'id': athlete_id,
                    'name': name,
                    'nationality': nationality,
                    'bib': bib,
                    'division': division_name,
                    'dob': dob,
                    'image': image,
                    'status': status
                })
                
                # Only print first 15 for readability
                if total_athletes <= 15:
                    print(f"\n  🏃‍♂️ Athlete #{total_athletes}:")
                    print(f"    ID: {athlete_id}")
                    print(f"    Name: {name}")
                    print(f"    BIB: {bib}")
                    print(f"    Status: {status}")
                    print(f"    RAW nationality field: '{nationality}' (type: {type(nationality)})")
                    print(f"    DOB: {dob}")
                    print(f"    Image: {image}")
                
                # Track nationality stats
                if nationality is None:
                    nat_key = "NULL"
                elif nationality == "":
                    nat_key = "EMPTY_STRING"
                elif nationality.strip() == "":
                    nat_key = "WHITESPACE_ONLY"
                else:
                    nat_key = nationality
                
                nationality_stats[nat_key] = nationality_stats.get(nat_key, 0) + 1
                
                if not nationality or nationality.strip() == "":
                    missing_nationality_athletes.append({
                        'id': athlete_id,
                        'name': name,
                        'bib': bib,
                        'division': division_name,
                        'raw_nationality': repr(nationality)
                    })
        
        print(f"\n... (showing first 15 of {total_athletes} total athletes)")
        
        print("\n" + "=" * 60)
        print("📊 NATIONALITY STATISTICS:")
        print("-" * 40)
        
        for nat, count in sorted(nationality_stats.items()):
            if nat in ["NULL", "EMPTY_STRING", "WHITESPACE_ONLY"]:
                print(f"❌ {nat}: {count} athletes ({count/total_athletes*100:.1f}%)")
            else:
                print(f"✅ {nat}: {count} athletes ({count/total_athletes*100:.1f}%)")
        
        if missing_nationality_athletes:
            print(f"\n❌ ATHLETES MISSING NATIONALITY ({len(missing_nationality_athletes)}):")
            print("-" * 50)
            for athlete in missing_nationality_athletes:
                print(f"  • {athlete['name']} (BIB {athlete['bib']}) - ID: {athlete['id']}")
                print(f"    Division: {athlete['division']}")
                print(f"    Raw nationality: {athlete['raw_nationality']}")
                print()
        
        # Check cached athlete details
        print(f"\n💾 CACHED ATHLETE DETAILS CHECK:")
        print(f"Client cached {len(client.athlete_details)} athlete details")
        
        if client.athlete_details:
            print("\nSample cached data (first 5 athletes):")
            for i, (athlete_id, cached_data) in enumerate(list(client.athlete_details.items())[:5]):
                print(f"  {i+1}. {cached_data.get('name', 'Unknown')}")
                print(f"     ID: {athlete_id}")
                print(f"     Cached nationality: '{cached_data.get('nationality')}' (type: {type(cached_data.get('nationality'))})")
                print(f"     BIB: {cached_data.get('bib')}")
                print()
        
        # Now test series rankings
        print("\n🏆 SERIES RANKINGS DATA CHECK:")
        print("-" * 40)
        
        # Get athlete IDs for series lookup
        athlete_ids = [data['id'] for data in all_athlete_data[:10]]  # Test first 10
        
        print(f"Testing series rankings for {len(athlete_ids)} athletes...")
        
        # Get series data
        series_data = await client.get_series_by_years("fwtglobal", range(2012, 2030))
        series_ids = [s["id"] for s in series_data] if series_data else []
        
        if series_ids and athlete_ids:
            rankings = await client.fetch_multiple_series(series_ids[:2], athlete_ids)
            
            print(f"Retrieved {len(rankings)} series with rankings")
            
            for series in rankings:
                series_name = series.get("series_name", "Unknown")
                print(f"\n📈 Series: {series_name}")
                
                for division_name, division_rankings in series["divisions"].items():
                    print(f"  Division: {division_name} ({len(division_rankings)} athletes)")
                    
                    for ranking in division_rankings[:5]:  # Limit output
                        athlete = ranking["athlete"]
                        print(f"    🏃‍♂️ {athlete['name']}")
                        print(f"       ID: {athlete['id']}")
                        print(f"       Series nationality: '{athlete.get('nationality')}' (type: {type(athlete.get('nationality'))})")
                        print(f"       Place: {ranking.get('place')}")
                        print(f"       Points: {ranking.get('points')}")
                        print()
            
            # Cross-reference check
            print("\n🔄 CROSS-REFERENCE: Event vs Series nationality data:")
            print("-" * 50)
            
            # Create lookup for event athletes
            event_lookup = {data['id']: data for data in all_athlete_data}
            
            comparison_count = 0
            for series in rankings:
                for division_name, division_rankings in series["divisions"].items():
                    for ranking in division_rankings:
                        athlete_id = ranking["athlete"]["id"]
                        series_nationality = ranking["athlete"].get("nationality")
                        
                        if athlete_id in event_lookup:
                            event_data = event_lookup[athlete_id]
                            event_nationality = event_data['nationality']
                            name = event_data['name']
                            
                            comparison_count += 1
                            print(f"🔍 {name} (ID: {athlete_id})")
                            print(f"   Event nationality: '{event_nationality}' (type: {type(event_nationality)})")
                            print(f"   Series nationality: '{series_nationality}' (type: {type(series_nationality)})")
                            
                            if event_nationality != series_nationality:
                                print(f"   ⚠️  MISMATCH! Different sources have different data")
                            else:
                                print(f"   ✅ Match - consistent across sources")
                            print()
                            
                            if comparison_count >= 5:  # Limit output
                                break
                    if comparison_count >= 5:
                        break
                if comparison_count >= 5:
                    break
        
        # Final summary
        print("\n" + "=" * 60)
        print("🎯 FINAL ANALYSIS:")
        print("-" * 40)
        print(f"Total athletes analyzed: {total_athletes}")
        print(f"Athletes with nationality: {total_athletes - len(missing_nationality_athletes)}")
        print(f"Athletes missing nationality: {len(missing_nationality_athletes)}")
        print(f"Missing percentage: {len(missing_nationality_athletes)/total_athletes*100:.1f}%")
        
        if missing_nationality_athletes:
            print(f"\n💡 CONCLUSION: LiveHeats API does have some athletes without nationality data.")
            print(f"   This appears to be normal for qualifier events with new athletes.")
            print(f"   Our 'International' fallback is appropriate.")
        else:
            print(f"\n✅ CONCLUSION: All athletes in this event have nationality data.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(debug_nationality_data()) 