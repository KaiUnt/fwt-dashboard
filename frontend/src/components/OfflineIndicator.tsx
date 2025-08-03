'use client';

import { WifiOff, Shield, Database } from 'lucide-react';
import { useOfflineSupport } from '@/hooks/useOfflineAuth';
import { useOfflineStorage, useIsOffline } from '@/hooks/useOfflineStorage';

export function OfflineIndicator() {
  const { hasOfflineAuth, authSource } = useOfflineSupport();
  const isOffline = useIsOffline();
  const { getOfflineEventStatuses } = useOfflineStorage();
  
  const offlineEvents = getOfflineEventStatuses();

  // Don't show indicator if online
  if (!isOffline) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div className="bg-amber-50 border border-amber-200 rounded-lg shadow-lg p-4">
        <div className="flex items-start space-x-3">
          <WifiOff className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="text-sm font-medium text-amber-800">
                Offline-Modus
              </h3>
              {hasOfflineAuth && (
                <Shield className="h-4 w-4 text-green-600" />
              )}
            </div>
            
            <div className="text-xs text-amber-700 space-y-1">
              <p>
                {hasOfflineAuth 
                  ? '✅ Angemeldet (Offline-Cache)'
                  : '❌ Nicht angemeldet'
                }
              </p>
              
              {offlineEvents.length > 0 && (
                <p className="flex items-center space-x-1">
                  <Database className="h-3 w-3" />
                  <span>{offlineEvents.length} Events offline verfügbar</span>
                </p>
              )}
              
              {authSource === 'offline' && (
                <p className="text-amber-600 text-xs mt-2">
                  💡 Bei Internetverbindung bitte neu anmelden
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}