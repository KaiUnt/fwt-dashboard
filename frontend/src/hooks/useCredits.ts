import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isSupabaseConfigured } from '@/utils/supabase'
import { offlinePurchaseStorage, OfflinePurchaseData } from '@/utils/offlineStorage'
import { useIsOffline } from '@/hooks/useOfflineStorage'
import { apiFetch } from '@/utils/api'
import { useAccessToken } from '@/providers/AuthProvider'
import { useTranslation } from '@/providers/TranslationProvider'

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
  const [initialized, setInitialized] = useState(false)
  const isOffline = useIsOffline()
  const { getAccessToken } = useAccessToken()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Balance query
  const balanceQuery = useQuery({
    queryKey: ['credits', 'balance'],
    queryFn: async (): Promise<{ credits: number }> => {
      if (!isSupabaseConfigured()) {
        throw new Error('Credits system not available - Supabase not configured')
      }
      return await apiFetch('/api/credits/balance', { getAccessToken })
    },
    staleTime: 60 * 1000,
    enabled: initialized,
  })

  // Transactions query disabled (not required for API protection mode)
  const transactionsQuery = {
    data: { data: [] as CreditTransaction[] },
    isLoading: false,
    isError: false,
    refetch: async () => ({ data: [] as CreditTransaction[] }),
  } as unknown as ReturnType<typeof useQuery<{ data: CreditTransaction[] }>>

  // Packages query
  const packagesQuery = useQuery({
    queryKey: ['credits', 'packages'],
    queryFn: async (): Promise<{ packages: CreditPackage[] }> => {
      return await apiFetch('/api/credits/packages')
    },
    staleTime: 5 * 60 * 1000,
    enabled: initialized,
  })

  // Stable reference for packages to satisfy hook dependencies
  const packages = useMemo(() => packagesQuery.data?.packages ?? [], [packagesQuery.data])

  const purchaseEventAccess = useCallback(async (eventIds: string | string[], eventNames?: string | string[]) => {
    try {
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
          userCredits: (balanceQuery.data?.credits ?? 0),
          status: 'pending',
          retryCount: 0
        }
        
        // Check if user has enough credits
        const currentCredits = balanceQuery.data?.credits ?? 0
        if (currentCredits < eventIdArray.length) {
          throw new Error('Nicht genügend Credits verfügbar')
        }
        
        // Save to offline storage
        await offlinePurchaseStorage.savePurchase(offlinePurchase)
        
        // Optimistically update credits cache
        queryClient.setQueryData(['credits', 'balance'], { credits: currentCredits - eventIdArray.length })
        
        return {
          success: true,
          message: 'Kauf wurde gespeichert und wird bei der nächsten Internetverbindung verarbeitet',
          credits_remaining: currentCredits - eventIdArray.length,
          purchased_events: eventIdArray,
          offline: true
        }
      }
      
      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        throw new Error('Credits system not available - Supabase not configured')
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

      const data = await apiFetch<{
        message: string;
        credits_remaining: number;
        purchased_events?: string[];
      }>(endpoint, { method: 'POST', body: requestBody, getAccessToken })

      // Invalidate queries after successful purchase
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] }),
        queryClient.invalidateQueries({ queryKey: ['credits', 'transactions'] }),
      ])

      return {
        success: true,
        message: data.message,
        credits_remaining: data.credits_remaining,
        purchased_events: data.purchased_events || eventIdArray
      }
    } catch (err) {
      throw err
    }
  }, [isOffline, balanceQuery.data?.credits, getAccessToken, queryClient])

  const checkEventAccess = useCallback(async (eventId: string) => {
    try {
      if (!isSupabaseConfigured()) return false
      const data = await apiFetch<{ has_access: boolean }>(`/api/events/${eventId}/access`, { getAccessToken })
      return data.has_access || false
    } catch (err) {
      console.error('Error checking event access:', err)
      return false
    }
  }, [getAccessToken])

  // Future: Stripe integration
  const initiatePurchase = useCallback(async (packageType: string) => {
    try {
      // TODO: Implement Stripe Checkout Session creation
      // This would redirect to Stripe checkout or open Stripe modal
      
      const selectedPackage = packages.find((p: CreditPackage) => p.package_type === packageType)
      if (!selectedPackage) {
        throw new Error('Package not found')
      }

      // For now, show a placeholder with contact info
      alert(t('credits.purchase.stripeIntegrationComing', { price: selectedPackage.price_display }))
      
      return {
        success: false,
        message: 'Stripe integration not yet implemented'
      }
    } catch (err) {
      throw err
    }
  }, [packages, t])

  // Sync offline purchases when coming back online
  const syncOfflinePurchases = useCallback(async () => {
    try {
      const pendingPurchases = await offlinePurchaseStorage.getPendingPurchases()
      
      if (pendingPurchases.length === 0) return
      
      
      
      for (const purchase of pendingPurchases) {
        try {
          // Attempt to process the offline purchase
          const result = await purchaseEventAccess(purchase.eventIds, purchase.eventNames)
          
          if (result.success) {
            // Mark as synced and remove from offline storage
            await offlinePurchaseStorage.updatePurchaseStatus(purchase.id, 'synced')
            await offlinePurchaseStorage.deletePurchase(purchase.id)
            
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] }),
        queryClient.invalidateQueries({ queryKey: ['credits', 'transactions'] }),
      ])
    } catch (error) {
      console.error('Error syncing offline purchases:', error)
    }
  }, [purchaseEventAccess, queryClient])

  // Only enable queries on mount once
  useEffect(() => {
    if (!initialized) {
      setInitialized(true)
    }
  }, [initialized])

  // Sync offline purchases when coming back online
  useEffect(() => {
    if (!isOffline && initialized) {
      syncOfflinePurchases()
    }
  }, [isOffline, initialized, syncOfflinePurchases])

  return {
    credits: balanceQuery.data?.credits ?? 0,
    loading: balanceQuery.isLoading || transactionsQuery.isLoading,
    error: (balanceQuery.error as Error | null)?.message ?? null,
    transactions: transactionsQuery.data?.data ?? [],
    packages: packagesQuery.data?.packages ?? [],
    fetchCredits: () => balanceQuery.refetch(),
    fetchTransactions: () => transactionsQuery.refetch(),
    purchaseEventAccess,
    checkEventAccess,
    initiatePurchase
  }
}

export default useCredits