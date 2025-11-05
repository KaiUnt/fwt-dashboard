'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/utils/api';
import { useAccessToken } from '@/providers/AuthProvider';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function useAthleteResults(athleteId: string) {
  const { getAccessToken } = useAccessToken();

  return useQuery({
    queryKey: ['athlete-results', athleteId],
    queryFn: async () => {
      if (!athleteId) {
        return null;
      }

      const data = await apiFetch(
        `${API_BASE_URL}/api/athlete/${athleteId}/results`,
        { getAccessToken }
      );

      return data;
    },
    enabled: !!athleteId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
