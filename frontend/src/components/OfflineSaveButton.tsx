'use client';

import { useState, useMemo } from 'react';
import { Download, Check, AlertCircle, Loader2, Trash2, RefreshCw, FileText } from 'lucide-react';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { Athlete, EventInfo, CommentatorInfoWithAuthor } from '@/types/athletes';
import { SeriesData } from '@/hooks/useSeriesRankings';
import { useTranslation } from '@/hooks/useTranslation';
import { generateEventPDF } from '@/utils/pdfGenerator';

interface OfflineSaveButtonProps {
  eventIds: string[];
  athletes: Athlete[];
  eventInfo: EventInfo | EventInfo[];
  seriesRankings?: SeriesData[];
  commentatorInfo?: Record<string, CommentatorInfoWithAuthor[]>;
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
  commentatorInfo,
  className = '',
  variant = 'primary',
  showDetails: _showDetails = true,
  isDataLoading = false
}: OfflineSaveButtonProps) {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfSortBy, setPdfSortBy] = useState<'bib' | 'name'>('bib');
  const {
    isSaving,
    isDeleting,
    saveEventForOffline,
    deleteOfflineEvent,
    getOfflineEventStatus,
    formatFileSize,
    formatTimestamp
  } = useOfflineStorage();

  const offlineStatus = getOfflineEventStatus(eventIds);
  const isAvailable = offlineStatus?.isAvailable || false;
  const isStale = offlineStatus?.isStale || false;

  const handleSave = async () => {
    try {
      await saveEventForOffline(eventIds, athletes, eventInfo, seriesRankings, commentatorInfo);
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
      await saveEventForOffline(eventIds, athletes, eventInfo, seriesRankings, commentatorInfo);
    } catch (error) {
      console.error('Failed to update offline data:', error);
      // TODO: Show error toast
    }
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await generateEventPDF({
        athletes,
        eventInfo,
        seriesRankings,
        commentatorInfo,
        sortBy: pdfSortBy
      });
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    } finally {
      setIsGeneratingPDF(false);
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
              {isStale ? t('offline.offlineStale') : t('offline.offlineAvailableCheck')}
            </span>
          </div>
          
          <button
            onClick={() => setShowModal(true)}
            disabled={isSaving || isDeleting}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title={t('offline.manageOfflineData')}
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
              <h3 className="text-lg font-semibold mb-4">{t('offline.manageOfflineData')}</h3>
              
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Check className="h-5 w-5 text-green-500" />
                    <span className="font-medium">{t('offline.offlineAvailable')}</span>
                    {isStale && (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  
                  {offlineStatus && (
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>{t('offline.athletes')}: {offlineStatus.totalAthletes}</div>
                      <div>{t('offline.size')}: {formatFileSize(offlineStatus.estimatedSize)}</div>
                      <div>{t('offline.savedAt')}: {formatTimestamp(offlineStatus.timestamp)}</div>
                      <div>{t('offline.availableUntil')}: {formatTimestamp(offlineStatus.expiresAt)}</div>
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
                    <span>{t('offline.update')}</span>
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
                    <span>{t('offline.delete')}</span>
                  </button>
                </div>

                {/* PDF Export Section */}
                <div className="border-t pt-4 mt-4">
                  <div className="bg-amber-50 rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <FileText className="h-5 w-5 text-amber-600" />
                      <span className="font-medium text-amber-800">{t('offline.pdfExport.title')}</span>
                    </div>
                    <p className="text-sm text-amber-700 mb-3">{t('offline.pdfExport.description')}</p>

                    <div className="flex items-center space-x-2 mb-3">
                      <span className="text-sm text-gray-600">{t('offline.pdfExport.sortBy')}:</span>
                      <select
                        value={pdfSortBy}
                        onChange={(e) => setPdfSortBy(e.target.value as 'bib' | 'name')}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="bib">{t('offline.pdfExport.sortByBib')}</option>
                        <option value="name">{t('offline.pdfExport.sortByName')}</option>
                      </select>
                    </div>

                    <button
                      onClick={handleDownloadPDF}
                      disabled={isGeneratingPDF || athletes.length === 0}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isGeneratingPDF ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      <span>{isGeneratingPDF ? t('offline.pdfExport.downloading') : t('offline.pdfExport.download')}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {t('offline.close')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4">{t('offline.deleteOfflineDataConfirm')}</h3>
              
              <p className="text-gray-600 mb-6">
                {t('offline.deleteConfirmMessage')}
              </p>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('offline.cancel')}
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
                  <span>{t('offline.delete')}</span>
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
          {isDataLoading ? t('offline.loadingData') : t('offline.saveOffline')}
        </span>
        {/* details removed intentionally */}
      </button>

      {/* Save Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">{t('offline.saveForOffline')}</h3>
            
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium mb-2">{t('offline.dataToBeSaved')}</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• {t('offline.athletesWithBib', { count: athletes.length })}</li>
                  <li>• {t('offline.eventInformation')}</li>
                  {seriesRankings && (
                    <li>• {t('offline.seriesRankings')}</li>
                  )}
                  <li>• {t('offline.commentatorInfo')}</li>
                  <li>• {t('offline.estimatedSize')}: {formatFileSize(estimatedSize)}</li>
                </ul>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="font-medium mb-2">{t('offline.availability')}</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• {t('offline.offlineAvailable48h')}</li>
                  <li>• {t('offline.worksWithoutInternet')}</li>
                  <li>• {t('offline.autoDeleteAfterExpiry')}</li>
                </ul>
              </div>

              {/* PDF Export Section */}
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <FileText className="h-5 w-5 text-amber-600" />
                  <span className="font-medium text-amber-800">{t('offline.pdfExport.title')}</span>
                </div>
                <p className="text-sm text-amber-700 mb-3">{t('offline.pdfExport.description')}</p>

                <div className="flex items-center space-x-2 mb-3">
                  <span className="text-sm text-gray-600">{t('offline.pdfExport.sortBy')}:</span>
                  <select
                    value={pdfSortBy}
                    onChange={(e) => setPdfSortBy(e.target.value as 'bib' | 'name')}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="bib">{t('offline.pdfExport.sortByBib')}</option>
                    <option value="name">{t('offline.pdfExport.sortByName')}</option>
                  </select>
                </div>

                <button
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPDF || athletes.length === 0}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isGeneratingPDF ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  <span>{isGeneratingPDF ? t('offline.pdfExport.downloading') : t('offline.pdfExport.download')}</span>
                </button>
              </div>
            </div>

            <div className="flex space-x-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('offline.cancel')}
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
                <span>{t('offline.save')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 