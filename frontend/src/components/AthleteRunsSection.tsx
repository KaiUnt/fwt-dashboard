'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Play, Calendar, ExternalLink } from 'lucide-react'
import { useAthleteRuns, getYoutubeEmbedUrl, formatTimestamp } from '@/hooks/useAthleteRuns'

interface AthleteRunsSectionProps {
  athleteId: string
  athleteName: string
  eventId: string
}

export function AthleteRunsSection({ athleteId, athleteName, eventId }: AthleteRunsSectionProps) {
  const { data: runs, isLoading, error } = useAthleteRuns(athleteId, eventId)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  if (isLoading) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div
          className="flex items-center justify-between cursor-pointer hover:bg-gray-100 -m-2 p-2 rounded"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center space-x-2">
            <Play className="h-4 w-4 text-red-600" />
            <h4 className="text-sm font-medium text-gray-700">Previous Runs</h4>
          </div>
          <div className="p-1 bg-gray-200 hover:bg-gray-300 rounded transition-colors">
            {isCollapsed ? <ChevronDown className="h-4 w-4 text-gray-600" /> : <ChevronUp className="h-4 w-4 text-gray-600" />}
          </div>
        </div>
        {!isCollapsed && (
          <div className="flex items-center justify-center py-4 mt-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600"></div>
          </div>
        )}
      </div>
    )
  }

  if (error) {
    // Gracefully handle errors - don't show section if API fails
    return null
  }

  if (!runs || runs.length === 0) {
    // Don't show anything if no runs available
    return null
  }

  // Get unique years sorted descending
  const years = [...new Set(runs.map(r => r.year))].sort((a, b) => b - a)

  // Select most recent year by default if none selected
  const activeYear = selectedYear || years[0]
  const activeRun = runs.find(r => r.year === activeYear)

  if (!activeRun) {
    return null
  }

  const embedUrl = getYoutubeEmbedUrl(activeRun.youtube_url, activeRun.youtube_timestamp || 0)

  if (!embedUrl) {
    return null
  }

  return (
    <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-lg p-4 border border-red-100">
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-red-100 -m-2 p-2 rounded"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center space-x-2">
          <Play className="h-4 w-4 text-red-600" />
          <h4 className="text-sm font-medium text-gray-700">Previous Runs</h4>
          <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
            {years.length} {years.length === 1 ? 'year' : 'years'}
          </span>
        </div>
        <div className="p-1 bg-red-200 hover:bg-red-300 rounded transition-colors">
          {isCollapsed ? <ChevronDown className="h-4 w-4 text-red-700" /> : <ChevronUp className="h-4 w-4 text-red-700" />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          {/* Year Tabs */}
          {years.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {years.map(year => (
                <button
                  key={year}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedYear(year)
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    activeYear === year
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <Calendar className="h-3 w-3" />
                  {year}
                </button>
              ))}
            </div>
          )}

          {/* Event Name */}
          {activeRun.event_name && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">{activeRun.event_name}</span>
              {activeRun.youtube_timestamp && activeRun.youtube_timestamp > 0 && (
                <span className="ml-2 text-gray-400">
                  @ {formatTimestamp(activeRun.youtube_timestamp)}
                </span>
              )}
            </div>
          )}

          {/* YouTube Embed */}
          <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={embedUrl}
              title={`${athleteName} Run ${activeYear}`}
              className="absolute inset-0 w-full h-full"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>

          {/* Direct Link */}
          <div className="flex justify-center">
            <a
              href={`${activeRun.youtube_url}${activeRun.youtube_timestamp ? `?t=${activeRun.youtube_timestamp}` : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in YouTube
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
