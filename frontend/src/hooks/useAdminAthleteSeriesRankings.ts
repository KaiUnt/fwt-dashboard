'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/utils/api';
import { useAccessToken } from '@/providers/AuthProvider';
import { SeriesData, SeriesRanking, SeriesEventResult } from './useSeriesRankings';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Backend response format (flat per division)
interface BackendRanking {
  series_id: string;
  series_name: string;
  division: string;
  rank: number | null;
  points: number | null;
  results: SeriesEventResult[];
}

interface BackendResponse {
  success: boolean;
  athlete_id: string;
  rankings: BackendRanking[];
  total_series: number;
}

export function useAdminAthleteSeriesRankings(athleteId: string | null) {
  const { getAccessToken } = useAccessToken();

  return useQuery({
    queryKey: ['admin-athlete-series-rankings', athleteId],
    queryFn: async (): Promise<SeriesData[] | null> => {
      if (!athleteId) {
        return null;
      }

      const data = await apiFetch<BackendResponse>(
        `${API_BASE_URL}/api/admin/athlete/${athleteId}/series-rankings`,
        { getAccessToken }
      );

      // Transform flat rankings into SeriesData[] format
      // Group by series_id since same series can have multiple divisions
      const seriesMap = new Map<string, SeriesData>();

      for (const ranking of data.rankings) {
        const existingSeries = seriesMap.get(ranking.series_id);

        const athleteRanking: SeriesRanking = {
          athlete: {
            id: athleteId,
            name: '', // Name is not in the response, but not needed for display
          },
          place: ranking.rank ?? undefined,
          points: ranking.points ?? undefined,
          results: ranking.results || [],
        };

        if (existingSeries) {
          // Add to existing series divisions
          if (existingSeries.divisions[ranking.division]) {
            existingSeries.divisions[ranking.division].push(athleteRanking);
          } else {
            existingSeries.divisions[ranking.division] = [athleteRanking];
          }
        } else {
          // Create new series entry
          seriesMap.set(ranking.series_id, {
            series_id: ranking.series_id,
            series_name: ranking.series_name,
            divisions: {
              [ranking.division]: [athleteRanking],
            },
          });
        }
      }

      return Array.from(seriesMap.values());
    },
    enabled: !!athleteId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
