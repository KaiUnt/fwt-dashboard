'use client';

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/utils/api';
import { useAccessToken } from '@/providers/AuthProvider';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface SeedResponse {
  success: boolean;
  total_athletes: number;
  inserted: number;
  updated: number;
  series_processed: number;
}

export function useAdminSeedAthletes() {
  const { getAccessToken } = useAccessToken();

  return useMutation({
    mutationFn: async (): Promise<SeedResponse> => {
      const data = await apiFetch<SeedResponse>(
        `${API_BASE_URL}/api/admin/athletes/seed`,
        {
          getAccessToken,
          method: 'POST',
          timeoutMs: 5 * 60 * 1000, // 5 minutes timeout for seeding
        }
      );

      return data;
    },
  });
}
