'use client';

import { useState } from 'react';
import { UserPlus, UserCheck, Mail, Check, X, Users, UserMinus, AlertCircle } from 'lucide-react';
import { useFriends, usePendingFriendRequests, useSendFriendRequest, useAcceptFriendRequest, useDeclineFriendRequest, useRemoveFriend } from '@/hooks/useFriends';
import { useTranslation } from '@/hooks/useTranslation';
import { AppHeader } from '@/components/AppHeader';

// Username validation function
const validateUsername = (username: string): boolean => {
  if (username.length < 2 || username.length > 30) return false;
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) return false;
  if (/^[0-9]+$/.test(username)) return false;
  if (/^[_-]/.test(username) || /[_-]$/.test(username)) return false;
  const reserved = ['admin', 'administrator', 'root', 'system', 'api', 'www', 'ftp', 'mail', 'test', 'user', 'guest', 'null', 'undefined'];
  return !reserved.includes(username.toLowerCase());
};

export default function FriendsPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');

  // Friends System Hooks
  const { data: friends, isLoading: friendsLoading } = useFriends();
  const { data: pendingRequests, isLoading: pendingLoading } = usePendingFriendRequests();
  const sendFriendRequest = useSendFriendRequest();
  const acceptFriendRequest = useAcceptFriendRequest();
  const declineFriendRequest = useDeclineFriendRequest();
  const removeFriend = useRemoveFriend();

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUsername = e.target.value;
    setUsername(newUsername);
    
    // Clear username error when user starts typing
    if (usernameError) {
      setUsernameError('');
    }
  };

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    console.log('🔍 handleSendFriendRequest called');
    e.preventDefault();
    
    console.log('🔍 Username:', username);
    console.log('🔍 Username trimmed:', username.trim());
    console.log('🔍 Username error:', usernameError);
    
    // Clear previous messages
    setError('');
    setMessage('');
    setUsernameError('');

    // Validate username
    if (!username.trim()) {
      console.log('🔍 Username is empty');
      setUsernameError(t('friends.usernameRequired'));
      return;
    }

    if (!validateUsername(username.trim())) {
      console.log('🔍 Username validation failed');
      setUsernameError(t('friends.invalidUsername'));
      return;
    }

    console.log('🔍 Starting friend request...');
    setIsSendingRequest(true);
    
    try {
      console.log('🔍 Calling sendFriendRequest.mutateAsync...');
      await sendFriendRequest.mutateAsync(username.trim());
      console.log('🔍 Friend request successful');
      setUsername('');
      setMessage(t('friends.requestSentSuccess'));
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('🔍 Failed to send friend request:', error);
      
      // Handle specific error cases
      let errorMessage = t('friends.sendRequestError');
      if (error instanceof Error) {
        if (error.message.includes('User not found')) {
          errorMessage = t('friends.userNotFound');
        } else if (error.message.includes('Cannot send friend request to yourself')) {
          errorMessage = t('friends.cannotSendToSelf');
        } else if (error.message.includes('Friend request already exists')) {
          errorMessage = t('friends.requestAlreadyExists');
        } else if (error.message.includes('Authorization token required')) {
          errorMessage = t('friends.loginRequired');
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
      setTimeout(() => setError(''), 5000);
    } finally {
      console.log('🔍 Setting isSendingRequest to false');
      setIsSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (connectionId: string) => {
    setError('');
    setMessage('');
    
    try {
      await acceptFriendRequest.mutateAsync(connectionId);
      setMessage(t('friends.requestAccepted'));
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      setError(error instanceof Error ? error.message : t('friends.acceptRequestError'));
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleDeclineRequest = async (connectionId: string) => {
    setError('');
    setMessage('');
    
    try {
      await declineFriendRequest.mutateAsync(connectionId);
      setMessage(t('friends.requestDeclined'));
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to decline friend request:', error);
      setError(error instanceof Error ? error.message : t('friends.declineRequestError'));
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleRemoveFriend = async (connectionId: string) => {
    setError('');
    setMessage('');
    
    try {
      await removeFriend.mutateAsync(connectionId);
      setMessage(t('friends.friendRemoved'));
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to remove friend:', error);
      setError(error instanceof Error ? error.message : t('friends.removeFriendError'));
      setTimeout(() => setError(''), 5000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader 
        title={t('friends.title')}
        subtitle={t('friends.subtitle')}
        showBackButton={true}
        backUrl="/"
      />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Messages */}
        {message && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            <span className="text-green-700">{message}</span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Friends Overview */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                  <Users className="h-10 w-10" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  {t('friends.networkTitle')}
                </h2>
                <p className="text-gray-500 mb-4">{t('friends.networkSubtitle')}</p>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      <Users className="h-4 w-4" />
                      {t('friends.friendsCount', { count: friends?.data?.length || 0 })}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-center text-sm text-gray-500">
                    <UserCheck className="h-4 w-4 mr-1" />
                    {t('friends.pendingCount', { count: pendingRequests?.data?.length || 0 })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Friends Management */}
          <div className="lg:col-span-2 space-y-8">
            {/* Send Friend Request */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <UserPlus className="h-5 w-5 mr-2" />
                  {t('friends.sendRequestTitle')}
                </h3>
                <p className="text-sm text-gray-500">{t('friends.sendRequestSubtitle')}</p>
              </div>
              
              <form onSubmit={handleSendFriendRequest} className="p-6">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={username}
                      onChange={handleUsernameChange}
                      placeholder={t('friends.usernamePlaceholder')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-950"
                      required
                      maxLength={30}
                      minLength={2}
                    />
                    {usernameError && (
                      <p className="text-red-500 text-xs mt-1">{usernameError}</p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={isSendingRequest || !username.trim() || !!usernameError}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    onClick={() => console.log('🔍 Button clicked!')}
                  >
                    {isSendingRequest ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {t('friends.sending')}
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        {t('friends.sendRequest')}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Pending Requests */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <UserCheck className="h-5 w-5 mr-2" />
                  {t('friends.pendingTitle', { count: pendingRequests?.data?.length || 0 })}
                </h3>
                <p className="text-sm text-gray-500">{t('friends.pendingSubtitle')}</p>
              </div>
              
              <div className="p-6">
                {pendingLoading ? (
                  <div className="text-gray-500 flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                    {t('friends.loadingPending')}
                  </div>
                ) : pendingRequests?.data && pendingRequests.data.length > 0 ? (
                  <div className="space-y-3">
                    {pendingRequests.data.map((request) => (
                      <div key={request.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {request.requester?.full_name || request.requester?.email || t('friends.unknownUser')}
                            </p>
                            <p className="text-sm text-gray-600">
                              {request.requester?.email}
                            </p>
                            <p className="text-xs text-gray-500">
                              {t('friends.requestedOn', { date: new Date(request.created_at).toLocaleDateString() })}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAcceptRequest(request.id)}
                              disabled={acceptFriendRequest.isPending}
                              className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center text-sm"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              {t('friends.accept')}
                            </button>
                            <button
                              onClick={() => handleDeclineRequest(request.id)}
                              disabled={declineFriendRequest.isPending}
                              className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center text-sm"
                            >
                              <X className="h-4 w-4 mr-1" />
                              {t('friends.decline')}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-8">
                    {t('friends.noPendingRequests')}
                  </div>
                )}
              </div>
            </div>

            {/* Friends List */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  {t('friends.myFriendsTitle', { count: friends?.data?.length || 0 })}
                </h3>
                <p className="text-sm text-gray-500">{t('friends.myFriendsSubtitle')}</p>
              </div>
              
              <div className="p-6">
                {friendsLoading ? (
                  <div className="text-gray-500 flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                    {t('friends.loadingFriends')}
                  </div>
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
                              {t('friends.connectedSince', { date: new Date(friend.created_at).toLocaleDateString() })}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemoveFriend(friend.id)}
                            disabled={removeFriend.isPending}
                            className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center text-sm"
                          >
                            <UserMinus className="h-4 w-4 mr-1" />
                            {t('friends.remove')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-8">
                    {t('friends.noFriendsYet')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 