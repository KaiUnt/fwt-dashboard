// Event matching utilities ported from backend and improved_event_matching.py
// Intelligent event matching for FWT Dashboard event history

interface EventLocationInfo {
  location: string | null;
  confidence: number;
  matchType: 'exact_location' | 'pattern_extracted' | 'no_location' | 'unknown';
  normalizedName: string;
}

// Removed unused interface - defined in useAthleteEventHistory.ts instead

class FWTEventMatcher {
  private locationMappings: Record<string, string> = {
    "chamonix": "Chamonix",
    "verbier": "Verbier", 
    "fieberbrunn": "Fieberbrunn",
    "kicking horse": "Kicking Horse",
    "revelstoke": "Revelstoke",
    "xtreme": "Verbier",  // Special case: Xtreme = Verbier
    "ordino": "Ordino",
    "baqueira": "Baqueira",
    "obertauern": "Obertauern",
    "la clusaz": "La Clusaz",
    "andorra": "Ordino"
  };

  private nonLocationPatterns: string[] = [
    "freeride'?her",
    "world championship",
    "qualifying list",
    "national rankings",
    "challenger by \\w+",
    "region \\d+ [a-z-]+"
  ];

  private knownSponsors: string[] = [
    'dynastar', 'salomon', 'atomic', 'rossignol', 'volkl', 'k2', 
    'peak', 'performance', 'orage', 'north', 'face'
  ];

  extractLocationInfo(eventName: string): EventLocationInfo {
    const normalized = this.normalizeEventName(eventName);
    
    // Check for non-location events first
    if (this.isNonLocationEvent(normalized)) {
      return {
        location: null,
        confidence: 0.0,
        matchType: 'no_location',
        normalizedName: normalized
      };
    }

    // Try exact location matching
    const knownLocation = this.extractKnownLocation(normalized);
    if (knownLocation) {
      return {
        location: knownLocation,
        confidence: 1.0,
        matchType: 'exact_location',
        normalizedName: normalized
      };
    }

    // Try pattern-based extraction
    const patternLocation = this.extractPatternLocation(normalized);
    if (patternLocation) {
      return {
        location: patternLocation,
        confidence: 0.7,
        matchType: 'pattern_extracted',
        normalizedName: normalized
      };
    }

    // Fallback
    return {
      location: null,
      confidence: 0.0,
      matchType: 'unknown',
      normalizedName: normalized
    };
  }

