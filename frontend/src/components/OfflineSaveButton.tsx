'use client';

import { useState, useMemo } from 'react';
import { Download, Check, AlertCircle, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { Athlete, EventInfo } from '@/types/athletes';

interface OfflineSaveButtonProps {
  eventIds: string[];
  athletes: Athlete[];
  eventInfo: EventInfo | EventInfo[];
  seriesRankings?: any[];
  className?: string;
  variant?: 'primary' | 'secondary';
  showDetails?: boolean;
  isDataLoading?: boolean;
}

export function OfflineSaveButton({
  eventIds,
  athletes,
  eventInfo,
  seriesRankings,
  className = '',
  variant = 'primary',
  showDetails = true,
  isDataLoading = false
}: OfflineSaveButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const {
    isSaving,
    isDeleting,
    saveEventForOffline,
    deleteOfflineEvent,
    getOfflineEventStatus,
    formatFileSize,
    formatTimestamp,
    isDataStale
  } = useOfflineStorage();

  const offlineStatus = getOfflineEventStatus(eventIds);
  const isAvailable = offlineStatus?.isAvailable || false;
  const isStale = offlineStatus?.isStale || false;

  const handleSave = async () => {
    try {
      await saveEventForOffline(eventIds, athletes, eventInfo, seriesRankings);
      setShowModal(false);
    } catch (error) {
      console.error('Failed to save offline:', error);
      // TODO: Show error toast
    }
  };

  const handleDelete = async () => {
    try {
      const offlineEventId = eventIds.length === 1 ? eventIds[0] : `multi_${eventIds.join('_')}`;
      await deleteOfflineEvent(offlineEventId);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete offline data:', error);
      // TODO: Show error toast
    }
  };

  const handleUpdate = async () => {
    try {
      // Delete existing and save new
      const offlineEventId = eventIds.length === 1 ? eventIds[0] : `multi_${eventIds.join('_')}`;
      await deleteOfflineEvent(offlineEventId);
      await saveEventForOffline(eventIds, athletes, eventInfo, seriesRankings);
    } catch (error) {
      console.error('Failed to update offline data:', error);
      // TODO: Show error toast
    }
  };

  // Improved size estimation with optimized debug logging
  const estimatedSize = useMemo(() => {
    const athletesSize = athletes.length * 0.5; // 0.5KB per athlete  
    const seriesSize = seriesRankings ? JSON.stringify(seriesRankings).length / 1024 : 0; // Actual size in KB
    const totalKB = athletesSize + seriesSize;
    
    return Math.round(totalKB / 1024 * 100) / 100; // Convert to MB
  }, [athletes.length, seriesRankings]);



  // Button variants
  const baseClasses = "flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors";
  const variantClasses = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white",
    secondary: "bg-gray-100 hover:bg-gray-200 text-gray-700"
  };

  if (isAvailable) {
    return (
      <>
        <div className={`flex items-center space-x-2 ${className}`}>
          <div className={`${baseClasses} ${variantClasses[variant]} ${isSaving || isDeleting ? 'opacity-50' : ''}`}>
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-sm">
              {isStale ? '⚠️ Offline (veraltet)' : '✅ Offline verfügbar'}
            </span>
          </div>
          
          <button
            onClick={() => setShowModal(true)}
            disabled={isSaving || isDeleting}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="Offline-Daten verwalten"
          >
            {isSaving || isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Management Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4">Offline-Daten verwalten</h3>
              
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Check className="h-5 w-5 text-green-500" />
                    <span className="font-medium">Offline verfügbar</span>
                    {isStale && (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  
                  {offlineStatus && (
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Athleten: {offlineStatus.totalAthletes}</div>
                      <div>Größe: {formatFileSize(offlineStatus.estimatedSize)}</div>
                      <div>Gespeichert: {formatTimestamp(offlineStatus.timestamp)}</div>
                      <div>Verfügbar bis: {formatTimestamp(offlineStatus.expiresAt)}</div>
                    </div>
                  )}
                </div>
                
                <div className="flex space-x-2">
                  <button
                    onClick={handleUpdate}
                    disabled={isSaving || isDeleting}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span>Aktualisieren</span>
                  </button>
                  
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isSaving || isDeleting}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span>Löschen</span>
                  </button>
                </div>
              </div>
              
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4">Offline-Daten löschen?</h3>
              
              <p className="text-gray-600 mb-6">
                Diese Aktion kann nicht rückgängig gemacht werden. Die Offline-Daten werden dauerhaft gelöscht.
              </p>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span>Löschen</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={isSaving || isDataLoading}
        className={`${baseClasses} ${variantClasses[variant]} ${(isSaving || isDataLoading) ? 'opacity-50' : ''} ${className}`}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isDataLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span>
          {isDataLoading ? 'Lade Daten...' : 'Offline speichern'}
        </span>
        {showDetails && !isDataLoading && (
          <span className="text-xs opacity-75">
            ({athletes.length} Athleten{seriesRankings ? ` + Rankings` : ''})
          </span>
        )}
      </button>

      {/* Save Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Für Offline speichern</h3>
            
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Folgende Daten werden gespeichert:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• {athletes.length} Athleten mit BIB-Nummern</li>
                  <li>• Event-Informationen</li>
                  {seriesRankings && (
                    <li>• Series Rankings (2008-2025)</li>
                  )}
                  <li>• Kommentatoren-Infos (falls vorhanden)</li>
                  <li>• Geschätzte Größe: {formatFileSize(estimatedSize)}</li>
                </ul>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Verfügbarkeit:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Offline verfügbar für 48 Stunden</li>
                  <li>• Funktioniert ohne Internetverbindung</li>
                  <li>• Automatische Löschung nach Ablauf</li>
                </ul>
              </div>
            </div>
            
            <div className="flex space-x-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>Speichern</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 