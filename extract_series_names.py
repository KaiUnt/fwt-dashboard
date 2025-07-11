#!/usr/bin/env python3

import json
import re
from collections import defaultdict

def extract_series_names(json_file_path):
    """Extract all unique series names from the JSON file"""
    
    print(f"Loading data from {json_file_path}...")
    
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    series_names = set()
    series_by_category = defaultdict(list)
    
    def categorize_series(name):
        """Categorize series based on name patterns"""
        name_lower = name.lower()
        
        if any(x in name_lower for x in ['fwt pro', 'pro tour']):
            return 'Pro Tour'
        elif any(x in name_lower for x in ['challenger']):
            return 'Challenger'
        elif any(x in name_lower for x in ['qualifier', 'fwq']):
            return 'Qualifier'
        elif any(x in name_lower for x in ['junior', 'youth']):
            return 'Junior'
        elif any(x in name_lower for x in ['seeding', 'qualifying list']):
            return 'Seeding/Qualifying Lists'
        elif any(x in name_lower for x in ['national', 'rankings']):
            return 'National Rankings'
        elif any(x in name_lower for x in ['ifsa']):
            return 'IFSA'
        elif any(x in name_lower for x in ['world championship']):
            return 'World Championships'
        else:
            return 'Other'
    
    def extract_year(name):
        """Extract year from series name"""
        years = re.findall(r'\b(20[0-9]{2})\b', name)
        return years[0] if years else 'Unknown'
    
    # Extract series names from the data structure
    if 'series_rankings' in data:
        for series in data['series_rankings']:
            series_name = series.get('series_name', '')
            if series_name:
                series_names.add(series_name)
                category = categorize_series(series_name)
                year = extract_year(series_name)
                series_by_category[category].append({
                    'name': series_name,
                    'year': year
                })
    
    return series_names, series_by_category

def write_analysis_file(series_names, series_by_category, output_file):
    """Write analysis to output file"""
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("=== FWT SERIES ANALYSIS ===\n\n")
        f.write(f"Total unique series found: {len(series_names)}\n\n")
        
        # Write by category
        f.write("=== SERIES BY CATEGORY ===\n\n")
        
        # Define order for categories
        category_order = [
            'Pro Tour',
            'Challenger', 
            'Qualifier',
            'Junior',
            'World Championships',
            'IFSA',
            'National Rankings',
            'Seeding/Qualifying Lists',
            'Other'
        ]
        
        for category in category_order:
            if category in series_by_category:
                f.write(f"### {category.upper()} ({len(series_by_category[category])} series)\n")
                
                # Sort by year descending, then by name
                sorted_series = sorted(series_by_category[category], 
                                     key=lambda x: (x['year'], x['name']), 
                                     reverse=True)
                
                for series in sorted_series:
                    f.write(f"  - {series['year']}: {series['name']}\n")
                f.write("\n")
        
        # Write all series alphabetically
        f.write("=== ALL SERIES (ALPHABETICAL) ===\n\n")
        for series_name in sorted(series_names):
            f.write(f"- {series_name}\n")
        
        f.write("\n=== PATTERNS DETECTED ===\n\n")
        f.write("Pro Tour patterns:\n")
        f.write("  - 'FWT Pro Tour 20XX'\n\n")
        
        f.write("Challenger patterns:\n")
        f.write("  - 'FWT Challenger Region X ...'\n")
        f.write("  - '20XX FWT Challenger by Orage Qualifying List'\n\n")
        
        f.write("Qualifier patterns:\n")
        f.write("  - 'FWT Qualifier Region X ...'\n")
        f.write("  - 'FWT Qualifier National Rankings 20XX'\n")
        f.write("  - 'IFSA Qualifier Region X ...'\n\n")
        
        f.write("Junior patterns:\n")
        f.write("  - 'FWT Junior Region X ...'\n")
        f.write("  - 'FWT Qualifier Junior National Rankings 20XX'\n")
        f.write("  - 'Freeride Junior World Championship Ranking 20XX'\n\n")

if __name__ == "__main__":
    json_file = "event_291178_complete_data_20250711_214006.json"
    output_file = "series_analysis.txt"
    
    try:
        series_names, series_by_category = extract_series_names(json_file)
        write_analysis_file(series_names, series_by_category, output_file)
        
        print(f"\n✅ Analysis complete!")
        print(f"📄 Results written to: {output_file}")
        print(f"📊 Found {len(series_names)} unique series")
        print(f"📋 Categories: {len(series_by_category)}")
        
        # Quick summary
        print("\n=== QUICK SUMMARY ===")
        for category, series_list in series_by_category.items():
            print(f"{category}: {len(series_list)} series")
            
    except Exception as e:
        print(f"❌ Error: {e}") 