'use client'

import { useState, useCallback } from 'react'
import { useAuth, useAccessToken } from '@/providers/AuthProvider'
import { useEvents } from '@/hooks/useEvents'
import { apiFetch } from '@/utils/api'
import { AppHeader } from '@/components/AppHeader'
import {
  Video,
  Upload,
  Link as LinkIcon,
  Check,
  X,
  AlertTriangle,
  Loader2,
  ChevronDown,
  Trash2
} from 'lucide-react'

interface ParsedRider {
  bib: string
  name: string
  rider_class: string
  sex: string
  nation: string
  points: string
  state: string
  youtubeUrl: string
  youtubeTimestamp: number
}

interface ParsedXmlData {
  eventName: string
  eventDate: string
  year: number
  riders: ParsedRider[]
}

interface ProcessedRider extends ParsedRider {
  athleteId: string | null
  athleteName: string | null
  matchConfidence: 'exact' | 'normalized' | 'fuzzy' | 'none'
  selected: boolean
}

export default function VideoManagementPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const { getAccessToken } = useAccessToken()
  const { data: eventsData } = useEvents(true)

  const [xmlUrl, setXmlUrl] = useState('')
  const [parsedData, setParsedData] = useState<ParsedXmlData | null>(null)
  const [processedRiders, setProcessedRiders] = useState<ProcessedRider[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [step, setStep] = useState<'input' | 'preview' | 'done'>('input')

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  const parseXml = useCallback(async () => {
    if (!xmlUrl.trim()) {
      setError('Please enter a URL')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      // Parse XML
      const parseResult = await apiFetch<{
        success: boolean
        data: ParsedXmlData
        error?: string
      }>(`${API_BASE_URL}/api/video/parse-xml`, {
        getAccessToken,
        method: 'POST',
        body: { xmlUrl }
      })

      if (!parseResult.success || !parseResult.data) {
        throw new Error(parseResult.error || 'Failed to parse XML')
      }

      setParsedData(parseResult.data)

      // Match athletes
      const matchResult = await apiFetch<{
        success: boolean
        matches: Array<{
          rider_name: string
          athlete_id: string | null
          athlete_name: string | null
          match_type: string
        }>
        matchedCount: number
        totalCount: number
      }>(`${API_BASE_URL}/api/video/match-athletes`, {
        getAccessToken,
        method: 'POST',
        body: {
          riders: parseResult.data.riders.map(r => ({ name: r.name, bib: r.bib })),
          eventId: selectedEventId || 'unknown'
        }
      })

      // Merge parsed riders with match results
      const processed: ProcessedRider[] = parseResult.data.riders.map((rider, idx) => {
        const match = matchResult.matches[idx]
        return {
          ...rider,
          athleteId: match?.athlete_id || null,
          athleteName: match?.athlete_name || null,
          matchConfidence: (match?.match_type as ProcessedRider['matchConfidence']) || 'none',
          selected: match?.athlete_id !== null
        }
      })

      setProcessedRiders(processed)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process XML')
    } finally {
      setLoading(false)
    }
  }, [xmlUrl, getAccessToken, selectedEventId, API_BASE_URL])

  const toggleRider = (index: number) => {
    setProcessedRiders(prev =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r))
    )
  }

  const selectAll = () => {
    setProcessedRiders(prev =>
      prev.map(r => ({ ...r, selected: r.athleteId !== null }))
    )
  }

  const deselectAll = () => {
    setProcessedRiders(prev => prev.map(r => ({ ...r, selected: false })))
  }

  const saveRuns = useCallback(async () => {
    if (!selectedEventId) {
      setError('Please select an event')
      return
    }

    const selectedRiders = processedRiders.filter(r => r.selected && r.athleteId)
    if (selectedRiders.length === 0) {
      setError('No riders selected')
      return
    }

    setSaving(true)
    setError('')

    try {
      const runs = selectedRiders.map(rider => ({
        athlete_id: rider.athleteId!,
        event_id: selectedEventId,
        event_name: parsedData?.eventName || '',
        year: parsedData?.year || new Date().getFullYear(),
        youtube_url: rider.youtubeUrl,
        youtube_timestamp: rider.youtubeTimestamp
      }))

      const result = await apiFetch<{
        success: boolean
        savedCount: number
        message: string
      }>(`${API_BASE_URL}/api/video/runs`, {
        getAccessToken,
        method: 'POST',
        body: { runs }
      })

      setSuccess(result.message)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save runs')
    } finally {
      setSaving(false)
    }
  }, [selectedEventId, processedRiders, parsedData, getAccessToken, API_BASE_URL])

  const reset = () => {
    setXmlUrl('')
    setParsedData(null)
    setProcessedRiders([])
    setSelectedEventId('')
    setError('')
    setSuccess('')
    setStep('input')
  }

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'exact':
        return <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">Exact</span>
      case 'normalized':
        return <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">Normalized</span>
      case 'fuzzy':
        return <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">Fuzzy</span>
      default:
        return <span className="px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-full">No Match</span>
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
        <p className="text-gray-600 mt-2">You need admin privileges to access this page.</p>
      </div>
    )
  }

  const matchedCount = processedRiders.filter(r => r.athleteId !== null).length
  const selectedCount = processedRiders.filter(r => r.selected && r.athleteId !== null).length

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Video Management" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Video className="h-8 w-8 text-blue-600" />
            Video Management
          </h1>
          <p className="text-gray-600 mt-2">
            Upload XML files from tv.open-faces.com to link athlete runs to YouTube videos.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <Check className="h-5 w-5 flex-shrink-0" />
            {success}
          </div>
        )}

        {step === 'input' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Enter XML API URL</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  XML API URL
                </label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="url"
                      value={xmlUrl}
                      onChange={e => setXmlUrl(e.target.value)}
                      placeholder="https://tv.open-faces.com/contests/.../xmlapi"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder:text-gray-400"
                    />
                  </div>
                  <button
                    onClick={parseXml}
                    disabled={loading || !xmlUrl.trim()}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                    Parse XML
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Example: https://tv.open-faces.com/contests/challenger4-obertauern-2025/xmlapi
              </p>
            </div>
          </div>
        )}

        {step === 'preview' && parsedData && (
          <div className="space-y-6">
            {/* Event Info */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Event Information</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-sm text-gray-500">Event Name</span>
                  <p className="font-medium">{parsedData.eventName}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Date</span>
                  <p className="font-medium">{parsedData.eventDate}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Year</span>
                  <p className="font-medium">{parsedData.year}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Riders</span>
                  <p className="font-medium">{processedRiders.length}</p>
                </div>
              </div>
            </div>

            {/* Event Selection */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Target Event</h2>
              <div className="relative">
                <select
                  value={selectedEventId}
                  onChange={e => setSelectedEventId(e.target.value)}
                  className="w-full appearance-none px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
                >
                  <option value="">Select an event...</option>
                  {eventsData?.events?.map(event => (
                    <option key={event.id} value={event.id}>
                      {event.name} ({event.year})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Riders Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Rider Matches</h2>
                  <p className="text-sm text-gray-500">
                    {matchedCount} of {processedRiders.length} riders matched • {selectedCount} selected
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Select All Matched
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Select</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">BIB</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">XML Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matched Athlete</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Match</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Video</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {processedRiders.map((rider, idx) => (
                      <tr
                        key={idx}
                        className={`${rider.athleteId ? 'hover:bg-gray-50' : 'bg-red-50/50'} ${
                          rider.selected ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={rider.selected}
                            onChange={() => toggleRider(idx)}
                            disabled={!rider.athleteId}
                            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 disabled:opacity-50"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{rider.bib}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{rider.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {rider.athleteName || (
                            <span className="text-red-500 flex items-center gap-1">
                              <X className="h-4 w-4" />
                              Not found
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">{getConfidenceBadge(rider.matchConfidence)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{rider.rider_class}</td>
                        <td className="px-4 py-3 text-sm">
                          {rider.youtubeUrl ? (
                            <a
                              href={`${rider.youtubeUrl}${rider.youtubeTimestamp ? `?t=${rider.youtubeTimestamp}` : ''}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {rider.youtubeTimestamp ? `@${Math.floor(rider.youtubeTimestamp / 60)}:${(rider.youtubeTimestamp % 60).toString().padStart(2, '0')}` : 'View'}
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between">
              <button
                onClick={reset}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
              >
                <Trash2 className="h-5 w-5" />
                Start Over
              </button>
              <button
                onClick={saveRuns}
                disabled={saving || !selectedEventId || selectedCount === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Check className="h-5 w-5" />
                )}
                Save {selectedCount} Runs
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Runs Saved Successfully</h2>
            <p className="text-gray-600 mb-6">{success}</p>
            <button
              onClick={reset}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Upload Another XML
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
