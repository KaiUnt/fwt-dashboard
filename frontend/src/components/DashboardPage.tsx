'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useOfflineSeriesRankings } from '@/hooks/useSeriesRankings';
import { AthleteSeriesRankings } from './AthleteSeriesRankings';
import { AthleteCard } from './AthleteCard';
import { AthleteNavigation } from './AthleteNavigation';
import { BibJump } from './BibJump';
import { PerformanceCurve } from './PerformanceCurve';
import { useOfflineEventAthletes } from '@/hooks/useOfflineEventAthletes';
import { OfflineSaveButton } from './OfflineSaveButton';
import { AthleteEventHistory } from './AthleteEventHistory';
import { AppHeader } from './AppHeader';
import { useTranslation } from '@/hooks/useTranslation';
import { useAccessToken } from '@/providers/AuthProvider';
import { apiFetch } from '@/utils/api';
import { useBatchCommentatorInfo } from '@/hooks/useCommentatorInfo';


interface DashboardPageProps {
  eventId: string;
}

export function DashboardPage({ eventId }: DashboardPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { getAccessToken } = useAccessToken();
  const { data: athletesData, isLoading, error, refetch: refetchAthletes } = useOfflineEventAthletes(eventId);
  const { data: seriesData, isLoading: seriesLoading, refetch: refetchSeries } = useOfflineSeriesRankings(eventId);
  const { data: commentatorData, isLoading: commentatorLoading, refetch: _refetchCommentatorInfo } = useBatchCommentatorInfo(eventId, athletesData?.athletes);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentAthleteIndex, setCurrentAthleteIndex] = useState(0);
  const [showBibJump, setShowBibJump] = useState(false);

  const athletes = athletesData?.athletes || [];
  const currentAthlete = athletes[currentAthleteIndex];

  // Debug logging
  console.log('[DashboardPage] commentatorData:', commentatorData);
  console.log('[DashboardPage] commentatorLoading:', commentatorLoading);
  console.log('[DashboardPage] currentAthlete:', currentAthlete);
  if (currentAthlete) {
    console.log('[DashboardPage] commentatorInfo for current athlete:', commentatorData?.[currentAthlete.id]);
  }

  // Navigation callbacks defined before useEffect
  const navigateToNext = useCallback(() => {
    setCurrentAthleteIndex(prev => 
      prev >= athletes.length - 1 ? 0 : prev + 1
    );
  }, [athletes.length]);

  const navigateToPrevious = useCallback(() => {
    setCurrentAthleteIndex(prev => 
      prev <= 0 ? athletes.length - 1 : prev - 1
    );
  }, [athletes.length]);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable element
      const target = e.target as HTMLElement | null;
      if (
        target && (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable
        )
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
        case 'h':
          e.preventDefault();
          navigateToPrevious();
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          navigateToNext();
          break;
        case 'j':
          e.preventDefault();
          setShowBibJump(true);
          break;
        case 'Escape':
          e.preventDefault();
          setShowBibJump(false);
          break;
        case 'Home':
          e.preventDefault();
          setCurrentAthleteIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentAthleteIndex(athletes.length - 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [athletes.length, navigateToNext, navigateToPrevious]);

  const jumpToAthlete = (index: number) => {
    if (index >= 0 && index < athletes.length) {
      setCurrentAthleteIndex(index);
    }
  };

  const jumpToBib = (bib: string) => {
    const index = athletes.findIndex(athlete => 
      athlete.bib?.toString() === bib
    );
    if (index !== -1) {
      setCurrentAthleteIndex(index);
      setShowBibJump(false);
    }
  };


  if (isLoading || commentatorLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">
            {isLoading && t('dashboard.loadingAthletes')}
            {!isLoading && commentatorLoading && 'Loading commentator info...'}
          </p>
        </div>
      </div>
    );
  }

  if (error || !athletesData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('dashboard.eventNotFound')}</h2>
          <p className="text-gray-600 mb-4">
            {t('dashboard.eventLoadError')}
          </p>
          <button 
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('dashboard.backToEventSelection')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <AppHeader 
        title={athletesData.event.name}
        showBackButton={true}
        backUrl="/"
      >
        <div className="text-sm text-gray-500 flex items-center">
        </div>
      </AppHeader>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Mobile Layout with specific order */}
        <div className="block lg:hidden space-y-6">
          {/* Toolbar above list (mobile) */}
          <div className="flex items-center justify-end space-x-2">
            <button
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                  await Promise.all([
                    apiFetch(`${API_BASE_URL}/api/events/${eventId}/athletes?force_refresh=true`, { getAccessToken }).then(() => refetchAthletes()),
                    apiFetch(`${API_BASE_URL}/api/series/rankings/${eventId}?force_refresh=true`, { getAccessToken }).then(() => refetchSeries())
                  ]);
                } finally {
                  setIsRefreshing(false);
                }
              }}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${isRefreshing ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              title={t('buttons.reload')}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm">{t('buttons.reload')}</span>
            </button>

            <OfflineSaveButton
              eventIds={[eventId]}
              athletes={athletes}
              eventInfo={athletesData.event}
              seriesRankings={seriesData?.series_rankings}
              commentatorInfo={commentatorData}
              isDataLoading={isLoading || seriesLoading || commentatorLoading}
              variant="secondary"
              showDetails={false}
            />
          </div>

          {currentAthlete && (
            <>
              {/* 1. Athlete Directory */}
              <AthleteNavigation
                athletes={athletes}
                currentIndex={currentAthleteIndex}
                onNavigate={jumpToAthlete}
              />
              
              {/* 2. Athlete Info (Name, Birth, Commentator Field) */}
              <AthleteCard
                athlete={currentAthlete}
                eventInfo={athletesData.event}
                athletes={athletes}
                commentatorInfo={commentatorData?.[currentAthlete.id] || []}
              />
              
              {/* 3. Event History */}
              <AthleteEventHistory 
                athleteId={currentAthlete.id} 
                eventId={eventId}
              />
              
              {/* 4. Performance Curve, Best Series, Best Events */}
              {seriesData?.series_rankings && (
                <div className="space-y-4">
                  <PerformanceCurve
                    athleteId={currentAthlete.id}
                    athleteName={currentAthlete.name}
                    seriesData={seriesData.series_rankings}
                  />
                  <AthleteSeriesRankings
                    athleteId={currentAthlete.id}
                    athleteName={currentAthlete.name}
                    seriesData={seriesData.series_rankings}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Desktop Layout */}
        <div className="hidden lg:flex lg:flex-row gap-8">
          {/* Athlete Card */}
          <div className="flex-1">
            {currentAthlete && (
              <>
                <AthleteCard
                  athlete={currentAthlete}
                  eventInfo={athletesData.event}
                  athletes={athletes}
                  commentatorInfo={commentatorData?.[currentAthlete.id] || []}
                />
                
                {/* Event History Section */}
                <div className="mt-6">
                  <AthleteEventHistory 
                    athleteId={currentAthlete.id} 
                    eventId={eventId}
                  />
                </div>
                
                {/* Enhanced Multi-Series Rankings */}
                {seriesData?.series_rankings && currentAthlete && (
                  <AthleteSeriesRankings
                    athleteId={currentAthlete.id}
                    athleteName={currentAthlete.name}
                    seriesData={seriesData.series_rankings}
                    className="mt-4"
                  />
                )}
              </>
            )}
          </div>

          {/* Navigation Sidebar */}
          <div className="w-80 space-y-4">
            {/* Toolbar above list (desktop) */}
            <div className="flex items-center justify-end space-x-2">
              <button
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                    await Promise.all([
                      apiFetch(`${API_BASE_URL}/api/events/${eventId}/athletes?force_refresh=true`, { getAccessToken }).then(() => refetchAthletes()),
                      apiFetch(`${API_BASE_URL}/api/series/rankings/${eventId}?force_refresh=true`, { getAccessToken }).then(() => refetchSeries())
                    ]);
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${isRefreshing ? 'bg-gray-200 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                title={t('buttons.reload')}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="text-sm">{t('buttons.reload')}</span>
              </button>

              <OfflineSaveButton
                eventIds={[eventId]}
                athletes={athletes}
                eventInfo={athletesData.event}
                seriesRankings={seriesData?.series_rankings}
                commentatorInfo={commentatorData}
                isDataLoading={isLoading || seriesLoading || commentatorLoading}
                variant="secondary"
                showDetails={false}
              />
            </div>

            <AthleteNavigation
              athletes={athletes}
              currentIndex={currentAthleteIndex}
              onNavigate={jumpToAthlete}
            />
            
            {/* Performance Curve */}
            {seriesData?.series_rankings && currentAthlete && (
              <PerformanceCurve
                athleteId={currentAthlete.id}
                athleteName={currentAthlete.name}
                seriesData={seriesData.series_rankings}
              />
            )}
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2">
          <div className="flex items-center space-x-2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg border">
            <button
              onClick={navigateToPrevious}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
              title="Vorheriger Athlet (←)"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            
            <div className="px-3 py-1 text-sm text-gray-800 font-semibold">
              {currentAthlete?.bib && `BIB ${currentAthlete.bib}`}
            </div>
            
            <button
              onClick={navigateToNext}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
              title={t('buttons.next')}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Help */}
        <div className="fixed bottom-6 right-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border text-xs text-gray-800">
            <div className="font-bold mb-1 text-gray-900">Shortcuts:</div>
            <div className="font-medium">← → Navigation</div>
            <div className="font-medium">J Athleten suchen</div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showBibJump && (
        <BibJump
          athletes={athletes}
          onJump={jumpToBib}
          onClose={() => setShowBibJump(false)}
        />
      )}
    </div>
  );
} 