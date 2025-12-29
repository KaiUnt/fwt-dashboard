'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/utils/api';
import { useAccessToken } from '@/providers/AuthProvider';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface AthleteSearchResult {
  id: string;
  name: string;
  last_seen: string;
}

interface SearchAthletesResponse {
  success: boolean;
  athletes?: AthleteSearchResult[];
  data?: AthleteSearchResult[];
}

export function useAdminAthleteSearch(query: string, enabled: boolean = true) {
  const { getAccessToken } = useAccessToken();

  return useQuery({
    queryKey: ['admin-athlete-search', query],
    queryFn: async (): Promise<AthleteSearchResult[]> => {
      if (!query || query.length < 2) {
        return [];
      }

      const data = await apiFetch<SearchAthletesResponse>(
        `${API_BASE_URL}/api/admin/athletes/search?q=${encodeURIComponent(query)}&limit=10`,
        { getAccessToken }
      );

      return data.athletes || data.data || [];
    },
    enabled: enabled && query.length >= 2,
    staleTime: 30 * 1000, // 30 seconds
  });
}
