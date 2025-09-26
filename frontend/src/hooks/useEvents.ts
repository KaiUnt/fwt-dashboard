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

  if (typeof window !== 'undefined' && (window as any).__FWT_DEBUG_LOAD__ === true) {
    console.time(`[events] fetch includePast=${includePast} forceRefresh=${forceRefresh}`)
  }
  const data = await apiFetch(url.toString(), { getAccessToken });
  if (typeof window !== 'undefined' && (window as any).__FWT_DEBUG_LOAD__ === true) {
    console.timeEnd(`[events] fetch includePast=${includePast} forceRefresh=${forceRefresh}`)
  }
  return data;
}

export function useEvents(includePast: boolean = false) {
  const { getAccessToken } = useAccessToken();
  const ttlSeconds = Number(process.env.NEXT_PUBLIC_EVENTS_TTL_SECONDS || process.env.NEXT_PUBLIC_EVENTS_TTL || '3600');
  
  const DEBUG = typeof window !== 'undefined' && (window as any).__FWT_DEBUG_LOAD__ === true || (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DEBUG_LOAD === '1');

  return useQuery({
    queryKey: ['events', includePast],
    queryFn: () => fetchEvents(includePast, false, getAccessToken),
    refetchOnWindowFocus: false,
    // Honor server-side Cache-Control/Redis TTL instead of pinning 24h here
    // Keep data fresh by default; browser HTTP cache (public, max-age=...) prevents redundant network
    staleTime: 0,
    gcTime: ttlSeconds * 1000, // keep in cache up to backend TTL
    onSuccess: (data) => {
      if (DEBUG) console.log('[events] onSuccess', { count: (data as any)?.events?.length })
      if (typeof performance !== 'undefined' && performance.mark) performance.mark('events:onSuccess')
    },
    onError: (err) => {
      if (DEBUG) console.warn('[events] onError', err)
      if (typeof performance !== 'undefined' && performance.mark) performance.mark('events:onError')
    },
    onSettled: () => {
      if (DEBUG) console.log('[events] onSettled')
      if (typeof performance !== 'undefined' && performance.measure && performance.getEntriesByName) {
        try { performance.measure('events:total', 'events:start', 'events:onSuccess') } catch {}
      }
    }
  });
} 
