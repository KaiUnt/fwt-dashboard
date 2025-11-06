"""
Quick test script to debug seed functionality
Run: python test_seed_debug.py
"""
import asyncio
from datetime import datetime, timezone

async def test_seed():
    print("=== Testing Seed Logic ===")

    # Test year calculation
    current_year = datetime.now(timezone.utc).year
    start_year = current_year - 2
    end_year = current_year + 1

    print(f"Current year: {current_year}")
    print(f"Start year: {start_year}")
    print(f"End year (exclusive): {end_year}")
    print(f"Years to load: {list(range(start_year, end_year))}")

    # Test LiveheatsClient
    try:
        from api.client import LiveheatsClient
        client = LiveheatsClient()
        print("\n✅ LiveheatsClient imported successfully")

        # Test get_series_by_years
        print(f"\nFetching series for years {start_year}-{current_year}...")
        series_data = await client.get_series_by_years("fwtglobal", range(start_year, end_year))

        if series_data:
            print(f"✅ Found {len(series_data)} series:")
            for s in series_data:
                print(f"  - {s.get('name')} (ID: {s.get('id')})")
        else:
            print("❌ No series data returned")

    except Exception as e:
        print(f"❌ Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_seed())
