'use client';

import { useQuery } from '@tanstack/react-query';
import { EventsResponse } from '@/types/events';
import { apiFetch } from '@/utils/api';
import { useAccessToken } from '@/providers/AuthProvider';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchEvents(includePast: boolean = false, forceRefresh: boolean = false, getAccessToken?: () => Promise<string | null>): Promise<EventsResponse> {
  const url = new URL(`${API_BASE_URL}/api/events`);
  if (includePast) {
    url.searchParams.set('include_past', 'true');
  }
  if (forceRefresh) {
    url.searchParams.set('force_refresh', 'true');
  }

  return await apiFetch(url.toString(), { getAccessToken });
}

export function useEvents(includePast: boolean = false) {
  const { getAccessToken } = useAccessToken();
  const ttlSeconds = Number(process.env.NEXT_PUBLIC_EVENTS_TTL_SECONDS || process.env.NEXT_PUBLIC_EVENTS_TTL || '3600');
  
  return useQuery({
    queryKey: ['events', includePast],
    queryFn: () => fetchEvents(includePast, false, getAccessToken),
    refetchOnWindowFocus: false,
    // Honor server-side Cache-Control/Redis TTL instead of pinning 24h here
    // Keep data fresh by default; browser HTTP cache (public, max-age=...) prevents redundant network
    staleTime: 0,
    gcTime: ttlSeconds * 1000, // keep in cache up to backend TTL
  });
} 
