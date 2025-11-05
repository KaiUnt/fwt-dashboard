'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/utils/api';
import { useAccessToken } from '@/providers/AuthProvider';
import { SeriesRankingsResponse } from '@/types/series';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface AdminAthleteSeriesRankingsResponse {
  athlete_id: string;
  series_rankings: SeriesRankingsResponse[];
  series_count: number;
  message: string;
}

export function useAdminAthleteSeriesRankings(athleteId: string | null) {
  const { getAccessToken } = useAccessToken();

  return useQuery({
    queryKey: ['admin-athlete-series-rankings', athleteId],
    queryFn: async () => {
      if (!athleteId) {
        return null;
      }

      const data = await apiFetch<AdminAthleteSeriesRankingsResponse>(
        `${API_BASE_URL}/api/admin/athlete/${athleteId}/series-rankings`,
        { getAccessToken }
      );

      return data.series_rankings;
    },
    enabled: !!athleteId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
