import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isSupabaseConfigured } from '@/utils/supabase'

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

  const fetchBatchAccess = async (ids: string[]): Promise<BatchAccessResult> => {
    try {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase not configured')
      }

      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      // Try batch endpoint first
      try {
        const response = await fetch('/api/events/access-batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ eventIds: ids })
        })

        if (response.ok) {
          const data = await response.json()
          return data.access_status || {}
        }
        
        // If batch endpoint fails, fall back to parallel individual calls
        console.warn('Batch endpoint failed, falling back to individual calls')
      } catch (batchError) {
        console.warn('Batch endpoint not available, using parallel individual calls')
      }

      // Fallback: Make parallel individual calls for better performance than sequential
      const accessPromises = ids.map(async (eventId) => {
        try {
          const response = await fetch(`/api/events/${eventId}/access`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          })

          if (response.ok) {
            const data = await response.json()
            return { eventId, hasAccess: data.has_access || false }
          }
          return { eventId, hasAccess: false }
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
  }

  const checkBatchAccess = useCallback(async (ids: string[]): Promise<BatchAccessResult> => {
    try {
      setError(null)
      return await fetchBatchAccess(ids)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return {}
    }
  }, [])

  return {
    accessStatus,
    loading,
    error: error || (queryError instanceof Error ? queryError.message : null),
    checkBatchAccess,
    refetch
  }
}

export default useBatchEventAccess
