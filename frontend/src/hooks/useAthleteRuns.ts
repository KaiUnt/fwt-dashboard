'use client'

import { useQuery } from '@tanstack/react-query'
import { useAccessToken } from '@/providers/AuthProvider'
import { apiFetch } from '@/utils/api'
import { AthleteRun } from '@/types/supabase'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface AthleteRunsResponse {
  success: boolean
  data: AthleteRun[]
}

export function useAthleteRuns(athleteId?: string, eventId?: string) {
  const { getAccessToken } = useAccessToken()

  return useQuery({
    queryKey: ['athlete-runs', athleteId, eventId],
    queryFn: async (): Promise<AthleteRun[]> => {
      const params = new URLSearchParams()
      if (athleteId) params.set('athlete_id', athleteId)
      if (eventId) params.set('event_id', eventId)

      const response = await apiFetch<AthleteRunsResponse>(
        `${API_BASE_URL}/api/video/athlete-runs?${params.toString()}`,
        { getAccessToken }
      )

      return response.data || []
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

      // Fetch runs for all athletes at once (no filter = get all runs for this event)
      const params = new URLSearchParams()
      if (eventId) params.set('event_id', eventId)

      const response = await apiFetch<AthleteRunsResponse>(
        `${API_BASE_URL}/api/video/athlete-runs?${params.toString()}`,
        { getAccessToken }
      )

      // Group runs by athlete_id
      const byAthlete: Record<string, AthleteRun[]> = {}
      for (const run of response.data || []) {
        if (!byAthlete[run.athlete_id]) {
          byAthlete[run.athlete_id] = []
        }
        byAthlete[run.athlete_id].push(run)
      }

      // Filter to only include requested athlete IDs
      const filtered: Record<string, AthleteRun[]> = {}
      for (const id of athleteIds) {
        if (byAthlete[id]) {
          filtered[id] = byAthlete[id]
        }
      }

      return filtered
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

    const params = new URLSearchParams()
    params.set('mute', '1') // Start muted by default
    if (timestamp && timestamp > 0) {
      params.set('start', String(timestamp))
    }

    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
  } catch {
    return ''
  }
}

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
