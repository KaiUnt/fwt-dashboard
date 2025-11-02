'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  offlineStorage, 
  OfflineEventData,
  createEventId,
  parseEventId,
  calculateEstimatedSize,
  formatFileSize,
  getExpirationDate,
  isDataStale,
  formatTimestamp
} from '@/utils/offlineStorage';
import { Athlete, EventInfo, CommentatorInfoWithAuthor } from '@/types/athletes';
import { SeriesData } from './useSeriesRankings';

export interface OfflineEventStatus {
  id: string;
  isAvailable: boolean;
  isStale: boolean;
  timestamp: string;
  expiresAt: string;
  totalAthletes: number;
  estimatedSize: number;
  eventData: {
    events: Array<{
      id: string;
      name: string;
      date: string;
      location?: string;
    }>;
  };
}

export interface SaveOfflineOptions {
  hoursUntilExpiration?: number;
  includeSeriesRankings?: boolean;
}

let sharedInitializationPromise: Promise<void> | null = null;
let sharedInitialized = false;

async function ensureOfflineStorageInitialized() {
  if (sharedInitialized) {
    return;
  }

  if (!sharedInitializationPromise) {
    sharedInitializationPromise = (async () => {
      await offlineStorage.init();
      await offlineStorage.cleanupExpiredEvents();
      sharedInitialized = true;
    })()
      .catch(error => {
        sharedInitialized = false;
        throw error;
      })
      .finally(() => {
        sharedInitializationPromise = null;
      });
  }

  return sharedInitializationPromise;
}

