'use client'

import { useEffect, useState, useCallback } from 'react'
import { Coins, RefreshCw } from 'lucide-react'

import { isSupabaseConfigured } from '@/utils/supabase'

interface CreditsBalanceProps {
  onCreditsUpdate?: (credits: number) => void
  showLabel?: boolean
  className?: string
  isInsideButton?: boolean
}

export default function CreditsBalance({ 
  onCreditsUpdate, 
  showLabel = true, 
  className = "",
  isInsideButton = false
}: CreditsBalanceProps) {
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCredits = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      console.log('CreditsBalance: Starting to fetch credits...')
      
      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        console.log('CreditsBalance: Supabase not configured')
        setError('Credits system not available - Supabase not configured')
        return
      }
      
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      console.log('CreditsBalance: Session check result:', { hasSession: !!session, hasToken: !!session?.access_token })
      
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      console.log('CreditsBalance: Making API request to /api/credits/balance')
      const response = await fetch('/api/credits/balance', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      console.log('CreditsBalance: API response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('CreditsBalance: API error response:', errorData)
        throw new Error(errorData.error || 'Failed to fetch credits')
      }

      const data = await response.json()
      console.log('CreditsBalance: API success response:', data)
      
      const creditsValue = data.credits || 0
      
      setCredits(creditsValue)
      onCreditsUpdate?.(creditsValue)
    } catch (err) {
      console.error('Error fetching credits:', err)
      setError(err instanceof Error ? err.message : 'Failed to load credits')
    } finally {
      setLoading(false)
    }
  }, [onCreditsUpdate])

  useEffect(() => {
    fetchCredits()
  }, [fetchCredits])

  const handleRefresh = () => {
    fetchCredits()
  }

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
        {showLabel && <span className="text-sm text-gray-400">Loading...</span>}
      </div>
    )
  }

  if (error) {
    if (isInsideButton) {
      return (
        <div className={`flex items-center space-x-2 ${className}`}>
          <div
            onClick={handleRefresh}
            className="flex items-center space-x-2 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
            title="Retry loading credits"
          >
            <RefreshCw className="h-4 w-4" />
            {showLabel && <span className="text-sm">Error</span>}
          </div>
        </div>
      )
    }
    
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <button
          onClick={handleRefresh}
          className="flex items-center space-x-2 text-red-400 hover:text-red-300 transition-colors"
          title="Retry loading credits"
        >
          <RefreshCw className="h-4 w-4" />
          {showLabel && <span className="text-sm">Error</span>}
        </button>
      </div>
    )
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="flex items-center space-x-1">
        <Coins className="h-4 w-4 text-yellow-400" />
        <span className="font-semibold text-yellow-400">
          {credits}
        </span>
        {showLabel && (
          <span className="text-sm text-gray-300">
            {credits === 1 ? 'Credit' : 'Credits'}
          </span>
        )}
      </div>
      {isInsideButton ? (
        <div
          onClick={handleRefresh}
          className="text-gray-400 hover:text-gray-300 transition-colors p-1 rounded cursor-pointer"
          title="Refresh credits"
        >
          <RefreshCw className="h-3 w-3" />
        </div>
      ) : (
        <button
          onClick={handleRefresh}
          className="text-gray-400 hover:text-gray-300 transition-colors p-1 rounded"
          title="Refresh credits"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}