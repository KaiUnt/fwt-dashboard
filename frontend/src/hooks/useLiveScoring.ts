'use client';

import { useQuery } from '@tanstack/react-query';
import { LiveScoringResponse } from '@/types/livescoring';
import { apiFetch } from '@/utils/api';
import { useAccessToken } from '@/providers/AuthProvider';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchLiveScoring(
  eventId: string,
  forceRefresh: boolean = false,
  getAccessToken?: () => Promise<string | null>
): Promise<LiveScoringResponse> {
  const url = new URL(`${API_BASE_URL}/api/events/${eventId}/livescoring`);
  if (forceRefresh) {
    url.searchParams.set('force_refresh', 'true');
  }
  return apiFetch<LiveScoringResponse>(url.toString(), { getAccessToken });
}

interface UseLiveScoringOptions {
  enabled?: boolean;
  forcePollingInterval?: number;
}

/**
 * Hook for fetching live scoring data with smart polling.
 *
 * Polling intervals are determined by event status:
 * - live/in_progress: 30 seconds
 * - upcoming: 5 minutes
 * - completed/finished: no polling (single fetch)
 */
export function useLiveScoring(eventId: string, options?: UseLiveScoringOptions) {
  const { getAccessToken } = useAccessToken();
  const { enabled = true, forcePollingInterval } = options || {};

  return useQuery<LiveScoringResponse>({
    queryKey: ['liveScoring', eventId],
    queryFn: () => fetchLiveScoring(eventId, false, getAccessToken),
    enabled: enabled && !!eventId,
    refetchOnWindowFocus: false,
    staleTime: 10_000, // Consider data stale after 10 seconds
    gcTime: 60_000, // Keep in cache for 1 minute
    refetchInterval: (query) => {
      // Allow override via options
      if (forcePollingInterval !== undefined) {
        return forcePollingInterval;
      }

      const data = query.state.data;
      if (!data) return false;

      const status = data.event?.status?.toLowerCase() || '';

      // Only poll for live events - 30 second interval
      if (status === 'live' || status === 'in_progress') {
        return 30_000;
      }

      // No polling for upcoming, completed, or any other status
      return false;
    },
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Helper to check if an event is currently live
 */
export function isEventLive(status?: string): boolean {
  if (!status) return false;
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === 'live' || normalizedStatus === 'in_progress';
}

/**
 * Helper to check if an event is completed
 */
export function isEventCompleted(status?: string): boolean {
  if (!status) return false;
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === 'completed' || normalizedStatus === 'finished';
}
