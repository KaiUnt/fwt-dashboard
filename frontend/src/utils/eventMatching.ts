// Simple location-based event matching for FWT Dashboard event history

interface EventLocationInfo {
  location: string | null;
  normalizedName: string;
}

class FWTEventMatcher {
  private locations: string[] = [];
  private locationsLoaded: boolean = false;

  private async loadLocations(): Promise<void> {
    if (this.locationsLoaded) return;
    
    try {
      const response = await fetch('/all_locations.csv');
      if (!response.ok) {
        throw new Error(`CSV fetch failed: ${response.status} ${response.statusText}`);
      }
      
      const csvText = await response.text();
      this.locations = csvText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      this.locationsLoaded = true;
    } catch (error) {
      console.error('Failed to load locations CSV:', error);
      this.locations = [];
      this.locationsLoaded = true;
    }
  }

  async extractLocationInfo(eventName: string): Promise<EventLocationInfo> {
    await this.loadLocations();
    
    const normalized = this.normalizeEventName(eventName);
    const location = this.findLocationInEventName(normalized);
    
    return {
      location,
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

  private findLocationInEventName(eventName: string): string | null {
    const eventLower = eventName.toLowerCase();
    
    // Find any location from CSV that appears in the event name
    for (const location of this.locations) {
      if (eventLower.includes(location.toLowerCase())) {
        return location;
      }
    }
    
    return null;
  }

  async eventsMatchHistorically(currentEvent: string, historicalEvent: string): Promise<boolean> {
    // Quick check: if events are identical, they're not historical matches
    if (currentEvent === historicalEvent) {
      return false;
    }

    // Extract locations from both events
    const currentLocation = await this.extractLocationInfo(currentEvent);
    const historicalLocation = await this.extractLocationInfo(historicalEvent);

    // Both must have locations and they must match
    if (!currentLocation.location || !historicalLocation.location) {
      return false;
    }

    return currentLocation.location.toLowerCase() === historicalLocation.location.toLowerCase();
  }


  extractYearFromName(eventName: string): number {
    const match = eventName.match(/\b(20\d{2})\b/);
    return match ? parseInt(match[1]) : 0;
  }
}

// Export singleton instance
export const eventMatcher = new FWTEventMatcher();