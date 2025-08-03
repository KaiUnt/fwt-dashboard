'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';

export interface OfflineAuthState {
  isOnline: boolean;
  isOffline: boolean;
  hasValidAuth: boolean;
  hasOfflineAuth: boolean;
  authSource: 'online' | 'offline' | 'none';
}

export function useOfflineAuth(): OfflineAuthState {
  const { user, isOfflineAuthValid } = useAuth();
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Initial online status
    setIsOnline(navigator.onLine);

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const hasValidAuth = !!user || isOfflineAuthValid;
  const authSource = user ? 'online' : isOfflineAuthValid ? 'offline' : 'none';

  return {
    isOnline,
    isOffline: !isOnline,
    hasValidAuth,
    hasOfflineAuth: isOfflineAuthValid,
    authSource
  };
}

// Helper hook for components that need offline-aware behavior
export function useOfflineSupport() {
  const authState = useOfflineAuth();
  
  return {
    ...authState,
    canAccessOfflineData: authState.hasValidAuth,
    shouldShowOfflineIndicator: authState.isOffline && authState.hasOfflineAuth,
    authStatus: authState.isOffline 
      ? (authState.hasOfflineAuth ? 'offline-authenticated' : 'offline-unauthenticated')
      : (authState.hasValidAuth ? 'online-authenticated' : 'online-unauthenticated')
  };
}