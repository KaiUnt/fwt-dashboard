import { useState, useEffect, useCallback } from 'react'
import { isSupabaseConfigured } from '@/utils/supabase'
import { offlinePurchaseStorage, OfflinePurchaseData } from '@/utils/offlineStorage'
import { useIsOffline } from '@/hooks/useOfflineStorage'

interface CreditTransaction {
  id: string
  transaction_type: string
  amount: number
  credits_before: number
  credits_after: number
  description: string
  created_at: string
  event_id?: string
}

interface CreditPackage {
  package_type: string
  credits: number
  price_cents: number
  price_display: string
}

export function useCredits() {
  const [credits, setCredits] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [initialized, setInitialized] = useState(false)
  const isOffline = useIsOffline()

  const fetchCredits = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        setError('Credits system not available - Supabase not configured')
        return
      }
      
      const { createClient } = await import('@/lib/supabase')
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
      setCredits(data.credits || 0)
    } catch (err) {
      console.error('Error fetching credits:', err)
      setError(err instanceof Error ? err.message : 'Failed to load credits')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTransactions = useCallback(async () => {
    try {
      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        return
      }
      
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) return

      const response = await fetch('/api/credits/transactions', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setTransactions(data.data || [])
      }
    } catch (err) {
      console.error('Error fetching transactions:', err)
    }
  }, [])

  const fetchPackages = useCallback(async () => {
    try {
      const response = await fetch('/api/credits/packages')
      if (response.ok) {
        const data = await response.json()
        setPackages(data.packages || [])
      }
    } catch (err) {
      console.error('Error fetching packages:', err)
    }
  }, [])

  const purchaseEventAccess = useCallback(async (eventIds: string | string[], eventNames?: string | string[]) => {
    try {
      setLoading(true)
      setError(null)
      
      // Normalize inputs to arrays
      const eventIdArray = Array.isArray(eventIds) ? eventIds : [eventIds]
      const eventNameArray = Array.isArray(eventNames) ? eventNames : (eventNames ? [eventNames] : [])
      
      // If offline, save purchase for later sync
      if (isOffline) {
        const offlinePurchase: OfflinePurchaseData = {
          id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          eventIds: eventIdArray,
          eventNames: eventNameArray,
          totalCost: eventIdArray.length,
          userCredits: credits,
          status: 'pending',
          retryCount: 0
        }
        
        // Check if user has enough credits
        if (credits < eventIdArray.length) {
          throw new Error('Nicht genügend Credits verfügbar')
        }
        
        // Save to offline storage
        await offlinePurchaseStorage.savePurchase(offlinePurchase)
        
        // Optimistically update credits
        setCredits(credits - eventIdArray.length)
        
        return {
          success: true,
          message: 'Kauf wurde gespeichert und wird bei der nächsten Internetverbindung verarbeitet',
          credits_remaining: credits - eventIdArray.length,
          purchased_events: eventIdArray,
          offline: true
        }
      }
      
      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        throw new Error('Credits system not available - Supabase not configured')
      }
      
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      // For multi-event purchases, use a different endpoint
      const isMultiEvent = eventIdArray.length > 1
      const endpoint = isMultiEvent ? '/api/events/purchase-multiple' : `/api/events/${eventIdArray[0]}/purchase`

      const requestBody = isMultiEvent 
        ? {
            event_ids: eventIdArray,
            event_names: eventNameArray
          }
        : {
            event_id: eventIdArray[0],
            event_name: eventNameArray[0]
          }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 402) {
          throw new Error('Nicht genügend Credits verfügbar')
        } else if (response.status === 409) {
          throw new Error('Du hast bereits Zugang zu diesem Event')
        } else {
          throw new Error(data.message || 'Fehler beim Kauf')
        }
      }

      // Update credits after successful purchase
      setCredits(data.credits_remaining || 0)
      
      // Refresh transactions to include the new purchase
      await fetchTransactions()

      return {
        success: true,
        message: data.message,
        credits_remaining: data.credits_remaining,
        purchased_events: data.purchased_events || eventIdArray
      }
    } catch (err) {
      throw err
    } finally {
      setLoading(false)
    }
  }, [fetchTransactions, isOffline, credits])

  const checkEventAccess = useCallback(async (eventId: string) => {
    try {
      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        return false
      }
      
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        return false
      }

      const response = await fetch(`/api/events/${eventId}/access`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        return data.has_access || false
      }
      
      return false
    } catch (err) {
      console.error('Error checking event access:', err)
      return false
    }
  }, [])

  // Future: Stripe integration
  const initiatePurchase = useCallback(async (packageType: string) => {
    try {
      // TODO: Implement Stripe Checkout Session creation
      // This would redirect to Stripe checkout or open Stripe modal
      
      const selectedPackage = packages.find(p => p.package_type === packageType)
      if (!selectedPackage) {
        throw new Error('Package not found')
      }

      // For now, show a placeholder
      alert(`Stripe-Integration für ${selectedPackage.price_display} kommt in Phase 2!`)
      
      return {
        success: false,
        message: 'Stripe integration not yet implemented'
      }
    } catch (err) {
      throw err
    }
  }, [packages])

  // Sync offline purchases when coming back online
  const syncOfflinePurchases = useCallback(async () => {
    try {
      const pendingPurchases = await offlinePurchaseStorage.getPendingPurchases()
      
      if (pendingPurchases.length === 0) return
      
      console.log(`Syncing ${pendingPurchases.length} offline purchases...`)
      
      for (const purchase of pendingPurchases) {
        try {
          // Attempt to process the offline purchase
          const result = await purchaseEventAccess(purchase.eventIds, purchase.eventNames)
          
          if (result.success) {
            // Mark as synced and remove from offline storage
            await offlinePurchaseStorage.updatePurchaseStatus(purchase.id, 'synced')
            await offlinePurchaseStorage.deletePurchase(purchase.id)
            console.log(`Successfully synced purchase ${purchase.id}`)
          } else {
            // Mark as failed
            await offlinePurchaseStorage.updatePurchaseStatus(purchase.id, 'failed', 'Sync failed')
          }
        } catch (error) {
          console.error(`Failed to sync purchase ${purchase.id}:`, error)
          await offlinePurchaseStorage.updatePurchaseStatus(
            purchase.id, 
            'failed', 
            error instanceof Error ? error.message : 'Unknown error'
          )
        }
      }
      
      // Refresh credits and transactions after sync
      await fetchCredits()
      await fetchTransactions()
    } catch (error) {
      console.error('Error syncing offline purchases:', error)
    }
  }, [purchaseEventAccess, fetchCredits, fetchTransactions])

  // Only fetch on mount, not on every dependency change
  useEffect(() => {
    if (!initialized) {
      fetchCredits()
      fetchTransactions()
      fetchPackages()
      setInitialized(true)
    }
  }, [initialized, fetchCredits, fetchTransactions, fetchPackages])

  // Sync offline purchases when coming back online
  useEffect(() => {
    if (!isOffline && initialized) {
      syncOfflinePurchases()
    }
  }, [isOffline, initialized, syncOfflinePurchases])

  return {
    credits,
    loading,
    error,
    transactions,
    packages,
    fetchCredits,
    fetchTransactions,
    purchaseEventAccess,
    checkEventAccess,
    initiatePurchase
  }
}

export default useCredits