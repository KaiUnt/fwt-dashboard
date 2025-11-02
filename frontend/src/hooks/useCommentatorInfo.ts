'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CommentatorInfo, CommentatorInfoResponse, CommentatorInfoWithAuthor } from '@/types/athletes';
import React from 'react'; // Added for React.useMemo
import { useAccessToken } from '@/providers/AuthProvider';
import { apiFetch, ApiError } from '@/utils/api';
import { useIsOffline } from '@/hooks/useOfflineStorage';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Token is provided via useAccessToken() where needed

// Storage keys
const COMMENTATOR_INFO_STORAGE_KEY = 'commentator-info-cache';
const COMMENTATOR_INFO_SYNC_QUEUE_KEY = 'commentator-info-sync-queue';

// Types for offline storage
interface CommentatorInfoCache {
  [athleteId: string]: CommentatorInfo;
}

interface SyncQueueItem {
  id: string;
  athleteId: string;
  action: 'create' | 'update' | 'delete';
  data?: Partial<CommentatorInfo>;
  timestamp: number;
}

// Helper functions for offline storage
const getCommentatorInfoCache = (): CommentatorInfoCache => {
  if (typeof window === 'undefined') return {};
  try {
    const cached = localStorage.getItem(COMMENTATOR_INFO_STORAGE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const setCommentatorInfoCache = (cache: CommentatorInfoCache): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COMMENTATOR_INFO_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // no-op
  }
};

const getSyncQueue = (): SyncQueueItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const queue = localStorage.getItem(COMMENTATOR_INFO_SYNC_QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  } catch {
    return [];
  }
};

const setSyncQueue = (queue: SyncQueueItem[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COMMENTATOR_INFO_SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to save sync queue:', error);
  }
};

// Offline handled by shared hook useIsOffline

// Online API functions
const fetchCommentatorInfo = async (athleteId: string, getAccessToken: () => Promise<string | null>): Promise<CommentatorInfo | null> => {
  try {
    const data: CommentatorInfoResponse = await apiFetch(`${API_BASE_URL}/api/commentator-info/${athleteId}`, { getAccessToken });
    
    // Handle case where no commentator info exists (data.data is null)
    if (data.data === null) {
      return null;
    }
    
    return data.data || null;
  } catch {
    // Network errors, CORS, etc.
    return null;
  }
};

const _createCommentatorInfo = async (info: Omit<CommentatorInfo, 'id' | 'created_at' | 'updated_at'>, getAccessToken: () => Promise<string | null>): Promise<CommentatorInfo> => {
  const data: CommentatorInfoResponse = await apiFetch(`${API_BASE_URL}/api/commentator-info`, {
    method: 'POST',
    body: info,
    getAccessToken,
  });
  return data.data!;
};

const updateCommentatorInfo = async (athleteId: string, info: Partial<CommentatorInfo>, getAccessToken: () => Promise<string | null>): Promise<CommentatorInfo> => {
  try {
    const data: CommentatorInfoResponse = await apiFetch(`${API_BASE_URL}/api/commentator-info/${athleteId}`, {
      method: 'PUT',
      body: info,
      getAccessToken,
    });
    if (!data.data) {
      throw new Error('Invalid response from server.');
    }
    return data.data;
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        throw new Error('Authentication failed. Please refresh the page and log in again.');
      } else if (error.status === 403) {
        throw new Error('You do not have permission to edit this athlete\'s information.');
      } else if (error.status === 404) {
        throw new Error('Athlete not found.');
      } else if (error.status === 503) {
        throw new Error('Service temporarily unavailable. Please try again later.');
      }
      const detail = (error.detail as unknown as { detail?: string })?.detail;
      if (detail) throw new Error(detail);
    }
    throw error as Error;
  }
};

