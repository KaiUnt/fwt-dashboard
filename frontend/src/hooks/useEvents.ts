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
  
  return useQuery({
    queryKey: ['events', includePast],
    queryFn: () => fetchEvents(includePast, false, getAccessToken),
    refetchOnWindowFocus: false,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - Events change rarely
  });
} 