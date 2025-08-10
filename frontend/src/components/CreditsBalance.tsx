'use client'

import { useEffect, useState } from 'react'
import { Coins, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface CreditsBalanceProps {
  onCreditsUpdate?: (credits: number) => void
  showLabel?: boolean
  className?: string
}

export default function CreditsBalance({ 
  onCreditsUpdate, 
  showLabel = true, 
  className = "" 
}: CreditsBalanceProps) {
  const [credits, setCredits] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCredits = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/credits/balance', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch credits')
      }

      const data = await response.json()
      const creditsValue = data.credits || 0
      
      setCredits(creditsValue)
      onCreditsUpdate?.(creditsValue)
    } catch (err) {
      console.error('Error fetching credits:', err)
      setError(err instanceof Error ? err.message : 'Failed to load credits')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCredits()
  }, [])

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
      <button
        onClick={handleRefresh}
        className="text-gray-400 hover:text-gray-300 transition-colors p-1 rounded"
        title="Refresh credits"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  )
}