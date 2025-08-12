import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured } from '@/utils/supabase'
import { apiFetch } from '@/utils/api'
import { useAccessToken } from '@/providers/AuthProvider'

interface BatchAccessResult {
  [eventId: string]: boolean
}

interface UseBatchEventAccessResult {
  accessStatus: BatchAccessResult
  loading: boolean
  error: string | null
  checkBatchAccess: (eventIds: string[]) => Promise<BatchAccessResult>
  refetch: () => void
}

export function useBatchEventAccess(eventIds: string[]): UseBatchEventAccessResult {
  const [error, setError] = useState<string | null>(null)
  const { getAccessToken } = useAccessToken()

  // Use React Query for caching and background refetching
  const {
    data: accessStatus = {},
    isLoading: loading,
    refetch,
    error: queryError
  } = useQuery({
    queryKey: ['batchEventAccess', eventIds.sort()], // Sort for consistent cache key
    queryFn: () => fetchBatchAccess(eventIds),
    enabled: eventIds.length > 0 && isSupabaseConfigured(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: false,
    retry: 2
  })

  const fetchBatchAccess = useCallback(async (ids: string[]): Promise<BatchAccessResult> => {
    try {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured')
      }

      // Try batch endpoint first
      try {
        const data = await apiFetch('/api/events/access-batch', {
          method: 'POST',
          body: { eventIds: ids },
          getAccessToken,
        })
        return data.access_status || {}
      } catch {
        console.warn('Batch endpoint failed, falling back to individual calls')
      }

      // Fallback: Make parallel individual calls
      const accessPromises = ids.map(async (eventId) => {
        try {
          const data = await apiFetch(`/api/events/${eventId}/access`, { getAccessToken })
          return { eventId, hasAccess: data.has_access || false }
        } catch {
          return { eventId, hasAccess: false }
        }
      })

      const results = await Promise.all(accessPromises)
      const batchResult: BatchAccessResult = {}
      results.forEach(({ eventId, hasAccess }) => {
        batchResult[eventId] = hasAccess
      })
      return batchResult
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      throw err
    }
  }, [getAccessToken])

  const checkBatchAccess = useCallback(async (ids: string[]): Promise<BatchAccessResult> => {
    try {
      setError(null)
      return await fetchBatchAccess(ids)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return {}
    }
  }, [fetchBatchAccess])

  return {
    accessStatus,
    loading,
    error: error || (queryError instanceof Error ? queryError.message : null),
    checkBatchAccess,
    refetch
  }
}

export default useBatchEventAccess
