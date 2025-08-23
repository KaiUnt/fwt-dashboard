'use client';

import { useQuery } from '@tanstack/react-query';
import { useOfflineStorage, useIsOffline } from './useOfflineStorage';
import { apiFetch } from '@/utils/api';
import { useAccessToken } from '@/providers/AuthProvider';

export interface SeriesEventResult {
  place?: number;
  points?: number;
  event?: {
    id?: string;
    name?: string;
    date?: string;
  };
  eventDivision?: {
    event?: {
      id?: string;
      name?: string;
      date?: string;
    };
  };
  status?: string;
}

export interface SeriesRanking {
  athlete: {
    id: string;
    name: string;
    nationality?: string;
    dob?: string;
    image?: string;
  };
  place?: number;
  points?: number;
  results: SeriesEventResult[];
}

export interface SeriesData {
  series_id: string;
  series_name: string;
  divisions: Record<string, SeriesRanking[]>;
}

export interface SeriesRankingsResponse {
  event: {
    id: string;
    name: string;
    date: string;
  };
  series_rankings: SeriesData[];
  athletes_count: number;
  series_count: number;
  message: string;
}

async function fetchSeriesRankings(eventId: string, getAccessToken: () => Promise<string | null>): Promise<SeriesRankingsResponse> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  return await apiFetch(`${API_BASE_URL}/api/series/rankings/${eventId}`, { 
    getAccessToken,
    timeoutMs: 60000 // 60 Sekunden für Series Rankings (erste Ladung dauert ~35s)
  });
}

