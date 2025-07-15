'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CommentatorInfo, CommentatorInfoResponse } from '@/types/athletes';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
  } catch (error) {
    console.error('Failed to save commentator info cache:', error);
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

// Check if we're offline
const useIsOffline = () => {
  return typeof window !== 'undefined' && 
         typeof navigator !== 'undefined' && 
         navigator.onLine === false;
};

// Online API functions
const fetchCommentatorInfo = async (athleteId: string): Promise<CommentatorInfo | null> => {
  const response = await fetch(`${API_BASE_URL}/api/commentator-info/${athleteId}`);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch commentator info: ${response.status}`);
  }
  const data: CommentatorInfoResponse = await response.json();
  return data.data || null;
};

const createCommentatorInfo = async (info: Omit<CommentatorInfo, 'id' | 'created_at' | 'updated_at'>): Promise<CommentatorInfo> => {
  const response = await fetch(`${API_BASE_URL}/api/commentator-info`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(info),
  });
  if (!response.ok) {
    throw new Error(`Failed to create commentator info: ${response.status}`);
  }
  const data: CommentatorInfoResponse = await response.json();
  return data.data!;
};

const updateCommentatorInfo = async (athleteId: string, info: Partial<CommentatorInfo>): Promise<CommentatorInfo> => {
  const response = await fetch(`${API_BASE_URL}/api/commentator-info/${athleteId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(info),
  });
  if (!response.ok) {
    throw new Error(`Failed to update commentator info: ${response.status}`);
  }
  const data: CommentatorInfoResponse = await response.json();
  return data.data!;
};

// Main hook for fetching commentator info
export function useCommentatorInfo(athleteId: string) {
  const isOffline = useIsOffline();

  return useQuery({
    queryKey: ['commentator-info', athleteId],
    queryFn: async (): Promise<CommentatorInfo | null> => {
      // Try online first if we have internet
      if (!isOffline) {
        try {
          const onlineData = await fetchCommentatorInfo(athleteId);
          // Cache the result
          if (onlineData) {
            const cache = getCommentatorInfoCache();
            cache[athleteId] = onlineData;
            setCommentatorInfoCache(cache);
          }
          return onlineData;
        } catch (error) {
          console.warn('Online fetch failed, trying offline cache:', error);
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
            const commentatorData = event.commentatorInfo[athleteId];
            
            // Add to localStorage cache for faster access next time
            const cache = getCommentatorInfoCache();
            cache[athleteId] = {
              ...commentatorData,
              athlete_id: athleteId,
              id: `offline-${athleteId}`,
              created_at: commentatorData.updated_at || new Date().toISOString(),
              updated_at: commentatorData.updated_at || new Date().toISOString()
            };
            setCommentatorInfoCache(cache);
            
            return cache[athleteId];
          }
        }
      } catch (error) {
        console.warn('Failed to load from offline storage:', error);
      }
      
      return null;
    },
    retry: isOffline ? 0 : 2,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook for creating/updating commentator info
export function useUpdateCommentatorInfo() {
  const queryClient = useQueryClient();
  const isOffline = useIsOffline();

  return useMutation({
    mutationFn: async ({ athleteId, info }: { athleteId: string; info: Partial<CommentatorInfo> }) => {
      if (!isOffline) {
        try {
          // Try online update
          const updatedInfo = await updateCommentatorInfo(athleteId, info);
          
          // Update cache
          const cache = getCommentatorInfoCache();
          cache[athleteId] = updatedInfo;
          setCommentatorInfoCache(cache);
          
          return updatedInfo;
        } catch (error) {
          console.warn('Online update failed, queuing for sync:', error);
          // Fall through to offline handling
        }
      }
      
      // Offline handling
      const cache = getCommentatorInfoCache();
      const existingInfo = cache[athleteId];
      
      const updatedInfo: CommentatorInfo = {
        ...existingInfo,
        ...info,
        athlete_id: athleteId,
        updated_at: new Date().toISOString(),
      };
      
      // Update cache
      cache[athleteId] = updatedInfo;
      setCommentatorInfoCache(cache);
      
      // Add to sync queue
      const queue = getSyncQueue();
      queue.push({
        id: `${athleteId}-${Date.now()}`,
        athleteId,
        action: existingInfo ? 'update' : 'create',
        data: info,
        timestamp: Date.now(),
      });
      setSyncQueue(queue);
      
      return updatedInfo;
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch
      queryClient.setQueryData(['commentator-info', variables.athleteId], data);
    },
  });
}

// Hook for syncing offline changes when back online
export function useSyncCommentatorInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const queue = getSyncQueue();
      const syncResults: { success: number; failed: number } = { success: 0, failed: 0 };
      
      for (const item of queue) {
        try {
          if (item.action === 'update' || item.action === 'create') {
            await updateCommentatorInfo(item.athleteId, item.data || {});
          }
          syncResults.success++;
        } catch (error) {
          console.error(`Failed to sync ${item.action} for athlete ${item.athleteId}:`, error);
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