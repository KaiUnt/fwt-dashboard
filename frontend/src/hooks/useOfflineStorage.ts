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
import { Athlete, EventInfo } from '@/types/athletes';
import { SeriesData } from './useSeriesRankings';

interface CommentatorInfo {
  homebase?: string;
  team?: string;
  sponsors?: string;
  favorite_trick?: string;
  achievements?: string;
  injuries?: string;
  fun_facts?: string;
  notes?: string;
  social_media?: {
    instagram?: string;
    youtube?: string;
    website?: string;
  };
  updated_at?: string;
}

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

export function useOfflineStorage() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  // Initialize storage on mount
  useEffect(() => {
    const initStorage = async () => {
      try {
        await offlineStorage.init();
        // Cleanup expired events
        await offlineStorage.cleanupExpiredEvents();
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize offline storage:', error);
        setIsInitialized(false);
      }
    };

    initStorage();
  }, []);

  // Query for offline events
  const { data: offlineEvents = [], refetch: refetchOfflineEvents } = useQuery({
    queryKey: ['offline-events'],
    queryFn: async () => {
      if (!isInitialized) return [];
      return await offlineStorage.getAllEvents();
    },
    enabled: isInitialized,
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Query for storage stats
  const { data: storageStats } = useQuery({
    queryKey: ['offline-storage-stats'],
    queryFn: async () => {
      if (!isInitialized) return null;
      return await offlineStorage.getStorageStats();
    },
    enabled: isInitialized,
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000, // 1 minute
  });

  // Save event data for offline use
  const saveEventForOffline = useCallback(async (
    eventIds: string[],
    athletes: Athlete[],
    eventInfo: EventInfo | EventInfo[],
    seriesRankings?: SeriesData[],
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

      // Collect commentator info from localStorage cache
      const commentatorInfoCache: Record<string, CommentatorInfo> = {};
      try {
        const cachedCommentatorInfo = localStorage.getItem('commentator-info-cache');
        if (cachedCommentatorInfo) {
          const parsedCache = JSON.parse(cachedCommentatorInfo);
          
          // Only include commentator info for athletes in this event
          athletes.forEach(athlete => {
            if (parsedCache[athlete.id]) {
              commentatorInfoCache[athlete.id] = {
                homebase: parsedCache[athlete.id].homebase,
                team: parsedCache[athlete.id].team,
                sponsors: parsedCache[athlete.id].sponsors,
                favorite_trick: parsedCache[athlete.id].favorite_trick,
                achievements: parsedCache[athlete.id].achievements,
                injuries: parsedCache[athlete.id].injuries,
                fun_facts: parsedCache[athlete.id].fun_facts,
                notes: parsedCache[athlete.id].notes,
                social_media: parsedCache[athlete.id].social_media,
                updated_at: parsedCache[athlete.id].updated_at
              };
            }
          });
        }
      } catch {
      }

      // Calculate estimated size including commentator info
      const estimatedSize = calculateEstimatedSize(
        athletes, 
        includeSeriesRankings ? seriesRankings : [],
        commentatorInfoCache
      );

      const offlineData: OfflineEventData = {
        id: offlineEventId,
        type: eventIds.length === 1 ? 'single' : 'multi',
        timestamp: now,
        expiresAt,
        eventData,
        athletes,
        seriesRankings: includeSeriesRankings ? seriesRankings : undefined,
        commentatorInfo: Object.keys(commentatorInfoCache).length > 0 ? commentatorInfoCache : undefined,
        totalAthletes: athletes.length,
        estimatedSize
      };

      await offlineStorage.saveEvent(offlineData);
      
      // Refresh offline events query
      await refetchOfflineEvents();
      
      // Invalidate storage stats
      queryClient.invalidateQueries({ queryKey: ['offline-storage-stats'] });
      
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