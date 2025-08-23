'use client'

import { useState, useEffect, useCallback } from 'react'
import { Lock, Coins, Clock, Calendar, AlertCircle } from 'lucide-react'
import { useCredits } from '@/hooks/useCredits'
import { useTranslation } from '@/providers/TranslationProvider'

interface EventAccessGuardProps {
  eventId: string
  eventName?: string
  eventDate?: string
  children: React.ReactNode
  onAccessGranted?: () => void
}

export default function EventAccessGuard({
  eventId,
  eventName,
  eventDate,
  children,
  onAccessGranted
}: EventAccessGuardProps) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { credits, checkEventAccess, purchaseEventAccess } = useCredits()
  const { t } = useTranslation()

  const checkAccess = useCallback(async () => {
    try {
      setLoading(true)
      const allowed = await checkEventAccess(eventId)
      setHasAccess(allowed)
      
      if (allowed && onAccessGranted) {
        onAccessGranted()
      }
    } catch (err) {
      console.error('Error checking access:', err)
      setHasAccess(false)
    } finally {
      setLoading(false)
    }
  }, [eventId, onAccessGranted, checkEventAccess])

  useEffect(() => {
    checkAccess()
  }, [eventId, checkAccess])

  const purchaseAccess = async () => {
    try {
      setPurchasing(true)
      setError(null)
      
      await purchaseEventAccess(eventId, eventName)

      // Success
      setHasAccess(true)
      
      if (onAccessGranted) {
        onAccessGranted()
      }

      // Show success message
      alert(t('credits.purchase.eventAccessGranted'))

    } catch (err) {
      console.error('Error purchasing access:', err)
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setPurchasing(false)
    }
  }

  const isEventOld = () => {
    if (!eventDate) return false
    
    const eventDateObj = new Date(eventDate)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    return eventDateObj < sevenDaysAgo
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
        <span className="ml-3 text-gray-400">Überprüfe Event-Zugang...</span>
      </div>
    )
  }

  // User has access or event is free (old)
  if (hasAccess || isEventOld()) {
    return <>{children}</>
  }

  // User needs to purchase access
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-900 rounded-lg border border-gray-700 p-8 text-center">
        <div className="mb-6">
          <Lock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Event-Zugang erforderlich</h2>
          <p className="text-gray-400">
            Um auf dieses Event zugreifen zu können, benötigst du 1 Credit.
          </p>
        </div>

        {eventName && (
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-white mb-1">{eventName}</h3>
            {eventDate && (
              <div className="flex items-center justify-center space-x-2 text-gray-400 text-sm">
                <Calendar className="h-4 w-4" />
                <span>{new Date(eventDate).toLocaleDateString('de-DE')}</span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          {/* Credits Display */}
          <div className="flex items-center justify-center space-x-2 text-lg">
            <Coins className="h-5 w-5 text-yellow-400" />
            <span className="text-white">Deine Credits:</span>
            <span className={`font-bold ${credits > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
              {credits}
            </span>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-center justify-center space-x-2 text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {credits > 0 ? (
            <button
              onClick={purchaseAccess}
              disabled={purchasing}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-lg transition-colors flex items-center justify-center space-x-2 mx-auto"
            >
              {purchasing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Wird freigeschaltet...</span>
                </>
              ) : (
                <>
                  <Coins className="h-4 w-4" />
                  <span>Für 1 Credit freischalten</span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-4">
                <p className="text-blue-400 text-sm font-medium mb-2">
                  {t('credits.contact.needMoreCredits')}
                </p>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-4 text-left">
            <div className="flex items-start space-x-2">
              <Clock className="h-4 w-4 text-blue-400 mt-0.5" />
              <div className="text-sm">
                <p className="text-blue-400 font-medium mb-1">Info</p>
                <p className="text-gray-400">
                  Events werden 7 Tage nach Ende automatisch kostenlos verfügbar.
                  Mit Credits erhältst du sofortigen Zugang zu aktuellen Events.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}