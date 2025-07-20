'use client';

import { useQuery } from '@tanstack/react-query';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface EventHistoryResult {
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

async function fetchAthleteEventHistory(
  athleteId: string, 
  eventId: string
): Promise<EventHistoryResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/athlete/${athleteId}/event-history/${eventId}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch event history: ${response.status}`);
  }
  
  return response.json();
}

export function useAthleteEventHistory(athleteId: string, eventId: string) {
  return useQuery({
    queryKey: ['athlete-event-history', athleteId, eventId],
    queryFn: () => fetchAthleteEventHistory(athleteId, eventId),
    enabled: !!(athleteId && eventId),
    refetchOnWindowFocus: false,
    staleTime: 30 * 60 * 1000, // 30 Minuten - Event History ist sehr stabil
    retry: (failureCount, error: any) => {
      if (error?.message?.includes('404')) return false;
      return failureCount < 2;
    },
  });
}