// Main hook for fetching commentator info
export function useCommentatorInfo(athleteId: string) {
  const isOffline = useIsOffline();
  const { getAccessToken } = useAccessToken();

  return useQuery({
    queryKey: ['commentator-info', athleteId],
    queryFn: async (): Promise<CommentatorInfo | null> => {
      // Try online first if we have internet
      if (!isOffline) {
        try {
          const onlineData = await fetchCommentatorInfo(athleteId, getAccessToken);
          
          // Cache the result
          if (onlineData) {
            const cache = getCommentatorInfoCache();
            cache[athleteId] = onlineData;
            setCommentatorInfoCache(cache);
          }
          
          return onlineData;
        } catch {
          // Fall through to offline cache
        }
      }
      
      // Try offline cache first
      const cache = getCommentatorInfoCache();
      if (cache[athleteId]) {
        return cache[athleteId];
      }
      
      // If not in localStorage cache, try offline event storage
      try {
        // Import dynamically to avoid circular dependencies
        const { offlineStorage } = await import('@/utils/offlineStorage');
        const offlineEvents = await offlineStorage.getAllEvents();
        
        // Look through all offline events for this athlete's commentator info
        for (const event of offlineEvents) {
          if (event.commentatorInfo && event.commentatorInfo[athleteId]) {
            const commentatorDataArray = event.commentatorInfo[athleteId];

            // Return the first item (own data) if available
            if (commentatorDataArray && commentatorDataArray.length > 0) {
              const commentatorData = commentatorDataArray.find(item => item.is_own_data) || commentatorDataArray[0];

              // Add to localStorage cache for faster access next time
              const cache = getCommentatorInfoCache();
              cache[athleteId] = {
                ...commentatorData,
                athlete_id: athleteId,
                id: commentatorData.id || `offline-${athleteId}`,
                created_at: commentatorData.created_at || new Date().toISOString(),
                updated_at: commentatorData.updated_at || new Date().toISOString()
              };
              setCommentatorInfoCache(cache);

              return cache[athleteId];
            }
          }
        }
      } catch {
      }
      
      return null;
    },
    retry: isOffline ? 0 : 0, // No retries to prevent infinite loops
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
  });
}

