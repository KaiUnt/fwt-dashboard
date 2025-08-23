'use client'

import { useEffect } from 'react'
import { Coins, RefreshCw } from 'lucide-react'
import { useCredits } from '@/hooks/useCredits'
import { useTranslation } from '@/providers/TranslationProvider'

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
  const { credits, loading, error, fetchCredits } = useCredits()
  const { t } = useTranslation()

  // Notify parent component when credits change
  useEffect(() => {
    if (credits !== null && onCreditsUpdate) {
      onCreditsUpdate(credits)
    }
  }, [credits, onCreditsUpdate])

  const handleRefresh = () => {
    fetchCredits()
  }

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
        {showLabel && <span className="text-sm text-gray-400">{t('credits.balance.loading')}</span>}
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
            title={t('credits.balance.retryLoading')}
          >
            <RefreshCw className="h-4 w-4" />
            {showLabel && <span className="text-sm">{t('credits.balance.error')}</span>}
          </div>
        </div>
      )
    }
    
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <button
          onClick={handleRefresh}
          className="flex items-center space-x-2 text-red-400 hover:text-red-300 transition-colors"
          title={t('credits.balance.retryLoading')}
        >
          <RefreshCw className="h-4 w-4" />
          {showLabel && <span className="text-sm">{t('credits.balance.error')}</span>}
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
            {credits === 1 ? t('credits.credit') : t('credits.credits')}
          </span>
        )}
      </div>
      {isInsideButton ? (
        <div
          onClick={handleRefresh}
          className="text-gray-400 hover:text-gray-300 transition-colors p-1 rounded cursor-pointer"
          title={t('credits.balance.refresh')}
        >
          <RefreshCw className="h-3 w-3" />
        </div>
      ) : (
        <button
          onClick={handleRefresh}
          className="text-gray-400 hover:text-gray-300 transition-colors p-1 rounded"
          title={t('credits.balance.refresh')}
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}