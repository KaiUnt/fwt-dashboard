'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CommentatorInfo, CommentatorInfoResponse, CommentatorInfoWithAuthor } from '@/types/athletes';
import React from 'react'; // Added for React.useMemo
import { createClient } from '@/lib/supabase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Helper function to get auth token
const getAuthToken = async (): Promise<string | null> => {
  try {
    const supabase = createClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ Supabase auth error:', error);
      return null;
    }
    
    if (!session) {
      console.log('ℹ️ No active session found');
      return null;
    }
    
    if (!session.access_token) {
      console.warn('⚠️ Session exists but no access token');
      return null;
    }
    
    console.log('✅ Auth token retrieved successfully');
    return session.access_token;
  } catch (error) {
    console.error('❌ Error getting auth token:', error);
    return null;
  }
};

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
  const isOffline = typeof window !== 'undefined' && 
         typeof navigator !== 'undefined' && 
         navigator.onLine === false;
  
  // Log offline status for debugging
  if (typeof window !== 'undefined') {
    console.log(`🌐 Online status: ${navigator.onLine ? 'Online' : 'Offline'}`);
  }
  
  return isOffline;
};

// Online API functions
const fetchCommentatorInfo = async (athleteId: string): Promise<CommentatorInfo | null> => {
  try {
    const token = await getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    console.log(`🔍 Fetching commentator info for athlete ${athleteId}`);
    console.log(`🔑 Token available: ${!!token}`);
    console.log(`🔑 Token length: ${token ? token.length : 0}`);
    console.log(`🌐 API URL: ${API_BASE_URL}/api/commentator-info/${athleteId}`);
    console.log(`📤 Request headers:`, headers);
    
    const response = await fetch(`${API_BASE_URL}/api/commentator-info/${athleteId}`, { headers });
    
    console.log(`📡 Response status: ${response.status}`);
    console.log(`📡 Response ok: ${response.ok}`);
    console.log(`📡 Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      // Handle expected cases where no commentator info exists
      if (response.status === 404 || response.status === 503) {
        console.log(`ℹ️ No commentator info available for athlete ${athleteId} (${response.status})`);
        return null;
      }
      
      // Log more details for other errors
      const errorText = await response.text();
      console.error(`❌ API Error for athlete ${athleteId}:`, {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText
      });
      
      throw new Error(`Failed to fetch commentator info: ${response.status} - ${errorText}`);
    }
    
    const data: CommentatorInfoResponse = await response.json();
    console.log(`✅ Successfully fetched commentator info for athlete ${athleteId}:`, data);
    
    // Handle case where no commentator info exists (data.data is null)
    if (data.data === null) {
      console.log(`ℹ️ No commentator info found for athlete ${athleteId}`);
      return null;
    }
    
    return data.data || null;
  } catch (error) {
    // Network errors, CORS, etc.
    console.warn(`⚠️ Commentator info fetch failed for athlete ${athleteId}:`, error);
    return null;
  }
};

const _createCommentatorInfo = async (info: Omit<CommentatorInfo, 'id' | 'created_at' | 'updated_at'>): Promise<CommentatorInfo> => {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE_URL}/api/commentator-info`, {
    method: 'POST',
    headers,
    body: JSON.stringify(info),
  });
  if (!response.ok) {
    throw new Error(`Failed to create commentator info: ${response.status}`);
  }
  const data: CommentatorInfoResponse = await response.json();
  return data.data!;
};

const updateCommentatorInfo = async (athleteId: string, info: Partial<CommentatorInfo>): Promise<CommentatorInfo> => {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (!token) {
    throw new Error('Authentication required. Please log in again.');
  }
  
  headers['Authorization'] = `Bearer ${token}`;
  
  const response = await fetch(`${API_BASE_URL}/api/commentator-info/${athleteId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(info),
  });
  
  if (!response.ok) {
    let errorMessage = `Failed to update commentator info: ${response.status}`;
    
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = errorData.detail;
      }
    } catch (parseError) {
      // If we can't parse the error response, use the default message
      console.warn('Could not parse error response:', parseError);
    }
    
    // Handle specific status codes
    if (response.status === 401) {
      throw new Error('Authentication failed. Please refresh the page and log in again.');
    } else if (response.status === 403) {
      throw new Error('You do not have permission to edit this athlete\'s information.');
    } else if (response.status === 404) {
      throw new Error('Athlete not found.');
    } else if (response.status === 503) {
      throw new Error('Service temporarily unavailable. Please try again later.');
    }
    
    throw new Error(errorMessage);
  }
  
  const data: CommentatorInfoResponse = await response.json();
  
  if (!data.data) {
    throw new Error('Invalid response from server.');
  }
  return data.data;
};

// Main hook for fetching commentator info
export function useCommentatorInfo(athleteId: string) {
  const isOffline = useIsOffline();

  return useQuery({
    queryKey: ['commentator-info', athleteId],
    queryFn: async (): Promise<CommentatorInfo | null> => {
      console.log(`🔄 Starting commentator info fetch for athlete ${athleteId}`);
      console.log(`🌐 Offline mode: ${isOffline}`);
      console.log(`🔄 Query function executing for athlete ${athleteId}`);
      
      // Try online first if we have internet
      if (!isOffline) {
        try {
          console.log(`🌐 Attempting online fetch for athlete ${athleteId}`);
          const onlineData = await fetchCommentatorInfo(athleteId);
          
          console.log(`📦 Online data received for athlete ${athleteId}:`, onlineData);
          
          // Cache the result
          if (onlineData) {
            console.log(`💾 Caching online data for athlete ${athleteId}`);
            const cache = getCommentatorInfoCache();
            cache[athleteId] = onlineData;
            setCommentatorInfoCache(cache);
          }
          
          console.log(`✅ Online fetch completed for athlete ${athleteId}:`, onlineData);
          return onlineData;
        } catch (error) {
          console.warn(`⚠️ Online fetch failed for athlete ${athleteId}, trying offline cache:`, error);
          // Fall through to offline cache
        }
      }
      
      // Try offline cache first
      console.log(`📦 Checking offline cache for athlete ${athleteId}`);
      const cache = getCommentatorInfoCache();
      if (cache[athleteId]) {
        console.log(`✅ Found cached data for athlete ${athleteId}:`, cache[athleteId]);
        return cache[athleteId];
      }
      
      // If not in localStorage cache, try offline event storage
      try {
        console.log(`📦 Checking offline event storage for athlete ${athleteId}`);
        // Import dynamically to avoid circular dependencies
        const { offlineStorage } = await import('@/utils/offlineStorage');
        const offlineEvents = await offlineStorage.getAllEvents();
        
        // Look through all offline events for this athlete's commentator info
        for (const event of offlineEvents) {
          if (event.commentatorInfo && event.commentatorInfo[athleteId]) {
            const commentatorData = event.commentatorInfo[athleteId];
            console.log(`✅ Found offline event data for athlete ${athleteId}:`, commentatorData);
            
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
        console.warn(`⚠️ Failed to load from offline storage for athlete ${athleteId}:`, error);
      }
      
      console.log(`ℹ️ No commentator info found for athlete ${athleteId}`);
      console.log(`✅ Query function completed for athlete ${athleteId}, returning null`);
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

  return useMutation({
    mutationFn: async ({ athleteId, info }: { athleteId: string; info: Partial<CommentatorInfo> }) => {
      // Validate input
      if (!athleteId || !info) {
        throw new Error('Invalid input: athleteId and info are required');
      }
      
      if (!isOffline) {
        try {
          // Try online update
          const updatedInfo = await updateCommentatorInfo(athleteId, info);
          
          // Update cache on successful online update
          const cache = getCommentatorInfoCache();
          cache[athleteId] = updatedInfo;
          setCommentatorInfoCache(cache);
          
          return updatedInfo;
        } catch (error: unknown) {
          
          // Re-throw authentication and permission errors immediately
          if (error instanceof Error && (error.message?.includes('Authentication') || error.message?.includes('permission'))) {
            throw error;
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
      console.log('=== MUTATION SUCCESS CALLBACK DEBUG ===');
      console.log('Mutation success data:', data);
      console.log('Variables (athleteId):', variables.athleteId);
      console.log('Data type:', typeof data);
      console.log('Data content:', data);
      
      // Update React Query cache - this is what the AthleteCard uses
      console.log('🔄 Setting query data in cache...');
      queryClient.setQueryData(['commentator-info', variables.athleteId], data);
      
      // Check what's now in cache
      const cacheData = queryClient.getQueryData(['commentator-info', variables.athleteId]);
      console.log('📦 Data now in cache:', cacheData);
      
      // Force refetch of the main query that AthleteCard uses
      console.log('🔄 Invalidating queries...');
      queryClient.invalidateQueries({ queryKey: ['commentator-info', variables.athleteId] });
      
      // Invalidate all related queries to ensure UI consistency
      queryClient.invalidateQueries({ queryKey: ['commentator-info-with-friends', variables.athleteId] });
      queryClient.invalidateQueries({ queryKey: ['commentator-info-with-friends', variables.athleteId, 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['commentator-info-with-friends', variables.athleteId, 'friends'] });
      queryClient.invalidateQueries({ queryKey: ['commentator-info-with-friends', variables.athleteId, 'all'] });
      
      // Also update the basic commentator info query for backwards compatibility
      queryClient.invalidateQueries({ queryKey: ['commentator-info'] });
      
      console.log('✅ Cache operations completed for athlete:', variables.athleteId);
    },
    onError: (error: unknown, variables) => {
      console.error('Failed to update commentator info for athlete:', variables.athleteId, error);
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

// Enhanced hook for Friends System
export function useCommentatorInfoWithFriends(athleteId: string, source: 'mine' | 'friends' | 'all' = 'mine') {
  const isOffline = useIsOffline();

  return useQuery({
    queryKey: ['commentator-info-with-friends', athleteId, source],
    queryFn: async (): Promise<CommentatorInfoWithAuthor[]> => {
      // Try online first if we have internet
      if (!isOffline) {
        try {
          const token = await getAuthToken();
          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          const response = await fetch(`${API_BASE_URL}/api/commentator-info/${athleteId}/friends?source=${source}`, { headers });
          
          if (!response.ok) {
            if (response.status === 404 || response.status === 503) {
              console.log(`No commentator info available for athlete ${athleteId} (${response.status})`);
              return [];
            }
            throw new Error(`Failed to fetch commentator info: ${response.status}`);
          }
          
          const data = await response.json();
          return data.data || [];
        } catch (error) {
          console.warn('Online fetch failed, trying offline cache:', error);
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
    
    // Group by field and merge
    const merged: CommentatorInfoWithAuthor = {
      athlete_id: athleteId,
      is_own_data: false,
      homebase: '',
      team: '',
      sponsors: '',
      favorite_trick: '',
      achievements: '',
      injuries: '',
      fun_facts: '',
      notes: '',
      social_media: {},
    };
    
    // Merge fields, preferring own data over friends' data
    allData.forEach(item => {
      if (item.homebase && !merged.homebase) merged.homebase = item.homebase;
      if (item.team && !merged.team) merged.team = item.team;
      if (item.sponsors && !merged.sponsors) merged.sponsors = item.sponsors;
      if (item.favorite_trick && !merged.favorite_trick) merged.favorite_trick = item.favorite_trick;
      if (item.achievements && !merged.achievements) merged.achievements = item.achievements;
      if (item.injuries && !merged.injuries) merged.injuries = item.injuries;
      if (item.fun_facts && !merged.fun_facts) merged.fun_facts = item.fun_facts;
      if (item.notes && !merged.notes) merged.notes = item.notes;
      if (item.social_media) {
        merged.social_media = { ...merged.social_media, ...item.social_media };
      }
    });
    
    return merged;
  }, [myData, friendsData, athleteId]);
  
  return {
    data: mergedData,
    myData,
    friendsData,
    isLoading: false, // Simplified for now
  };
} 