export function useSeriesRankings(eventId: string) {
  const { getAccessToken } = useAccessToken();
  
  return useQuery({
    queryKey: ['seriesRankings', eventId],
    queryFn: () => fetchSeriesRankings(eventId, getAccessToken),
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

// Offline-first version of useSeriesRankings
export function useOfflineSeriesRankings(eventId: string) {
  const isOffline = useIsOffline();
  const { getOfflineEvent } = useOfflineStorage();
  const { getAccessToken } = useAccessToken();

  return useQuery({
    queryKey: ['seriesRankings', eventId],
    queryFn: async (): Promise<SeriesRankingsResponse> => {
      // Try online first if we have internet
      if (!isOffline) {
        try {
          return await fetchSeriesRankings(eventId, getAccessToken);
        } catch {
          // Fall through to offline fallback
        }
      }
      
      // Try offline fallback
      const offlineData = await getOfflineEvent(eventId);
      if (offlineData?.seriesRankings) {
        // Transform offline data to match expected format
        return {
          event: {
            id: offlineData.eventData.events[0].id,
            name: offlineData.eventData.events[0].name,
            date: offlineData.eventData.events[0].date
          },
          series_rankings: offlineData.seriesRankings as SeriesData[],
          athletes_count: offlineData.totalAthletes,
          series_count: offlineData.seriesRankings.length,
          message: 'Offline data'
        };
      }
      
      // No offline data available
      throw new Error('No offline series rankings available for this event');
    },
    enabled: !!eventId,
    retry: isOffline ? 0 : 2, // Don't retry in offline mode
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Multi-event offline-first series rankings
export function useOfflineMultiEventSeriesRankings(eventId1: string, eventId2: string) {
  const isOffline = useIsOffline();
  const { getOfflineEvent } = useOfflineStorage();
  const { getAccessToken } = useAccessToken();

  return useQuery({
    queryKey: ['multi-event-series-rankings', eventId1, eventId2],
    queryFn: async () => {
      // Try online first if we have internet
      if (!isOffline) {
        try {
          const [rankings1, rankings2] = await Promise.all([
            fetchSeriesRankings(eventId1, getAccessToken),
            fetchSeriesRankings(eventId2, getAccessToken)
          ]);
          
          return {
            event1: rankings1,
            event2: rankings2,
            combined: {
              series_rankings: [...rankings1.series_rankings, ...rankings2.series_rankings],
              total_athletes: rankings1.athletes_count + rankings2.athletes_count,
              total_series: rankings1.series_count + rankings2.series_count
            }
          };
        } catch {
          // Fall through to offline fallback
        }
      }
      
      // Try offline fallback
      const multiEventId = `multi_${eventId1}_${eventId2}`;
      const offlineData = await getOfflineEvent(multiEventId);
      
      if (offlineData?.seriesRankings) {
        const event1 = offlineData.eventData.events.find(e => e.id === eventId1);
        const event2 = offlineData.eventData.events.find(e => e.id === eventId2);
        
        if (event1 && event2) {
          return {
            event1: {
              event: {
                id: event1.id,
                name: event1.name,
                date: event1.date
              },
              series_rankings: offlineData.seriesRankings as SeriesData[],
              athletes_count: offlineData.totalAthletes,
              series_count: offlineData.seriesRankings.length,
              message: 'Offline data'
            },
            event2: {
              event: {
                id: event2.id,
                name: event2.name,
                date: event2.date
              },
              series_rankings: offlineData.seriesRankings as SeriesData[],
              athletes_count: offlineData.totalAthletes,
              series_count: offlineData.seriesRankings.length,
              message: 'Offline data'
            },
            combined: {
              series_rankings: offlineData.seriesRankings as SeriesData[],
              total_athletes: offlineData.totalAthletes,
              total_series: offlineData.seriesRankings.length
            }
          };
        }
      }
      
      // No offline data available
      throw new Error('No offline series rankings available for these events');
    },
    enabled: !!eventId1 && !!eventId2,
    retry: isOffline ? 0 : 2, // Don't retry in offline mode
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Helper function to find athlete ranking in series data
export function findAthleteRanking(
  seriesData: SeriesData[], 
  athleteId: string
): { series: SeriesData; ranking: SeriesRanking; division: string } | null {
  
  for (const series of seriesData) {
    for (const [divisionName, rankings] of Object.entries(series.divisions)) {
      const ranking = rankings.find(r => r.athlete.id === athleteId);
      if (ranking) {
        return {
          series,
          ranking,
          division: divisionName
        };
      }
    }
  }
  
  return null;
}

// Helper function to get current series ranking for athlete
export function getCurrentSeriesRanking(
  seriesData: SeriesData[], 
  athleteId: string
): {
  currentRanking?: number;
  currentPoints?: number;
  seriesName?: string;
  division?: string;
  isNewAthlete?: boolean;
} {
  
  // Find most recent series (usually the current year)
  const currentYearSeries = seriesData.find(s => 
    s.series_name.includes('2024') || s.series_name.includes('2025') || s.series_name.includes('2026')
  );
  
  if (currentYearSeries) {
    const athleteData = findAthleteRanking([currentYearSeries], athleteId);
    if (athleteData) {
      // Check if it's a "New Athlete" entry
      const isNewAthlete = athleteData.series.series_name === 'New Athlete' || 
                          athleteData.division === 'New Athletes' ||
                          (!athleteData.ranking.place && !athleteData.ranking.points);
      
      return {
        currentRanking: athleteData.ranking.place,
        currentPoints: athleteData.ranking.points,
        seriesName: athleteData.series.series_name,
        division: athleteData.division,
        isNewAthlete
      };
    }
  }
  
  // Fallback: look in any series
  const athleteData = findAthleteRanking(seriesData, athleteId);
  if (athleteData) {
    const isNewAthlete = athleteData.series.series_name === 'New Athlete' || 
                        athleteData.division === 'New Athletes' ||
                        (!athleteData.ranking.place && !athleteData.ranking.points);
    
    return {
      currentRanking: athleteData.ranking.place,
      currentPoints: athleteData.ranking.points,
      seriesName: athleteData.series.series_name,
      division: athleteData.division,
      isNewAthlete
    };
  }
  
  return {};
} 

// Enhanced interfaces for multi-series navigation
export interface AthleteSeriesOverview {
  athleteId: string;
  athleteName: string;
  currentSeries: SeriesRankingDetail[];
  historicalSeries: SeriesRankingDetail[];
  categories: SeriesCategory[];
  years: number[];
  totalResults: number;
}

export interface SeriesRankingDetail {
  series: SeriesData;
  ranking: SeriesRanking;
  division: string;
  year: number;
  category: 'pro' | 'challenger' | 'qualifier' | 'junior' | 'other';
  priority: number; // For sorting (higher = more important)
}

export interface SeriesCategory {
  name: string;
  type: 'pro' | 'challenger' | 'qualifier' | 'junior' | 'other';
  count: number;
  latestYear: number;
  bestRanking?: number;
  isMainSeries?: boolean; // Distinguish main season rankings from admin lists
}

// New interfaces for event-based deduplication
export interface EventResult {
  eventKey: string; // Unique identifier for the event
  eventName: string;
  location?: string;
  year: number;
  seriesInstances: SeriesInstance[];
  primaryCategory: 'pro' | 'challenger' | 'qualifier' | 'junior' | 'other';
  date?: string;
}

export interface SeriesInstance {
  series: SeriesData;
  ranking: SeriesRanking;
  division: string;
  category: 'pro' | 'challenger' | 'qualifier' | 'junior' | 'other';
  priority: number;
}

export interface EventBasedOverview {
  athleteId: string;
  athleteName: string;
  events: EventResult[];
  availableCategories: SeriesCategory[];
  availableYears: number[];
  totalEvents: number;
}

// New interfaces for series detail view
export interface SeriesDetailView {
  seriesInfo: {
    name: string;
    category: 'pro' | 'challenger' | 'qualifier' | 'junior' | 'other';
    year: number;
    isMainSeries: boolean;
  };
  overallRanking: {
    place?: number;
    points?: number;
    division: string;
  };
  eventResults: EventResultDetail[];
}

export interface EventResultDetail {
  eventName: string;
  eventDate?: string;
  location?: string;
  place?: number;
  points?: number;
  status?: string; // DNS, DNF, DQ, etc.
  rawResult: SeriesEventResult & {
    seriesInfo?: {
      seriesName: string;
      seriesCategory: string;
      division: string;
      isMainSeries: boolean;
      priority: number;
    };
    allSeriesInfo?: Array<{
      seriesName: string;
      seriesCategory: string;
      division: string;
      isMainSeries: boolean;
      priority: number;
    }>;
  };
}

// Helper function to categorize series
export function categorizeSeriesType(seriesName: string): 'pro' | 'challenger' | 'qualifier' | 'junior' | 'other' {
  const name = seriesName.toLowerCase();
  
  // FWT Pro Tour / Pro Level Events
  if (name.includes('fwt pro') || 
      name.includes('pro tour') || 
      name.includes('fwt tour') || 
      name.includes('world tour') ||
      name.includes('qualified riders') ||
      name.includes('bonus points')) {
    return 'pro';
  }
  
  // FWT Challenger Events
  if (name.includes('challenger') || 
      name.includes('fwt challenger')) {
    return 'challenger';
  }
  
  // Qualifier Events (including star ratings and FWQ)
  if (name.includes('qualifier') || 
      name.includes('fwq') ||
      name.includes('ifsa qualifier') ||
      name.match(/\b[1-4]\*/) || // Matches 1*, 2*, 3*, 4*
      name.includes('final')) { // FWQ Final
    return 'qualifier';
  }
  
  // Junior / Youth Events
  if (name.includes('junior') || 
      name.includes('youth') || 
      name.includes('u18') || 
      name.includes('u21') ||
      name.includes('kids')) {
    return 'junior';
  }
  
  // Regional/National/Other Events
  return 'other';
}

// Helper function to determine if series is a main season ranking or admin list
export function isMainSeasonRanking(seriesName: string): boolean {
  const name = seriesName.toLowerCase();
  
  // Administrative lists patterns (these are NOT main rankings)
  if (name.includes('qualifying list') || 
      name.includes('seeding list') || 
      name.includes('national rankings')) {
    return false;
  }
  
  // Main season rankings patterns
  if (name.match(/fwt pro tour.*\d{4}/)) {
    return true;
  }
  if (name.match(/fwt challenger region \d+.*\d{4}/)) {
    return true;
  }
  if (name.match(/fwt qualifier region \d+.*\d{4}/)) {
    return true;
  }
  if (name.match(/ifsa (challenger|qualifier) region \d+.*\d{4}/)) {
    return true;
  }
  if (name.match(/fwt junior region \d+.*\d{4}/)) {
    return true;
  }
  if (name.includes('world championship') && name.includes('ranking')) {
    return true; // World Championships are main rankings
  }
  
  // Default to admin list if pattern doesn't match
  return false;
}

// Helper function to extract year from series name
export function extractSeriesYear(seriesName: string): number {
  const yearMatch = seriesName.match(/\b(20[0-9]{2})\b/);
  return yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
}

// Helper function to calculate series priority
export function calculateSeriesPriority(seriesDetail: SeriesRankingDetail): number {
  let priority = 0;
  
  // MAIN SERIES get highest priority boost first
  if (seriesDetail.series && isMainSeasonRanking(seriesDetail.series.series_name)) {
    priority += 1000; // Massive boost for main series
  }
  
  // Year priority (current year = +100, previous years decrease)
  const currentYear = new Date().getFullYear();
  const yearDiff = currentYear - seriesDetail.year;
  priority += Math.max(0, 100 - (yearDiff * 20));
  
  // Category priority
  switch (seriesDetail.category) {
    case 'pro': priority += 50; break;
    case 'challenger': priority += 30; break;
    case 'qualifier': priority += 20; break;
    case 'junior': priority += 10; break;
    default: priority += 5; break;
  }
  
  // Ranking priority (better ranking = higher priority)
  if (seriesDetail.ranking.place) {
    priority += Math.max(0, 50 - seriesDetail.ranking.place);
  }
  
  // Points priority
  if (seriesDetail.ranking.points) {
    priority += Math.min(20, Math.floor(seriesDetail.ranking.points / 1000));
  }
  
  return priority;
}

// Main function to get comprehensive athlete series overview
export function getAthleteSeriesOverview(
  seriesData: SeriesData[], 
  athleteId: string
): AthleteSeriesOverview | null {
  
  const allSeriesDetails: SeriesRankingDetail[] = [];
  
  // Find athlete in all series
  for (const series of seriesData) {
    for (const [divisionName, rankings] of Object.entries(series.divisions)) {
      const ranking = rankings.find(r => r.athlete.id === athleteId);
      if (ranking) {
        const year = extractSeriesYear(series.series_name);
        const category = categorizeSeriesType(series.series_name);
        
        const detail: SeriesRankingDetail = {
          series,
          ranking,
          division: divisionName,
          year,
          category,
          priority: 0 // Will be calculated below
        };
        
        detail.priority = calculateSeriesPriority(detail);
        allSeriesDetails.push(detail);
      }
    }
  }
  
  if (allSeriesDetails.length === 0) {
    return null;
  }
  
  // Sort by priority (highest first)
  allSeriesDetails.sort((a, b) => b.priority - a.priority);
  
  // Split into current and historical
  const currentYear = new Date().getFullYear();
  const currentSeries = allSeriesDetails.filter(s => s.year >= currentYear - 1); // Current and previous year
  const historicalSeries = allSeriesDetails.filter(s => s.year < currentYear - 1);
  
  // Create categories summary
  const categoryMap = new Map<string, SeriesCategory>();
  
  for (const detail of allSeriesDetails) {
    const key = detail.category;
    const existing = categoryMap.get(key);
    
    if (existing) {
      existing.count++;
      existing.latestYear = Math.max(existing.latestYear, detail.year);
      if (detail.ranking.place && (!existing.bestRanking || detail.ranking.place < existing.bestRanking)) {
        existing.bestRanking = detail.ranking.place;
      }
    } else {
      categoryMap.set(key, {
        name: key.charAt(0).toUpperCase() + key.slice(1),
        type: detail.category,
        count: 1,
        latestYear: detail.year,
        bestRanking: detail.ranking.place || undefined
      });
    }
  }
  
  const categories = Array.from(categoryMap.values()).sort((a, b) => {
    const priority = { pro: 4, challenger: 3, qualifier: 2, junior: 1, other: 0 };
    return priority[b.type] - priority[a.type];
  });
  
  // Get unique years
  const years = [...new Set(allSeriesDetails.map(s => s.year))].sort((a, b) => b - a);
  
  // Count total results
  const totalResults = allSeriesDetails.reduce((sum, detail) => {
    return sum + (detail.ranking.results?.length || 0);
  }, 0);
  
  const athleteName = allSeriesDetails[0]?.ranking.athlete.name || 'Unknown Athlete';
  
  return {
    athleteId,
    athleteName,
    currentSeries,
    historicalSeries,
    categories,
    years,
    totalResults
  };
}

// Function to filter series overview by category and year
export function filterSeriesOverview(
  overview: AthleteSeriesOverview,
  category?: 'pro' | 'challenger' | 'qualifier' | 'junior' | 'other' | 'all',
  year?: number | 'all'
): SeriesRankingDetail[] {
  
  let filtered = [...overview.currentSeries, ...overview.historicalSeries];
  
  // Filter by category
  if (category && category !== 'all') {
    filtered = filtered.filter(s => s.category === category);
  }
  
  // Filter by year
  if (year && year !== 'all') {
    filtered = filtered.filter(s => s.year === year);
  }
  
  // Return sorted by priority
  return filtered.sort((a, b) => b.priority - a.priority);
}

// Helper function to generate event key for deduplication
export function generateEventKey(seriesName: string, division: string): string {
  // Extract location and event type from series name, but preserve year
  const cleanName = seriesName.toLowerCase()
    .replace(/\b(challenger|qualifier|fwt|fwq|pro|tour|final)\b/g, '') // Remove series types
    .replace(/\b[1-4]\*/g, '') // Remove star ratings
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
  
  // Combine with division for uniqueness
  return `${cleanName}_${division.toLowerCase()}`;
}

// Helper function to extract location from series name
export function extractLocation(seriesName: string): string | undefined {
  // Common patterns for locations
  const locationPatterns = [
    /\b(verbier|nendaz|chamonix|avoriaz|les arcs|la rosière|bruson|montafon|obertauern|kitzsteinhorn|gurgl|bansko|jasna|kappl|gastein)\b/i,
    /\b(hakuba|japan)\b/i,
    /\b(silvretta|monterosa|open faces)\b/i
  ];
  
  for (const pattern of locationPatterns) {
    const match = seriesName.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return undefined;
}

// Main function to get event-based overview with deduplication
export function getEventBasedOverview(
  seriesData: SeriesData[], 
  athleteId: string
): EventBasedOverview | null {
  
  const allSeriesDetails: SeriesRankingDetail[] = [];
  
  // First, get all series details (same as before)
  for (const series of seriesData) {
    for (const [divisionName, rankings] of Object.entries(series.divisions)) {
      const ranking = rankings.find(r => r.athlete.id === athleteId);
      if (ranking) {
        const year = extractSeriesYear(series.series_name);
        const category = categorizeSeriesType(series.series_name);
        
        const detail: SeriesRankingDetail = {
          series,
          ranking,
          division: divisionName,
          year,
          category,
          priority: 0
        };
        
        detail.priority = calculateSeriesPriority(detail);
        allSeriesDetails.push(detail);
      }
    }
  }
  
  if (allSeriesDetails.length === 0) {
    return null;
  }
  
  // Group by event key for deduplication
  const eventMap = new Map<string, EventResult>();
  
  for (const detail of allSeriesDetails) {
    const eventKey = generateEventKey(detail.series.series_name, detail.division);
    const location = extractLocation(detail.series.series_name);
    
    const existing = eventMap.get(eventKey);
    
    if (existing) {
      // Add this series instance to existing event
      existing.seriesInstances.push({
        series: detail.series,
        ranking: detail.ranking,
        division: detail.division,
        category: detail.category,
        priority: detail.priority
      });
      
      // Update primary category if this instance has higher priority
      const primaryInstance = existing.seriesInstances.reduce((prev, curr) => 
        curr.priority > prev.priority ? curr : prev
      );
      existing.primaryCategory = primaryInstance.category;
      
    } else {
      // Create new event entry
      eventMap.set(eventKey, {
        eventKey,
        eventName: detail.series.series_name,
        location,
        year: detail.year,
        seriesInstances: [{
          series: detail.series,
          ranking: detail.ranking,
          division: detail.division,
          category: detail.category,
          priority: detail.priority
        }],
        primaryCategory: detail.category,
        date: undefined // Could be extracted from series name if needed
      });
    }
  }
  
  // Convert to array and sort by highest priority instance
  const events = Array.from(eventMap.values()).sort((a, b) => {
    const aMaxPriority = Math.max(...a.seriesInstances.map(si => si.priority));
    const bMaxPriority = Math.max(...b.seriesInstances.map(si => si.priority));
    return bMaxPriority - aMaxPriority;
  });
  
  // Create categories summary and collect all years (from events AND series)
  const categoryMap = new Map<string, SeriesCategory>();
  const yearSet = new Set<number>();
  
  // Add years from events
  for (const event of events) {
    yearSet.add(event.year);
    
    for (const instance of event.seriesInstances) {
      const key = instance.category;
      const isMain = isMainSeasonRanking(instance.series.series_name);
      const existing = categoryMap.get(key);
      
      if (existing) {
        existing.count++;
        existing.latestYear = Math.max(existing.latestYear, event.year);
        if (instance.ranking.place && (!existing.bestRanking || instance.ranking.place < existing.bestRanking)) {
          existing.bestRanking = instance.ranking.place;
        }
        // Update isMainSeries if any instance is a main series
        if (isMain) {
          existing.isMainSeries = true;
        }
      } else {
        categoryMap.set(key, {
          name: key.charAt(0).toUpperCase() + key.slice(1),
          type: instance.category,
          count: 1,
          latestYear: event.year,
          bestRanking: instance.ranking.place || undefined,
          isMainSeries: isMain
        });
      }
    }
  }
  
  // Also add years from all series (including those without events)
  for (const detail of allSeriesDetails) {
    yearSet.add(detail.year);
  }
  
  const availableCategories = Array.from(categoryMap.values()).sort((a, b) => {
    const priority = { pro: 4, challenger: 3, qualifier: 2, junior: 1, other: 0 };
    return priority[b.type] - priority[a.type];
  });
  
  const availableYears = Array.from(yearSet).sort((a, b) => b - a);
  const athleteName = allSeriesDetails[0]?.ranking.athlete.name || 'Unknown Athlete';
  
  return {
    athleteId,
    athleteName,
    events,
    availableCategories,
    availableYears,
    totalEvents: events.length
  };
}

// Function to filter event-based overview
export function filterEventBasedOverview(
  overview: EventBasedOverview,
  category?: 'pro' | 'challenger' | 'qualifier' | 'junior' | 'other' | 'all',
  year?: number | 'all'
): EventResult[] {
  
  let filtered = [...overview.events];
  
  // Filter by category
  if (category && category !== 'all') {
    filtered = filtered.filter(event => 
      event.primaryCategory === category || 
      event.seriesInstances.some(si => si.category === category)
    );
  }
  
  // Filter by year
  if (year && year !== 'all') {
    filtered = filtered.filter(event => event.year === year);
  }
  
  // Sort chronologically for ALL+ALL view, otherwise by priority
  if (category === 'all' && year === 'all') {
    // Chronological order: newest first, then by highest priority within year
    filtered.sort((a, b) => {
      // First sort by year (newest first)
      if (a.year !== b.year) {
        return b.year - a.year;
      }
      
      // Within same year, sort by highest priority
      const aMaxPriority = Math.max(...a.seriesInstances.map(si => si.priority));
      const bMaxPriority = Math.max(...b.seriesInstances.map(si => si.priority));
      return bMaxPriority - aMaxPriority;
    });
  } else {
    // Default: sort by highest priority
    filtered.sort((a, b) => {
      const aMaxPriority = Math.max(...a.seriesInstances.map(si => si.priority));
      const bMaxPriority = Math.max(...b.seriesInstances.map(si => si.priority));
      return bMaxPriority - aMaxPriority;
    });
  }
  
  return filtered;
}

// Function to get series detail view for a specific series and athlete
export function getSeriesDetailView(
  seriesData: SeriesData[],
  athleteId: string,
  targetSeriesName: string
): SeriesDetailView | null {
  
  // Find the target series
  const targetSeries = seriesData.find(s => s.series_name === targetSeriesName);
  if (!targetSeries) {
    return null;
  }
  
  // Find athlete in this series
  let athleteRanking: SeriesRanking | null = null;
  let division = '';
  
  for (const [divisionName, rankings] of Object.entries(targetSeries.divisions)) {
    const ranking = rankings.find(r => r.athlete.id === athleteId);
    if (ranking) {
      athleteRanking = ranking;
      division = divisionName;
      break;
    }
  }
  
  if (!athleteRanking) {
    return null;
  }
  
  // Extract series info
  const year = extractSeriesYear(targetSeries.series_name);
  const category = categorizeSeriesType(targetSeries.series_name);
  const isMainSeries = isMainSeasonRanking(targetSeries.series_name);
  
  // Process event results
  const eventResults: EventResultDetail[] = [];
  
  if (athleteRanking.results) {
    for (const result of athleteRanking.results) {
      const eventDiv = result.eventDivision;
      const event = eventDiv?.event;
      
      eventResults.push({
        eventName: event?.name || 'Unknown Event',
        eventDate: event?.date,
        location: extractLocation(event?.name || ''),
        place: result.place,
        points: result.points,
        status: result.status,
        rawResult: result
      });
    }
  }
  
  // Sort events by date (newest first) or by points (highest first) if no date
  eventResults.sort((a, b) => {
    if (a.eventDate && b.eventDate) {
      return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
    }
    if (a.points && b.points) {
      return b.points - a.points;
    }
    return 0;
  });
  
  return {
    seriesInfo: {
      name: targetSeries.series_name,
      category,
      year,
      isMainSeries
    },
    overallRanking: {
      place: athleteRanking.place,
      points: athleteRanking.points,
      division
    },
    eventResults
  };
}

// Function to get all available series for an athlete (for dropdown)
export function getAvailableSeriesForAthlete(
  seriesData: SeriesData[],
  athleteId: string
): { mainSeries: SeriesData[]; adminSeries: SeriesData[] } {
  
  const mainSeries: SeriesData[] = [];
  const adminSeries: SeriesData[] = [];
  
  for (const series of seriesData) {
    // Check if athlete is in this series
    let hasAthlete = false;
    for (const rankings of Object.values(series.divisions)) {
      if (rankings.some(r => r.athlete.id === athleteId)) {
        hasAthlete = true;
        break;
      }
    }
    
    if (hasAthlete) {
      if (isMainSeasonRanking(series.series_name)) {
        mainSeries.push(series);
      } else {
        adminSeries.push(series);
      }
    }
  }
  
  // Sort by year (newest first)
  const sortBySeries = (a: SeriesData, b: SeriesData) => {
    const yearA = extractSeriesYear(a.series_name);
    const yearB = extractSeriesYear(b.series_name);
    return yearB - yearA;
  };
  
  mainSeries.sort(sortBySeries);
  adminSeries.sort(sortBySeries);
  
  return { mainSeries, adminSeries };
}

// Function to get all events chronologically for complete career overview
export function getAllEventsChronologically(
  seriesData: SeriesData[],
  athleteId: string
): EventResultDetail[] {
  
  // Use a Map to deduplicate events by event key
  const eventMap = new Map<string, EventResultDetail>();
  
  // Go through all series and collect all event results (only MAIN series)
  for (const series of seriesData) {
    // Only process MAIN series to avoid duplicates and admin lists
    if (!isMainSeasonRanking(series.series_name)) {
      continue;
    }
    for (const [divisionName, rankings] of Object.entries(series.divisions)) {
      const ranking = rankings.find(r => r.athlete.id === athleteId);
      if (ranking && ranking.results) {
        
        for (const result of ranking.results) {
          const eventDiv = result.eventDivision;
          const event = eventDiv?.event;
          const eventName = event?.name || 'Unknown Event';
          
          // Generate event key for deduplication
          const eventKey = generateEventKey(eventName, divisionName);
          
          // Create series info
          const seriesInfo = {
            seriesName: series.series_name,
            seriesCategory: categorizeSeriesType(series.series_name),
            division: divisionName,
            isMainSeries: isMainSeasonRanking(series.series_name),
            priority: calculateSeriesPriority({
              series,
              ranking,
              division: divisionName,
              year: extractSeriesYear(series.series_name),
              category: categorizeSeriesType(series.series_name),
              priority: 0
            })
          };
          
          const eventResult: EventResultDetail = {
            eventName,
            eventDate: event?.date,
            location: extractLocation(eventName),
            place: result.place,
            points: result.points,
            status: result.status,
            rawResult: {
              ...result,
              seriesInfo,
              allSeriesInfo: [] // Will be populated below
            }
          };
          
          const existing = eventMap.get(eventKey);
          
          if (existing) {
            // Event already exists - merge series information
            const existingSeries = existing.rawResult.seriesInfo;
            const currentSeries = seriesInfo;
            
            // Add both series to allSeriesInfo array
            if (!existing.rawResult.allSeriesInfo) {
              existing.rawResult.allSeriesInfo = existingSeries ? [existingSeries] : [];
            }
            existing.rawResult.allSeriesInfo.push(currentSeries);
            
            // Keep the result from the series with higher priority
            if (existingSeries && currentSeries.priority > existingSeries.priority) {
              existing.place = eventResult.place;
              existing.points = eventResult.points;
              existing.status = eventResult.status;
              existing.rawResult.seriesInfo = currentSeries;
            } else if (!existingSeries) {
              // If no existing series info, use current
              existing.rawResult.seriesInfo = currentSeries;
            }
          } else {
            // New event
            eventResult.rawResult.allSeriesInfo = [seriesInfo];
            eventMap.set(eventKey, eventResult);
          }
        }
      }
    }
  }
  
  // Convert to array and sort chronologically (newest first)
  const allEvents = Array.from(eventMap.values());
  
  allEvents.sort((a, b) => {
    if (a.eventDate && b.eventDate) {
      return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
    }
    // If no dates available, sort by points (highest first)
    if (a.points && b.points) {
      return b.points - a.points;
    }
    return 0;
  });
  
  return allEvents;
} 