'use client';

import { useMemo, useEffect, useState } from 'react';
import { useEventAthletes } from './useEventAthletes';
import { useSeriesRankings, isMainSeasonRanking } from './useSeriesRankings';
import { eventMatcher } from '@/utils/eventMatching';

export interface EventHistoryResult {
  series_name: string;
  division: string;
  event_name: string;
  place: number;
  points: number;
  date: string;
  year: number;
}

export interface EventHistoryResponse {
  athlete_id: string;
  event_id: string;
  current_event: string;
  location: string;
  historical_results: EventHistoryResult[];
  total_results: number;
  message: string;
}

export function useAthleteEventHistory(athleteId: string, eventId: string) {
  const { data: eventData, isLoading: eventLoading, error: eventError } = useEventAthletes(eventId);
  const { data: seriesData, isLoading: seriesLoading, error: seriesError } = useSeriesRankings(eventId);
  const [eventHistory, setEventHistory] = useState<EventHistoryResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    async function processEventHistory() {
      // Wait for both data sources to be available
      if (!eventData || !seriesData || !athleteId || !eventId) {
        setEventHistory(null);
        return;
      }

      const currentEvent = eventData.event;
      if (!currentEvent) {
        setEventHistory(null);
        return;
      }

      setIsProcessing(true);

      try {
        // Extract location from current event name
        const locationInfo = await eventMatcher.extractLocationInfo(currentEvent.name);
        const location = locationInfo.location || 'Unknown';

        // Find all historical results for this athlete
        const historicalResults: EventHistoryResult[] = [];

        // Process all series rankings to find historical events
        for (const series of seriesData.series_rankings) {
          // Only process main series to avoid duplicates
          if (!isMainSeasonRanking(series.series_name)) {
            continue;
          }

          for (const [divisionName, rankings] of Object.entries(series.divisions)) {
            const athleteRanking = rankings.find(r => r.athlete.id === athleteId);
            
            if (athleteRanking && athleteRanking.results) {
              for (const result of athleteRanking.results) {
                const eventDiv = result.eventDivision;
                const event = eventDiv?.event;
                const eventName = event?.name || '';

                // Skip if this is the current event
                if (eventName === currentEvent.name) {
                  continue;
                }

                // Check if this event matches historically with the current event
                const matches = await eventMatcher.eventsMatchHistorically(currentEvent.name, eventName);
                if (matches) {
                  const year = eventMatcher.extractYearFromName(eventName);
                  
                  historicalResults.push({
                    series_name: series.series_name,
                    division: divisionName,
                    event_name: eventName,
                    place: result.place || 0,
                    points: result.points || 0,
                    date: event?.date || '',
                    year: year
                  });
                }
              }
            }
          }
        }

        // Sort by year (most recent first)
        historicalResults.sort((a, b) => b.year - a.year);

        // Remove duplicates (keep the best result per year)
        const uniqueResults: EventHistoryResult[] = [];
        const seenYears = new Set<number>();

        for (const result of historicalResults) {
          if (result.year && !seenYears.has(result.year)) {
            seenYears.add(result.year);
            uniqueResults.push(result);
          }
        }

        setEventHistory({
          athlete_id: athleteId,
          event_id: eventId,
          current_event: currentEvent.name,
          location: location,
          historical_results: uniqueResults,
          total_results: uniqueResults.length,
          message: `Found ${uniqueResults.length} historical results for ${location}`
        });
      } catch (error) {
        console.error('Error processing event history:', error);
        setEventHistory(null);
      } finally {
        setIsProcessing(false);
      }
    }

    processEventHistory();
  }, [eventData, seriesData, athleteId, eventId]);

  // Calculate loading and error states
  const isLoading = eventLoading || seriesLoading || isProcessing;
  const error = eventError || seriesError;

  return {
    data: eventHistory,
    isLoading,
    error
  };
}