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

  const DEBUG_WINDOW = typeof window !== 'undefined' && (window as unknown as { __FWT_DEBUG_LOAD__?: boolean }).__FWT_DEBUG_LOAD__ === true;
  if (DEBUG_WINDOW) {
    console.time(`[events] fetch includePast=${includePast} forceRefresh=${forceRefresh}`)
  }
  const data = await apiFetch<EventsResponse>(url.toString(), { getAccessToken });
  if (DEBUG_WINDOW) {
    console.timeEnd(`[events] fetch includePast=${includePast} forceRefresh=${forceRefresh}`)
  }
  return data;
}

export function useEvents(includePast: boolean = false) {
  const { getAccessToken } = useAccessToken();
  const ttlSeconds = Number(process.env.NEXT_PUBLIC_EVENTS_TTL_SECONDS || process.env.NEXT_PUBLIC_EVENTS_TTL || '3600');
  
  return useQuery<EventsResponse>({
    queryKey: ['events', includePast],
    queryFn: () => fetchEvents(includePast, false, getAccessToken),
    refetchOnWindowFocus: false,
    // Honor server-side Cache-Control/Redis TTL instead of pinning 24h here
    // Keep data fresh by default; browser HTTP cache (public, max-age=...) prevents redundant network
    staleTime: 0,
    gcTime: ttlSeconds * 1000, // keep in cache up to backend TTL
  });
} 
