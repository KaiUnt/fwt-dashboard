#!/usr/bin/env python3

import json
import re
from collections import defaultdict

def analyze_rankings_vs_lists(json_file_path):
    """Distinguish between main season rankings and administrative lists"""
    
    print(f"Loading data from {json_file_path}...")
    
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    main_rankings = defaultdict(list)
    admin_lists = defaultdict(list)
    
    def classify_series(name):
        """Classify whether it's a main ranking or administrative list"""
        name_lower = name.lower()
        
        # Check for administrative lists first
        if any(x in name_lower for x in ['qualifying list', 'seeding list', 'national rankings']):
            return 'admin'
        
        # Main season rankings patterns
        if re.search(r'fwt pro tour \d{4}', name_lower):
            return 'main'
        elif re.search(r'fwt challenger region \d+ [a-z-]+ \d{4}', name_lower):
            return 'main'
        elif re.search(r'fwt qualifier region \d+ [a-z-]+ \d{4}', name_lower):
            return 'main'
        elif re.search(r'ifsa (challenger|qualifier) region \d+ [a-z-]+ \d{4}', name_lower):
            return 'main'
        elif re.search(r'fwt junior region \d+ [a-z-]+ \d{4}', name_lower):
            return 'main'
        elif 'world championship' in name_lower and 'ranking' in name_lower:
            return 'main'  # World Championships are main rankings
        
        return 'admin'  # Default to admin if unclear
    
    def get_category(name):
        """Get the category of the series"""
        name_lower = name.lower()
        
        if 'pro tour' in name_lower:
            return 'Pro Tour'
        elif 'challenger' in name_lower:
            return 'Challenger'
        elif 'qualifier' in name_lower and 'junior' not in name_lower:
            return 'Qualifier'
        elif 'junior' in name_lower:
            return 'Junior'
        elif 'ifsa' in name_lower:
            return 'IFSA'
        else:
            return 'Other'
    
    def extract_year(name):
        """Extract year from series name"""
        years = re.findall(r'\b(20[0-9]{2})\b', name)
        return years[0] if years else 'Unknown'
    
    # Process all series
    if 'series_rankings' in data:
        for series in data['series_rankings']:
            series_name = series.get('series_name', '')
            if series_name:
                classification = classify_series(series_name)
                category = get_category(series_name)
                year = extract_year(series_name)
                
                entry = {
                    'name': series_name,
                    'category': category,
                    'year': year
                }
                
                if classification == 'main':
                    main_rankings[category].append(entry)
                else:
                    admin_lists[category].append(entry)
    
    return main_rankings, admin_lists

def write_detailed_analysis(main_rankings, admin_lists, output_file):
    """Write detailed analysis to file"""
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("=== MAIN SEASON RANKINGS vs ADMINISTRATIVE LISTS ===\n\n")
        
        f.write("🏆 MAIN SEASON RANKINGS (The Important Ones)\n")
        f.write("=" * 50 + "\n")
        
        total_main = sum(len(series_list) for series_list in main_rankings.values())
        f.write(f"Total main rankings: {total_main}\n\n")
        
        category_order = ['Pro Tour', 'Challenger', 'Qualifier', 'Junior', 'IFSA', 'Other']
        
        for category in category_order:
            if category in main_rankings:
                f.write(f"### {category.upper()} MAIN RANKINGS ({len(main_rankings[category])} series)\n")
                
                # Sort by year descending
                sorted_series = sorted(main_rankings[category], 
                                     key=lambda x: x['year'], 
                                     reverse=True)
                
                for series in sorted_series:
                    f.write(f"  ✅ {series['year']}: {series['name']}\n")
                f.write("\n")
        
        f.write("\n📋 ADMINISTRATIVE LISTS (Background/Support Data)\n")
        f.write("=" * 50 + "\n")
        
        total_admin = sum(len(series_list) for series_list in admin_lists.values())
        f.write(f"Total admin lists: {total_admin}\n\n")
        
        for category in category_order:
            if category in admin_lists:
                f.write(f"### {category.upper()} ADMIN LISTS ({len(admin_lists[category])} series)\n")
                
                # Sort by year descending
                sorted_series = sorted(admin_lists[category], 
                                     key=lambda x: x['year'], 
                                     reverse=True)
                
                for series in sorted_series:
                    f.write(f"  📝 {series['year']}: {series['name']}\n")
                f.write("\n")
        
        # Summary for UI implementation
        f.write("\n🎯 UI IMPLEMENTATION STRATEGY\n")
        f.write("=" * 30 + "\n\n")
        
        f.write("PRIMARY BUTTONS (Show these prominently):\n")
        for category in category_order:
            if category in main_rankings and main_rankings[category]:
                years = sorted(set(s['year'] for s in main_rankings[category]), reverse=True)
                f.write(f"  - {category}: {len(main_rankings[category])} main rankings ({', '.join(years)})\n")
        
        f.write("\nSECONDARY DATA (Collapsible/background):\n")
        for category in category_order:
            if category in admin_lists and admin_lists[category]:
                f.write(f"  - {category} Admin: {len(admin_lists[category])} lists (National Rankings, Qualifying Lists, etc.)\n")

if __name__ == "__main__":
    json_file = "event_291178_complete_data_20250711_214006.json"
    output_file = "main_rankings_analysis.txt"
    
    try:
        main_rankings, admin_lists = analyze_rankings_vs_lists(json_file)
        write_detailed_analysis(main_rankings, admin_lists, output_file)
        
        print(f"\n✅ Detailed analysis complete!")
        print(f"📄 Results written to: {output_file}")
        
        # Quick summary
        total_main = sum(len(series_list) for series_list in main_rankings.values())
        total_admin = sum(len(series_list) for series_list in admin_lists.values())
        
        print(f"\n🏆 MAIN RANKINGS: {total_main}")
        for category, series_list in main_rankings.items():
            print(f"  {category}: {len(series_list)}")
            
        print(f"\n📋 ADMIN LISTS: {total_admin}")
        for category, series_list in admin_lists.items():
            print(f"  {category}: {len(series_list)}")
            
    except Exception as e:
        print(f"❌ Error: {e}") 