export function useOfflineStorage() {
  const [isInitialized, setIsInitialized] = useState(false);
  // Defer IndexedDB heavy reads until after initial paint/idle to avoid blocking initial UI
  const [deferLoad, setDeferLoad] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  // Initialize storage on mount
  useEffect(() => {
    let cancelled = false;
    const initStorage = async () => {
      try {
        await ensureOfflineStorageInitialized();
        if (!cancelled) {
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('Failed to initialize offline storage:', error);
        if (!cancelled) {
          setIsInitialized(false);
        }
      }
    };

    initStorage();
    // Defer heavy getAll() until after first paint / when the browser is idle
    // Use requestIdleCallback when available to avoid jank; fallback to timeout
    if (typeof window !== 'undefined') {
      const ric = (window as unknown as { requestIdleCallback?: (cb: IdleRequestCallback, opts?: { timeout?: number }) => number }).requestIdleCallback;
      const schedule = (cb: () => void) => {
        if (typeof ric === 'function') {
          ric(() => cb(), { timeout: 1500 });
        } else {
          setTimeout(cb, 0);
        }
      };
      schedule(() => setDeferLoad(true));
    } else {
      setDeferLoad(true);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Query for offline events
  const { data: offlineEvents = [], refetch: refetchOfflineEvents } = useQuery({
    queryKey: ['offline-events'],
    queryFn: async () => {
      if (!isInitialized) return [];
      return await offlineStorage.getAllEvents();
    },
    // Load only after init AND after initial paint/idle
    enabled: isInitialized && deferLoad,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes (metadata changes rarely)
    gcTime: 10 * 60 * 1000,
  });

  // Query for storage stats
  const { data: storageStats } = useQuery({
    queryKey: ['offline-storage-stats'],
    queryFn: async () => {
      if (!isInitialized) return null;
      return await offlineStorage.getStorageStats();
    },
    enabled: isInitialized && deferLoad,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });

  // Save event data for offline use
  const saveEventForOffline = useCallback(async (
    eventIds: string[],
    athletes: Athlete[],
    eventInfo: EventInfo | EventInfo[],
    seriesRankings?: SeriesData[],
    commentatorInfo?: Record<string, CommentatorInfoWithAuthor[]>,
    options: SaveOfflineOptions = {}
  ): Promise<void> => {
    if (!isInitialized) {
      throw new Error('Offline storage not initialized');
    }

    setIsSaving(true);

    try {
      const {
        hoursUntilExpiration = 48,
        includeSeriesRankings = true
      } = options;

      const offlineEventId = createEventId(eventIds);
      const now = new Date().toISOString();
      const expiresAt = getExpirationDate(hoursUntilExpiration);

      // Prepare event data
      const events = Array.isArray(eventInfo) ? eventInfo : [eventInfo];
      const eventData = {
        events: events.map(event => ({
          id: event.id,
          name: event.name,
          date: event.date,
          location: event.name.includes(',') ? event.name.split(',')[1]?.trim() : undefined
        }))
      };

      // Calculate estimated size including commentator info
      const estimatedSize = calculateEstimatedSize(
        athletes,
        includeSeriesRankings ? seriesRankings : [],
        commentatorInfo || {}
      );

      const offlineData: OfflineEventData = {
        id: offlineEventId,
        type: eventIds.length === 1 ? 'single' : 'multi',
        timestamp: now,
        expiresAt,
        eventData,
        athletes,
        seriesRankings: includeSeriesRankings ? seriesRankings : undefined,
        commentatorInfo: commentatorInfo,
        totalAthletes: athletes.length,
        estimatedSize
      };

      await offlineStorage.saveEvent(offlineData);

      // Refresh offline events query
      await refetchOfflineEvents();

      // Invalidate storage stats
      queryClient.invalidateQueries({ queryKey: ['offline-storage-stats'] });
      queryClient.setQueryData(['offline-event-data', offlineEventId], offlineData);

    } catch (error) {
      console.error('Failed to save event for offline use:', error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [isInitialized, refetchOfflineEvents, queryClient]);

  // Get offline event data
  const getOfflineEvent = useCallback(async (eventId: string): Promise<OfflineEventData | null> => {
    if (!isInitialized) return null;
    
    try {
      return await offlineStorage.getEvent(eventId);
    } catch (error) {
      console.error('Failed to get offline event:', error);
      return null;
    }
  }, [isInitialized]);

  // Delete offline event
  const deleteOfflineEvent = useCallback(async (eventId: string): Promise<void> => {
    if (!isInitialized) {
      throw new Error('Offline storage not initialized');
    }

    setIsDeleting(true);
    
    try {
      await offlineStorage.deleteEvent(eventId);
      
      // Refresh offline events query
      await refetchOfflineEvents();
      
      // Invalidate storage stats
      queryClient.invalidateQueries({ queryKey: ['offline-storage-stats'] });
      queryClient.removeQueries({ queryKey: ['offline-event-data', eventId] });

    } catch (error) {
      console.error('Failed to delete offline event:', error);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  }, [isInitialized, refetchOfflineEvents, queryClient]);

  // Clear all offline data
  const clearAllOfflineData = useCallback(async (): Promise<void> => {
    if (!isInitialized) {
      throw new Error('Offline storage not initialized');
    }

    setIsDeleting(true);
    
    try {
      await offlineStorage.clearAllData();
      
      // Refresh offline events query
      await refetchOfflineEvents();
      
      // Invalidate storage stats
      queryClient.invalidateQueries({ queryKey: ['offline-storage-stats'] });
      queryClient.removeQueries({ queryKey: ['offline-event-data'] });

    } catch (error) {
      console.error('Failed to clear offline data:', error);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  }, [isInitialized, refetchOfflineEvents, queryClient]);

  // Get status for specific event(s)
  const getOfflineEventStatus = useCallback((eventIds: string[]): OfflineEventStatus | null => {
    const offlineEventId = createEventId(eventIds);
    const offlineEvent = offlineEvents.find(event => event.id === offlineEventId);
    
    if (!offlineEvent) return null;
    
    return {
      id: offlineEventId,
      isAvailable: true,
      isStale: isDataStale(offlineEvent.timestamp),
      timestamp: offlineEvent.timestamp,
      expiresAt: offlineEvent.expiresAt,
      totalAthletes: offlineEvent.totalAthletes,
      estimatedSize: offlineEvent.estimatedSize,
      eventData: offlineEvent.eventData
    };
  }, [offlineEvents]);

  // Check if event is available offline
  const isEventAvailableOffline = useCallback((eventIds: string[]): boolean => {
    const status = getOfflineEventStatus(eventIds);
    return status?.isAvailable || false;
  }, [getOfflineEventStatus]);

  // Get all offline event statuses for display
  const getOfflineEventStatuses = useCallback((): OfflineEventStatus[] => {
    return offlineEvents.map(event => ({
      id: event.id,
      isAvailable: true,
      isStale: isDataStale(event.timestamp),
      timestamp: event.timestamp,
      expiresAt: event.expiresAt,
      totalAthletes: event.totalAthletes,
      estimatedSize: event.estimatedSize,
      eventData: event.eventData
    }));
  }, [offlineEvents]);

  // Format helpers
  const formatEventName = useCallback((eventData: OfflineEventData): string => {
    if (eventData.type === 'single') {
      return eventData.eventData.events[0]?.name || 'Unknown Event';
    } else {
      const eventNames = eventData.eventData.events.map(e => e.name);
      return `Multi-Event: ${eventNames.join(' + ')}`;
    }
  }, []);

  const formatEventDate = useCallback((eventData: OfflineEventData): string => {
    const dates = eventData.eventData.events.map(e => e.date);
    const uniqueDates = [...new Set(dates)];
    
    if (uniqueDates.length === 1) {
      return new Date(uniqueDates[0]).toLocaleDateString('de-DE');
    } else {
      return uniqueDates.map(date => new Date(date).toLocaleDateString('de-DE')).join(', ');
    }
  }, []);

  return {
    // State
    isInitialized,
    isSaving,
    isDeleting,
    offlineEvents,
    storageStats,
    
    // Actions
    saveEventForOffline,
    getOfflineEvent,
    deleteOfflineEvent,
    clearAllOfflineData,
    
    // Queries
    getOfflineEventStatus,
    isEventAvailableOffline,
    getOfflineEventStatuses,
    
    // Formatters
    formatEventName,
    formatEventDate,
    formatFileSize,
    formatTimestamp,
    
    // Utilities
    parseEventId,
    isDataStale
  };
}

// Hook for checking if we're in offline mode
export function useIsOffline() {
  const [isOffline, setIsOffline] = useState(false);
  
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    // Set initial state
    setIsOffline(!navigator.onLine);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return isOffline;
} 
