'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Friend, FriendRequest } from '@/types/athletes';
import { useAccessToken } from '@/providers/AuthProvider';
import { apiFetch, ApiError } from '@/utils/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Friends System API calls
const createFriendsApi = (getAccessToken: () => Promise<string | null>) => ({
  // Get list of accepted friends
  getFriends: async (): Promise<{ success: boolean; data: Friend[]; total: number }> => {
    return await apiFetch(`${API_BASE_URL}/api/friends`, { getAccessToken });
  },

  // Get pending friend requests (received)
  getPendingRequests: async (): Promise<{ success: boolean; data: FriendRequest[]; total: number }> => {
    return await apiFetch(`${API_BASE_URL}/api/friends/pending/received`, { getAccessToken });
  },

  // Get sent friend requests
  getSentRequests: async (): Promise<{ success: boolean; data: FriendRequest[]; total: number }> => {
    return await apiFetch(`${API_BASE_URL}/api/friends/pending/sent`, { getAccessToken });
  },

  // Send friend request
  sendFriendRequest: async (username: string): Promise<{ success: boolean; data: unknown; message: string }> => {
    try {
      return await apiFetch(`${API_BASE_URL}/api/friends/request`, {
        method: 'POST',
        getAccessToken,
        body: { username },
      });
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        const detail = (error.detail as unknown as { detail?: string })?.detail;
        let errorMessage = detail || 'Failed to send friend request';
        switch (error.status) {
          case 400:
            if (detail?.includes?.('yourself')) errorMessage = 'Cannot send friend request to yourself';
            else if (detail?.includes?.('Invalid username')) errorMessage = 'Invalid username format';
            break;
          case 401:
            errorMessage = 'Please log in to send friend requests';
            break;
          case 404:
            errorMessage = 'No user found with this username';
            break;
          case 409:
            errorMessage = 'A friend request has already been sent to this user';
            break;
          case 503:
            errorMessage = 'Service temporarily unavailable. Please try again later.';
            break;
        }
        throw new Error(errorMessage);
      }
      throw error;
    }
  },

  // Accept friend request
  acceptFriendRequest: async (connectionId: string): Promise<{ success: boolean; data: unknown; message: string }> => {
    return await apiFetch(`${API_BASE_URL}/api/friends/accept/${connectionId}`, {
      method: 'PUT',
      getAccessToken,
    });
  },

  // Decline friend request
  declineFriendRequest: async (connectionId: string): Promise<{ success: boolean; data: unknown; message: string }> => {
    return await apiFetch(`${API_BASE_URL}/api/friends/decline/${connectionId}`, {
      method: 'PUT',
      getAccessToken,
    });
  },

  // Remove friend
  removeFriend: async (connectionId: string): Promise<{ success: boolean; message: string }> => {
    return await apiFetch(`${API_BASE_URL}/api/friends/${connectionId}`, {
      method: 'DELETE',
      getAccessToken,
    });
  },

  // Check username availability
  checkUsernameAvailability: async (username: string): Promise<{ available: boolean; reason: string }> => {
    return await apiFetch(`${API_BASE_URL}/api/users/check-username/${encodeURIComponent(username)}`);
  },
});

// Hook to get friends list
export const useFriends = () => {
  const { getAccessToken } = useAccessToken();
  const friendsApi = createFriendsApi(getAccessToken);
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

// Hook to get pending friend requests (received)
export const usePendingFriendRequests = () => {
  const { getAccessToken } = useAccessToken();
  const friendsApi = createFriendsApi(getAccessToken);
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

// Hook to get sent friend requests
export const useSentFriendRequests = () => {
  const { getAccessToken } = useAccessToken();
  const friendsApi = createFriendsApi(getAccessToken);
  return useQuery({
    queryKey: ['sent-friend-requests'],
    queryFn: async () => {
      try {
        return await friendsApi.getSentRequests();
      } catch (error) {
        console.warn('Sent friend requests API failed:', error);
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
  const { getAccessToken } = useAccessToken();
  const friendsApi = createFriendsApi(getAccessToken);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: friendsApi.sendFriendRequest,
    onSuccess: () => {
      // Invalidate and refetch friends list and sent requests
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['pending-friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['sent-friend-requests'] });
    },
  });
};

// Hook to accept friend request
export const useAcceptFriendRequest = () => {
  const { getAccessToken } = useAccessToken();
  const friendsApi = createFriendsApi(getAccessToken);
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
  const { getAccessToken } = useAccessToken();
  const friendsApi = createFriendsApi(getAccessToken);
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
  const { getAccessToken } = useAccessToken();
  const friendsApi = createFriendsApi(getAccessToken);
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: friendsApi.removeFriend,
    onSuccess: () => {
      // Invalidate and refetch friends list
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });
};

// Hook to check username availability
export const useCheckUsernameAvailability = () => {
  const { getAccessToken } = useAccessToken();
  const friendsApi = createFriendsApi(getAccessToken);
  return useMutation({
    mutationFn: friendsApi.checkUsernameAvailability,
  });
};