  private normalizeEventName(eventName: string): string {
    let normalized = eventName.trim();
    
    // Remove organization prefixes
    normalized = normalized.replace(/^(FWT\s*-?\s*)/i, '');
    normalized = normalized.replace(/^(IFSA\s*-?\s*)/i, '');
    
    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  private isNonLocationEvent(normalizedName: string): boolean {
    const nameLower = normalizedName.toLowerCase();
    
    for (const pattern of this.nonLocationPatterns) {
      if (new RegExp(pattern, 'i').test(nameLower)) {
        return true;
      }
    }
    
    return false;
  }

  private extractKnownLocation(normalizedName: string): string | null {
    const nameLower = normalizedName.toLowerCase();
    
    for (const [locationKey, locationName] of Object.entries(this.locationMappings)) {
      if (nameLower.includes(locationKey)) {
        return locationName;
      }
    }
    
    return null;
  }

  private extractPatternLocation(normalizedName: string): string | null {
    // Pattern 1: Year followed by location
    let match = normalizedName.match(/^\d{4}\s+([A-Za-z][A-Za-z\s]+?)(?:\s+(?:Challenger|Qualifier|Open|Freeride|by))/i);
    if (match) {
      const location = match[1].trim();
      const excludedWords = ['open', 'freeride', 'week', 'by', 'faces', 'the', 'and', 'of', 'in'];
      if (!excludedWords.includes(location.toLowerCase()) && location.length > 2) {
        return location;
      }
    }

    // Pattern 2: Location followed by year
    match = normalizedName.match(/^([A-Za-z][A-Za-z\s]+?)\s+\d{4}/);
    if (match) {
      return match[1].trim();
    }

    // Pattern 3: Location with context words
    match = normalizedName.match(/(?:Freeride\s+Week\s+(?:at\s+)?)?([A-Za-z][A-Za-z\s]+?)(?:\s+(?:Challenger|Qualifier|by|Freeride))/i);
    if (match) {
      const location = match[1].trim();
      if (location.length > 2) {
        return location;
      }
    }

    // Fallback: try to find any reasonable location-like word
    const words = normalizedName.split(' ');
    for (const word of words) {
      if (
        word.length > 3 && 
        /^[A-Za-z]+$/.test(word) && 
        !['open', 'freeride', 'week', 'faces', 'challenger', 'qualifier'].includes(word.toLowerCase()) &&
        !/^\d+\*?$/.test(word)
      ) {
        return word;
      }
    }

    return null;
  }

  normalizeEventForMatching(eventName: string): string {
    let normalized = eventName.trim();

    // Remove year
    normalized = normalized.replace(/\b20\d{2}\b/g, '');

    // Remove organization prefixes
    normalized = normalized.replace(/^(FWT\s*-?\s*|IFSA\s*-?\s*)/i, '');

    // Remove sponsor parts
    normalized = normalized.replace(/\s+by\s+[A-Za-z][A-Za-z\s&]+?(?=\s+(?:Qualifier|Challenger|Open|Championship|$))/i, '');

    // Remove sponsors at beginning
    const words = normalized.split(' ');
    if (words.length > 2) {
      const firstWord = words[0].toLowerCase();
      if (this.knownSponsors.some(sponsor => firstWord.includes(sponsor))) {
        normalized = words.slice(1).join(' ');
      }
    }

    // Clean up and normalize
    normalized = normalized.replace(/\s+/g, ' ').trim();
    return normalized.toLowerCase();
  }


  eventsMatchHistorically(currentEvent: string, historicalEvent: string): boolean {
    // Quick check: if events are identical, they're not historical matches
    if (currentEvent === historicalEvent) {
      return false;
    }

    // Normalize both event names
    const currentNorm = this.normalizeEventForMatching(currentEvent);
    const historicalNorm = this.normalizeEventForMatching(historicalEvent);

    // Exact match after normalization
    if (currentNorm === historicalNorm) {
      return true;
    }

    // Flexible matching for slight variations
    const similarity = this.calculateEventCoreSimilarity(currentNorm, historicalNorm);
    return similarity > 0.85;
  }

  private calculateEventCoreSimilarity(event1Norm: string, event2Norm: string): number {
    const extractCoreComponents = (name: string) => {
      return {
        words: new Set(name.split(' ').filter(word => word.length > 2)),
        starRating: name.match(/\d+\*/g) || [],
        eventType: [],
        hasQualifier: name.includes('qualifier'),
        hasChallenger: name.includes('challenger'),
        hasOpen: name.includes('open'),
        hasFaces: name.includes('faces'),
        hasWeek: name.includes('week'),
        hasFreeride: name.includes('freeride')
      };
    };

    const comp1 = extractCoreComponents(event1Norm);
    const comp2 = extractCoreComponents(event2Norm);

    let score = 0.0;
    let maxScore = 0.0;

    // Word overlap (most important)
    if (comp1.words.size > 0 || comp2.words.size > 0) {
      const intersection = new Set([...comp1.words].filter(x => comp2.words.has(x)));
      const union = new Set([...comp1.words, ...comp2.words]);
      if (union.size > 0) {
        const wordScore = intersection.size / union.size;
        score += wordScore * 0.7;
      }
      maxScore += 0.7;
    }

    // Star rating match
    if (comp1.starRating.length > 0 || comp2.starRating.length > 0) {
      const starMatch = JSON.stringify(comp1.starRating) === JSON.stringify(comp2.starRating);
      if (starMatch) {
        score += 0.1;
      }
      maxScore += 0.1;
    }

    // Boolean features
    const booleanFeatures = ['hasQualifier', 'hasChallenger', 'hasOpen', 'hasFaces', 'hasWeek', 'hasFreeride'] as const;
    let matchingBooleans = 0;
    
    for (const feature of booleanFeatures) {
      if (comp1[feature] === comp2[feature]) {
        matchingBooleans++;
      }
    }
    
    score += (matchingBooleans / booleanFeatures.length) * 0.2;
    maxScore += 0.2;

    return maxScore > 0 ? score / maxScore : 0.0;
  }

  extractYearFromName(eventName: string): number {
    const match = eventName.match(/\b(20\d{2})\b/);
    return match ? parseInt(match[1]) : 0;
  }

  isMainSeries(seriesName: string): boolean {
    const nameLower = seriesName.toLowerCase();
    const hasMainKeywords = ['pro tour', 'world tour', 'freeride world tour'].some(keyword => 
      nameLower.includes(keyword)
    );
    const hasExcludeKeywords = ['qualifier', 'challenger', 'junior'].some(keyword => 
      nameLower.includes(keyword)
    );
    
    return hasMainKeywords && !hasExcludeKeywords;
  }
}

// Export singleton instance
export const eventMatcher = new FWTEventMatcher();