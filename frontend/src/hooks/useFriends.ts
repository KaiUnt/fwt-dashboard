'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Friend, FriendRequest } from '@/types/athletes';
import { createClient } from '@/lib/supabase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Helper function to get auth token
const getAuthToken = async (): Promise<string | null> => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
};

// Friends System API calls
const friendsApi = {
  // Get list of accepted friends
  getFriends: async (): Promise<{ success: boolean; data: Friend[]; total: number }> => {
    const token = await getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/friends`, { headers });
    if (!response.ok) {
      throw new Error('Failed to fetch friends');
    }
    return response.json();
  },

  // Get pending friend requests
  getPendingRequests: async (): Promise<{ success: boolean; data: FriendRequest[]; total: number }> => {
    const token = await getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/friends/pending`, { headers });
    if (!response.ok) {
      throw new Error('Failed to fetch pending requests');
    }
    return response.json();
  },

  // Send friend request
  sendFriendRequest: async (email: string): Promise<{ success: boolean; data: unknown; message: string }> => {
    const token = await getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/friends/request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to send friend request');
    }
    return response.json();
  },

  // Accept friend request
  acceptFriendRequest: async (connectionId: string): Promise<{ success: boolean; data: unknown; message: string }> => {
    const token = await getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/friends/accept/${connectionId}`, {
      method: 'PUT',
      headers,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to accept friend request');
    }
    return response.json();
  },

  // Decline friend request
  declineFriendRequest: async (connectionId: string): Promise<{ success: boolean; data: unknown; message: string }> => {
    const token = await getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/friends/decline/${connectionId}`, {
      method: 'PUT',
      headers,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to decline friend request');
    }
    return response.json();
  },

  // Remove friend
  removeFriend: async (connectionId: string): Promise<{ success: boolean; message: string }> => {
    const token = await getAuthToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/friends/${connectionId}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to remove friend');
    }
    return response.json();
  },
};

// Hook to get friends list
export const useFriends = () => {
  return useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      try {
        return await friendsApi.getFriends();
      } catch (error) {
        console.warn('Friends API failed:', error);
        // If friends API fails, return empty response to prevent UI crashes
        return { success: true, data: [], total: 0 };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry friends API failures
  });
};

// Hook to get pending friend requests
export const usePendingFriendRequests = () => {
  return useQuery({
    queryKey: ['pending-friend-requests'],
    queryFn: async () => {
      try {
        return await friendsApi.getPendingRequests();
      } catch (error) {
        console.warn('Pending friend requests API failed:', error);
        // If friends API fails, return empty response to prevent UI crashes
        return { success: true, data: [], total: 0 };
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: false, // Don't retry friends API failures
  });
};

// Hook to send friend request
export const useSendFriendRequest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: friendsApi.sendFriendRequest,
    onSuccess: () => {
      // Invalidate and refetch friends list
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['pending-friend-requests'] });
    },
  });
};

// Hook to accept friend request
export const useAcceptFriendRequest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: friendsApi.acceptFriendRequest,
    onSuccess: () => {
      // Invalidate and refetch friends list and pending requests
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['pending-friend-requests'] });
    },
  });
};

// Hook to decline friend request
export const useDeclineFriendRequest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: friendsApi.declineFriendRequest,
    onSuccess: () => {
      // Invalidate and refetch pending requests
      queryClient.invalidateQueries({ queryKey: ['pending-friend-requests'] });
    },
  });
};

// Hook to remove friend
export const useRemoveFriend = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: friendsApi.removeFriend,
    onSuccess: () => {
      // Invalidate and refetch friends list
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
}; 