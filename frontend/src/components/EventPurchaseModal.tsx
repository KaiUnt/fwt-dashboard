'use client';

import { useState } from 'react';
import { X, Coins, Calendar, MapPin, Clock, AlertCircle, Loader2, CreditCard } from 'lucide-react';
import { FWTEvent } from '@/types/events';
import { useTranslation } from '@/hooks/useTranslation';
import { useIsOffline } from '@/hooks/useOfflineStorage';

interface EventPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: FWTEvent[]; // Support for multiple events
  currentCredits: number;
  onPurchase: (eventIds: string[]) => Promise<void>;
  isLoading?: boolean;
}

export function EventPurchaseModal({
  isOpen,
  onClose,
  events,
  currentCredits,
  onPurchase,
  isLoading = false
}: EventPurchaseModalProps) {
  const { t } = useTranslation();
  const isOffline = useIsOffline();
  const [isPurchasing, setIsPurchasing] = useState(false);

  if (!isOpen) return null;

  const isMultiEvent = events.length > 1;
  const totalCost = events.length; // 1 credit per event
  const creditsAfterPurchase = currentCredits - totalCost;
  const hasInsufficientCredits = currentCredits < totalCost;

  const handlePurchase = async () => {
    if (hasInsufficientCredits || isPurchasing) return;

    try {
      setIsPurchasing(true);
      const eventIds = events.map(event => event.id);
      await onPurchase(eventIds);
      onClose();
    } catch (error) {
      console.error('Purchase failed:', error);
      // Error handling will be done in the parent component
    } finally {
      setIsPurchasing(false);
    }
  };

  const formatEventDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {isMultiEvent ? t('purchase.multiEventTitle') : t('purchase.singleEventTitle')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isPurchasing}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Offline Warning */}
          {isOffline && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {t('purchase.offlineWarning')}
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  {t('purchase.offlineDescription')}
                </p>
              </div>
            </div>
          )}

          {/* Event Information */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">
              {isMultiEvent ? t('purchase.eventsLabel') : t('purchase.eventLabel')}
            </h3>
            
            {events.map((event, index) => (
              <div key={event.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">{event.name}</h4>
                    
                    <div className="flex items-center text-sm text-gray-600 space-x-4">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatEventDate(event.date)}</span>
                      </div>
                      
                      <div className="flex items-center space-x-1">
                        <MapPin className="w-4 h-4" />
                        <span>{event.location}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="flex items-center space-x-1 text-sm font-medium text-blue-600">
                      <Coins className="w-4 h-4" />
                      <span>1 {t('credits.credit')}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Credits Summary */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-gray-900 flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <span>{t('purchase.creditsSummary')}</span>
            </h3>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('purchase.currentCredits')}</span>
                <span className="font-medium">{currentCredits}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">
                  {isMultiEvent ? t('purchase.totalCost') : t('purchase.eventCost')}
                </span>
                <span className="font-medium text-red-600">-{totalCost}</span>
              </div>
              
              <div className="border-t pt-2 flex justify-between">
                <span className="font-medium text-gray-900">{t('purchase.creditsAfter')}</span>
                <span className={`font-medium ${creditsAfterPurchase >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {creditsAfterPurchase}
                </span>
              </div>
            </div>
          </div>

          {/* Insufficient Credits Warning */}
          {hasInsufficientCredits && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">
                  {t('purchase.insufficientCredits')}
                </p>
                <p className="text-sm text-red-700 mt-1">
                  {t('purchase.needMoreCredits', { needed: totalCost - currentCredits })}
                </p>
              </div>
            </div>
          )}

          {/* Purchase Benefits */}
          <div className="bg-green-50 rounded-lg p-4">
            <h4 className="font-medium text-green-800 mb-2">
              {t('purchase.benefitsTitle')}
            </h4>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• {t('purchase.permanentAccess')}</li>
              <li>• {t('purchase.offlineAvailable')}</li>
              <li>• {t('purchase.allFeatures')}</li>
              {isMultiEvent && <li>• {t('purchase.multiEventAccess')}</li>}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-6 flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            disabled={isPurchasing}
          >
            {t('common.cancel')}
          </button>
          
          <button
            onClick={handlePurchase}
            disabled={hasInsufficientCredits || isPurchasing || isLoading}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 ${
              hasInsufficientCredits || isPurchasing || isLoading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isPurchasing || isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('purchase.processing')}</span>
              </>
            ) : (
              <>
                <Coins className="w-4 h-4" />
                <span>
                  {isMultiEvent 
                    ? t('purchase.buyEvents', { count: events.length })
                    : t('purchase.buyEvent')
                  }
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
