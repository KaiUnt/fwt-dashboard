'use client';

import { useState } from 'react';
import { UserPlus, UserCheck, UserX, Mail, Check, X, Users, UserMinus } from 'lucide-react';
import { useFriends, usePendingFriendRequests, useSendFriendRequest, useAcceptFriendRequest, useDeclineFriendRequest, useRemoveFriend } from '@/hooks/useFriends';
import { useTranslation } from '@/hooks/useTranslation';

export default function FriendsPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Friends System Hooks
  const { data: friends, isLoading: friendsLoading } = useFriends();
  const { data: pendingRequests, isLoading: pendingLoading } = usePendingFriendRequests();
  const sendFriendRequest = useSendFriendRequest();
  const acceptFriendRequest = useAcceptFriendRequest();
  const declineFriendRequest = useDeclineFriendRequest();
  const removeFriend = useRemoveFriend();

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSendingRequest(true);
    try {
      await sendFriendRequest.mutateAsync(email);
      setEmail('');
    } catch (error) {
      console.error('Failed to send friend request:', error);
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (connectionId: string) => {
    try {
      await acceptFriendRequest.mutateAsync(connectionId);
    } catch (error) {
      console.error('Failed to accept friend request:', error);
    }
  };

  const handleDeclineRequest = async (connectionId: string) => {
    try {
      await declineFriendRequest.mutateAsync(connectionId);
    } catch (error) {
      console.error('Failed to decline friend request:', error);
    }
  };

  const handleRemoveFriend = async (connectionId: string) => {
    try {
      await removeFriend.mutateAsync(connectionId);
    } catch (error) {
      console.error('Failed to remove friend:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Friends Management</h1>
            <p className="text-gray-600 mt-1">
              Connect with other commentators to share athlete information
            </p>
          </div>

          <div className="p-6 space-y-8">
            {/* Send Friend Request */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-blue-900 mb-3 flex items-center">
                <UserPlus className="h-5 w-5 mr-2" />
                Send Friend Request
              </h2>
              <form onSubmit={handleSendFriendRequest} className="flex gap-3">
                <div className="flex-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter friend's email address"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSendingRequest || !email.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isSendingRequest ? (
                    'Sending...'
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Request
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Pending Requests */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <UserCheck className="h-5 w-5 mr-2" />
                Pending Friend Requests ({pendingRequests?.data?.length || 0})
              </h2>
              
              {pendingLoading ? (
                <div className="text-gray-500">Loading pending requests...</div>
              ) : pendingRequests?.data && pendingRequests.data.length > 0 ? (
                <div className="space-y-3">
                  {pendingRequests.data.map((request) => (
                    <div key={request.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {request.requester?.full_name || request.requester?.email || 'Unknown User'}
                          </p>
                          <p className="text-sm text-gray-600">
                            {request.requester?.email}
                          </p>
                          <p className="text-xs text-gray-500">
                            Requested {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptRequest(request.id)}
                            disabled={acceptFriendRequest.isPending}
                            className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center text-sm"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Accept
                          </button>
                          <button
                            onClick={() => handleDeclineRequest(request.id)}
                            disabled={declineFriendRequest.isPending}
                            className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center text-sm"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-center py-8">
                  No pending friend requests
                </div>
              )}
            </div>

            {/* Friends List */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Users className="h-5 w-5 mr-2" />
                My Friends ({friends?.data?.length || 0})
              </h2>
              
              {friendsLoading ? (
                <div className="text-gray-500">Loading friends...</div>
              ) : friends?.data && friends.data.length > 0 ? (
                <div className="space-y-3">
                  {friends.data.map((friend) => (
                    <div key={friend.id} className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {friend.friend.full_name || friend.friend.email}
                          </p>
                          <p className="text-sm text-gray-600">
                            {friend.friend.email}
                          </p>
                          <p className="text-xs text-gray-500">
                            Connected since {new Date(friend.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveFriend(friend.id)}
                          disabled={removeFriend.isPending}
                          className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center text-sm"
                        >
                          <UserMinus className="h-4 w-4 mr-1" />
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-center py-8">
                  No friends yet. Send friend requests to get started!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 