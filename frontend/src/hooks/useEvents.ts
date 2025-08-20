'use client';

import { useQuery } from '@tanstack/react-query';
import { EventsResponse } from '@/types/events';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchEvents(includePast: boolean = false, forceRefresh: boolean = false): Promise<EventsResponse> {
  const url = new URL(`${API_BASE_URL}/api/events`);
  if (includePast) {
    url.searchParams.set('include_past', 'true');
  }
  if (forceRefresh) {
    url.searchParams.set('force_refresh', 'true');
  }

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status}`);
  }
  
  return response.json();
}

export function useEvents(includePast: boolean = false) {
  return useQuery({
    queryKey: ['events', includePast],
    queryFn: () => fetchEvents(includePast),
    refetchOnWindowFocus: false,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - Events change rarely
  });
} 