// Hook for creating/updating commentator info
export function useUpdateCommentatorInfo() {
  const queryClient = useQueryClient();
  const isOffline = useIsOffline();
  const { getAccessToken } = useAccessToken();

  return useMutation({
    mutationFn: async ({ athleteId, info }: { athleteId: string; info: Partial<CommentatorInfo> }) => {
      // Validate input
      if (!athleteId || !info) {
        throw new Error('Invalid input: athleteId and info are required');
      }
      
      if (!isOffline) {
        try {
          // Try online update
          const updatedInfo = await updateCommentatorInfo(athleteId, info, getAccessToken);
          
          // Update cache on successful online update
          const cache = getCommentatorInfoCache();
          cache[athleteId] = updatedInfo;
          setCommentatorInfoCache(cache);
          
          return updatedInfo;
        } catch (err) {
          // Re-throw authentication and permission errors immediately
          if (err instanceof Error && (err.message?.includes('Authentication') || err.message?.includes('permission'))) {
            throw err;
          }
          // For other errors, fall through to offline handling
        }
      } else {
      }
      
      // Offline handling
      const cache = getCommentatorInfoCache();
      const existingInfo = cache[athleteId];
      
      // Create updated info object
      const updatedInfo: CommentatorInfo = {
        id: existingInfo?.id || `offline-${athleteId}`,
        athlete_id: athleteId,
        homebase: info.homebase || existingInfo?.homebase || '',
        team: info.team || existingInfo?.team || '',
        sponsors: info.sponsors || existingInfo?.sponsors || '',
        favorite_trick: info.favorite_trick || existingInfo?.favorite_trick || '',
        achievements: info.achievements || existingInfo?.achievements || '',
        injuries: info.injuries || existingInfo?.injuries || '',
        fun_facts: info.fun_facts || existingInfo?.fun_facts || '',
        notes: info.notes || existingInfo?.notes || '',
        social_media: {
          ...existingInfo?.social_media,
          ...info.social_media,
        },
        created_at: existingInfo?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      // Update cache
      cache[athleteId] = updatedInfo;
      setCommentatorInfoCache(cache);
      
      // Add to sync queue
      const queue = getSyncQueue();
      const queueItem: SyncQueueItem = {
        id: `${athleteId}-${Date.now()}`,
        athleteId,
        action: existingInfo ? 'update' : 'create',
        data: info,
        timestamp: Date.now(),
      };
      
      queue.push(queueItem);
      setSyncQueue(queue);
      
      return updatedInfo;
    },
    onSuccess: (data, variables) => {
      // Update React Query cache - this is what the AthleteCard uses
      queryClient.setQueryData(['commentator-info', variables.athleteId], data);
      
      // Force refetch of the main query that AthleteCard uses
      queryClient.invalidateQueries({ queryKey: ['commentator-info', variables.athleteId] });
      
      // Invalidate all related queries to ensure UI consistency
      queryClient.invalidateQueries({ queryKey: ['commentator-info-with-friends', variables.athleteId] });
      queryClient.invalidateQueries({ queryKey: ['commentator-info-with-friends', variables.athleteId, 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['commentator-info-with-friends', variables.athleteId, 'friends'] });
      queryClient.invalidateQueries({ queryKey: ['commentator-info-with-friends', variables.athleteId, 'all'] });
    },
    onError: (error: unknown, variables) => {
      console.error('Failed to update commentator info for athlete:', variables.athleteId, error);
    },
  });
}

// Hook for syncing offline changes when back online
export function useSyncCommentatorInfo() {
  const queryClient = useQueryClient();
  const { getAccessToken } = useAccessToken();

  return useMutation({
    mutationFn: async () => {
      const queue = getSyncQueue();
      const syncResults: { success: number; failed: number } = { success: 0, failed: 0 };
      
      for (const item of queue) {
        try {
          if (item.action === 'update' || item.action === 'create') {
            await updateCommentatorInfo(item.athleteId, item.data || {}, getAccessToken);
          }
          syncResults.success++;
        } catch (err) {
          console.error(`Failed to sync ${item.action} for athlete ${item.athleteId}:`, err);
          syncResults.failed++;
        }
      }
      
      // Clear successful syncs from queue
      if (syncResults.success > 0) {
        setSyncQueue([]);
      }
      
      return syncResults;
    },
    onSuccess: () => {
      // Invalidate all commentator info queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['commentator-info'] });
    },
  });
}

// Hook to check if there are pending sync items
export function useCommentatorInfoSyncStatus() {
  const queue = getSyncQueue();
  return {
    hasPendingSync: queue.length > 0,
    pendingCount: queue.length,
  };
} 

// Enhanced hook for Friends System
export function useCommentatorInfoWithFriends(athleteId: string, source: 'mine' | 'friends' | 'all' = 'mine') {
  const isOffline = useIsOffline();
  const { getAccessToken } = useAccessToken();

  return useQuery({
    queryKey: ['commentator-info-with-friends', athleteId, source],
    queryFn: async (): Promise<CommentatorInfoWithAuthor[]> => {
      // Try online first if we have internet
      if (!isOffline) {
        try {
          const data = await apiFetch<{ data: CommentatorInfoWithAuthor[] }>(
            `${API_BASE_URL}/api/commentator-info/${athleteId}/friends?source=${source}`,
            { getAccessToken }
          );
          return data.data || [];
        } catch {
          // Fall through to offline cache
        }
      }
      
      // For offline mode, fall back to regular commentator info
      const cache = getCommentatorInfoCache();
      if (cache[athleteId]) {
        return [{
          ...cache[athleteId],
          is_own_data: true,
          created_by: 'current-user',
          author_name: 'You'
        }];
      }
      
      return [];
    },
    retry: isOffline ? 0 : 0,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 2 * 60 * 1000, // 2 minutes for friends data
    gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
  });
}

// Hook to get merged commentator info from all sources
export function useMergedCommentatorInfo(athleteId: string) {
  const { data: myData } = useCommentatorInfoWithFriends(athleteId, 'mine');
  const { data: friendsData } = useCommentatorInfoWithFriends(athleteId, 'friends');
  
  const mergedData = React.useMemo(() => {
    const allData = [...(myData || []), ...(friendsData || [])];
    
    // Create field-wise mapping with author information
    const fieldMapping: Record<string, { value: string; author: string; isOwnData: boolean }> = {};
    
    // Process all data, preferring own data over friends' data
    allData.forEach(item => {
      const authorName = item.is_own_data ? 'You' : (item.author_name || 'Unknown');
      
      if (item.homebase && !fieldMapping.homebase) {
        fieldMapping.homebase = { value: item.homebase, author: authorName, isOwnData: item.is_own_data };
      }
      if (item.team && !fieldMapping.team) {
        fieldMapping.team = { value: item.team, author: authorName, isOwnData: item.is_own_data };
      }
      if (item.sponsors && !fieldMapping.sponsors) {
        fieldMapping.sponsors = { value: item.sponsors, author: authorName, isOwnData: item.is_own_data };
      }
      if (item.favorite_trick && !fieldMapping.favorite_trick) {
        fieldMapping.favorite_trick = { value: item.favorite_trick, author: authorName, isOwnData: item.is_own_data };
      }
      if (item.achievements && !fieldMapping.achievements) {
        fieldMapping.achievements = { value: item.achievements, author: authorName, isOwnData: item.is_own_data };
      }
      if (item.injuries && !fieldMapping.injuries) {
        fieldMapping.injuries = { value: item.injuries, author: authorName, isOwnData: item.is_own_data };
      }
      if (item.fun_facts && !fieldMapping.fun_facts) {
        fieldMapping.fun_facts = { value: item.fun_facts, author: authorName, isOwnData: item.is_own_data };
      }
      if (item.notes && !fieldMapping.notes) {
        fieldMapping.notes = { value: item.notes, author: authorName, isOwnData: item.is_own_data };
      }
      
      // Handle social media fields
      if (item.social_media?.instagram && !fieldMapping.instagram) {
        fieldMapping.instagram = { value: item.social_media.instagram, author: authorName, isOwnData: item.is_own_data };
      }
      if (item.social_media?.youtube && !fieldMapping.youtube) {
        fieldMapping.youtube = { value: item.social_media.youtube, author: authorName, isOwnData: item.is_own_data };
      }
      if (item.social_media?.website && !fieldMapping.website) {
        fieldMapping.website = { value: item.social_media.website, author: authorName, isOwnData: item.is_own_data };
      }
      
      // Handle custom fields
      if (item.custom_fields) {
        Object.entries(item.custom_fields).forEach(([key, value]) => {
          if (value && !fieldMapping[`custom_${key}`]) {
            fieldMapping[`custom_${key}`] = { value: String(value), author: authorName, isOwnData: item.is_own_data };
          }
        });
      }
    });
    
    // Convert back to CommentatorInfo format for compatibility
    const merged: CommentatorInfoWithAuthor = {
      athlete_id: athleteId,
      is_own_data: false,
      homebase: fieldMapping.homebase?.value || '',
      team: fieldMapping.team?.value || '',
      sponsors: fieldMapping.sponsors?.value || '',
      favorite_trick: fieldMapping.favorite_trick?.value || '',
      achievements: fieldMapping.achievements?.value || '',
      injuries: fieldMapping.injuries?.value || '',
      fun_facts: fieldMapping.fun_facts?.value || '',
      notes: fieldMapping.notes?.value || '',
      social_media: {
        instagram: fieldMapping.instagram?.value || '',
        youtube: fieldMapping.youtube?.value || '',
        website: fieldMapping.website?.value || '',
      },
      // Extract custom fields from fieldMapping
      custom_fields: Object.keys(fieldMapping).reduce((acc, key) => {
        if (key.startsWith('custom_')) {
          const customKey = key.replace('custom_', '');
          acc[customKey] = fieldMapping[key].value;
        }
        return acc;
      }, {} as Record<string, string>),
      // Add field mapping for enhanced display
      fieldAuthors: fieldMapping,
    };
    
    return merged;
  }, [myData, friendsData, athleteId]);
  
  return {
    data: mergedData,
    myData,
    friendsData,
    isLoading: false, // Simplified for now
  };
}

// Hook for batch loading commentator info for all athletes in an event
export function useBatchCommentatorInfo(eventId: string, athletes?: Array<{ id: string }>) {
  const isOffline = useIsOffline();
  const { getAccessToken } = useAccessToken();

  return useQuery({
    queryKey: ['batch-commentator-info', eventId],
    queryFn: async (): Promise<Record<string, CommentatorInfoWithAuthor[]>> => {
      // Try online first if we have internet
      if (!isOffline && athletes && athletes.length > 0) {
        try {
          const athleteIds = athletes.map(a => a.id).join(',');
          const data = await apiFetch<{ success: boolean; data: Record<string, CommentatorInfoWithAuthor[]>; total: number }>(
            `${API_BASE_URL}/api/commentator-info/batch?athlete_ids=${athleteIds}&source=all`,
            { getAccessToken }
          );
          return data.data || {};
        } catch (error) {
          console.error('Failed to fetch batch commentator info:', error);
          // Fall through to offline fallback
        }
      }

      // Try offline fallback - read from IndexedDB
      try {
        const { offlineStorage } = await import('@/utils/offlineStorage');
        const offlineEvent = await offlineStorage.getEvent(eventId);

        if (offlineEvent?.commentatorInfo) {
          return offlineEvent.commentatorInfo;
        }
      } catch (error) {
        console.error('Failed to load offline commentator info:', error);
      }

      // Return empty object if no data available
      return {};
    },
    enabled: !!eventId && !!athletes && athletes.length > 0,
    retry: isOffline ? 0 : 2,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,
  });
}

// Hook for bulk import from CSV
export function useBulkImportCommentatorInfo() {
  const queryClient = useQueryClient();
  const { getAccessToken } = useAccessToken();

  return useMutation({
    mutationFn: async (params: {
      data: Array<{
        athlete_id: string;
        homebase?: string;
        team?: string;
        sponsors?: string;
        favorite_trick?: string;
        achievements?: string;
        injuries?: string;
        fun_facts?: string;
        notes?: string;
        instagram?: string;
        youtube?: string;
        website?: string;
        custom_fields?: Record<string, string>;
      }>;
      targetUserId?: string;
    }) => {
      try {
        const url = params.targetUserId 
          ? `${API_BASE_URL}/api/commentator-info/bulk-import?target_user_id=${params.targetUserId}`
          : `${API_BASE_URL}/api/commentator-info/bulk-import`;
          
        const result = await apiFetch(url, {
          method: 'POST',
          body: params.data,
          getAccessToken,
          timeoutMs: 300000, // 5 Minuten für CSV Bulk Import
        });
        return result;
      } catch (error) {
        console.error('Bulk import failed:', error);
        throw error;
      }
    },
    onSuccess: () => {
      // Invalidate all commentator info queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['commentator-info'] });
      queryClient.invalidateQueries({ queryKey: ['commentator-info-with-friends'] });
    },
    onError: (error: unknown) => {
      console.error('Failed to bulk import commentator info:', error);
    },
  });
} 