'use client'

import { useQuery } from '@tanstack/react-query'
import { useAccessToken } from '@/providers/AuthProvider'
import { apiFetch } from '@/utils/api'
import { AthleteRun } from '@/types/supabase'

interface AthleteRunsResponse {
  success: boolean
  runs: AthleteRun[]
  byAthlete: Record<string, AthleteRun[]>
}

export function useAthleteRuns(athleteId?: string, eventId?: string) {
  const { getAccessToken } = useAccessToken()

  return useQuery({
    queryKey: ['athlete-runs', athleteId, eventId],
    queryFn: async (): Promise<AthleteRun[]> => {
      const params = new URLSearchParams()
      if (athleteId) params.set('athlete_id', athleteId)
      if (eventId) params.set('event_id', eventId)

      const data = await apiFetch<AthleteRunsResponse>(
        `/api/athlete-runs?${params.toString()}`,
        { getAccessToken }
      )

      return data.runs || []
    },
    enabled: !!athleteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

export function useBatchAthleteRuns(athleteIds: string[], eventId?: string) {
  const { getAccessToken } = useAccessToken()

  return useQuery({
    queryKey: ['batch-athlete-runs', athleteIds.join(','), eventId],
    queryFn: async (): Promise<Record<string, AthleteRun[]>> => {
      if (athleteIds.length === 0) return {}

      const params = new URLSearchParams()
      params.set('athlete_ids', athleteIds.join(','))
      if (eventId) params.set('event_id', eventId)

      const data = await apiFetch<AthleteRunsResponse>(
        `/api/athlete-runs?${params.toString()}`,
        { getAccessToken }
      )

      return data.byAthlete || {}
    },
    enabled: athleteIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
  })
}

export function getYoutubeEmbedUrl(youtubeUrl: string, timestamp?: number): string {
  try {
    const url = new URL(youtubeUrl)
    let videoId = ''

    if (url.hostname === 'youtu.be') {
      videoId = url.pathname.slice(1)
    } else if (url.hostname.includes('youtube.com')) {
      videoId = url.searchParams.get('v') || ''
    }

    if (!videoId) return ''

    let embedUrl = `https://www.youtube.com/embed/${videoId}`
    if (timestamp && timestamp > 0) {
      embedUrl += `?start=${timestamp}`
    }

    return embedUrl
  } catch {
    return ''
  }
}

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
