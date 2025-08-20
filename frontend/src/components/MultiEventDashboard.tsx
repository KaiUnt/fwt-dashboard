'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Keyboard, Trophy, ArrowLeft, RefreshCw } from 'lucide-react';
import { useOfflineMultiEventSeriesRankings } from '@/hooks/useSeriesRankings';
import { AthleteSeriesRankings } from './AthleteSeriesRankings';
import { AthleteCard } from './AthleteCard';
import { AthleteNavigation } from './AthleteNavigation';
import { BibJump } from './BibJump';
import { QuickSearch } from './QuickSearch';
import { PerformanceCurve } from './PerformanceCurve';
import { AthleteEventHistory } from './AthleteEventHistory';
import { useOfflineMultiEventAthletes } from '@/hooks/useOfflineEventAthletes';
import { Athlete } from '@/types/athletes';
import { OfflineSaveButton } from './OfflineSaveButton';



interface MultiEventDashboardProps {
  eventId1: string;
  eventId2: string;
}

interface CombinedAthlete extends Athlete {
  eventSource: string;
  eventName: string;
}

export function MultiEventDashboard({ eventId1, eventId2 }: MultiEventDashboardProps) {
  const router = useRouter();
  const { data: multiEventData, isLoading, error } = useOfflineMultiEventAthletes(eventId1, eventId2);
  
  // Fetch series rankings for both events using offline-first approach
  const { data: multiEventRankings, isLoading: seriesLoading } = useOfflineMultiEventSeriesRankings(eventId1, eventId2);
  
  const [currentAthleteIndex, setCurrentAthleteIndex] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [showBibJump, setShowBibJump] = useState(false);

  // Extract data from multi-event response
  const event1Data = multiEventData?.event1;
  const event2Data = multiEventData?.event2;
  const combinedAthletes: CombinedAthlete[] = useMemo(() => {
    if (!multiEventData?.combined?.athletes) return [];

    // The combined athletes are already sorted by BIB in the hook and have eventSource/eventName
    return multiEventData.combined.athletes as CombinedAthlete[];
  }, [multiEventData]);

  const currentAthlete = combinedAthletes[currentAthleteIndex];
  const hasError = !!error;

  // Navigation callbacks defined before useEffect
  const navigateToNext = useCallback(() => {
    setCurrentAthleteIndex(prev => 
      prev >= combinedAthletes.length - 1 ? 0 : prev + 1
    );
  }, [combinedAthletes.length]);

  const navigateToPrevious = useCallback(() => {
    setCurrentAthleteIndex(prev => 
      prev <= 0 ? combinedAthletes.length - 1 : prev - 1
    );
  }, [combinedAthletes.length]);

  // Get series data for current athlete
  const getAthleteSeriesData = () => {
    if (!currentAthlete) return null;
    
    const eventRankings = currentAthlete.eventSource === eventId1 
      ? multiEventRankings?.event1 
      : multiEventRankings?.event2;
    return eventRankings?.series_rankings || null;
  };

  // Keyboard Navigation (same as single event)
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
        case '/':
          e.preventDefault();
          setShowSearch(true);
          break;
        case 'j':
          e.preventDefault();
          setShowBibJump(true);
          break;
        case 'Escape':
          e.preventDefault();
          setShowSearch(false);
          setShowBibJump(false);
          break;
        case 'Home':
          e.preventDefault();
          setCurrentAthleteIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentAthleteIndex(combinedAthletes.length - 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [combinedAthletes.length, navigateToNext, navigateToPrevious]);

  const jumpToAthlete = (index: number) => {
    if (index >= 0 && index < combinedAthletes.length) {
      setCurrentAthleteIndex(index);
    }
  };

  const jumpToBib = (bib: string) => {
    const index = combinedAthletes.findIndex(athlete => 
      athlete.bib?.toString() === bib
    );
    if (index !== -1) {
      setCurrentAthleteIndex(index);
      setShowBibJump(false);
    }
  };

  const searchAthlete = (query: string) => {
    const index = combinedAthletes.findIndex(athlete =>
      athlete.name.toLowerCase().includes(query.toLowerCase()) ||
      athlete.bib?.toString().includes(query)
    );
    if (index !== -1) {
      setCurrentAthleteIndex(index);
      setShowSearch(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Lade Multi-Event Daten...</p>
        </div>
      </div>
    );
  }

  if (hasError || !event1Data || !event2Data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Events nicht gefunden</h2>
          <p className="text-gray-600 mb-4">
            Ein oder beide Events konnten nicht geladen werden.
          </p>
          <button 
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Zurück zur Event-Auswahl
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/')}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Zurück</span>
              </button>
              
              <div className="h-6 w-px bg-gray-300" />
              
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <Trophy className="h-5 w-5 text-blue-600" />
                  <h1 className="text-2xl font-bold text-gray-900">
                    Multi-Event Dashboard
                  </h1>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>🔴 {event1Data.event.name}</div>
                  <div>🔵 {event2Data.event.name}</div>
                  <div className="text-xs text-gray-500">
                    {combinedAthletes.length} Athleten kombiniert • BIB-sortiert
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top toolbar (right aligned) */}
        <div className="mb-6 flex items-center justify-end space-x-2">
          <button
            onClick={async () => {
              const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
              await Promise.all([
                fetch(`${API_BASE_URL}/api/events/${eventId1}/athletes?force_refresh=true`),
                fetch(`${API_BASE_URL}/api/events/${eventId2}/athletes?force_refresh=true`),
                fetch(`${API_BASE_URL}/api/series/rankings/${eventId1}?force_refresh=true`),
                fetch(`${API_BASE_URL}/api/series/rankings/${eventId2}?force_refresh=true`),
              ]);
            }}
            className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="text-sm">Aktualisieren</span>
          </button>

          <button
            onClick={() => setShowBibJump(true)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title="BIB Jump (j)"
          >
            <Keyboard className="h-5 w-5" />
          </button>

          <OfflineSaveButton
            eventIds={[eventId1, eventId2]}
            athletes={combinedAthletes}
            eventInfo={[event1Data.event, event2Data.event]}
            seriesRankings={multiEventRankings?.combined?.series_rankings || []}
            isDataLoading={isLoading || seriesLoading}
            variant="secondary"
            showDetails={false}
          />
        </div>

        {/* Mobile Layout with specific order */}
        <div className="block lg:hidden space-y-6">
          {/* Toolbar above list (mobile) */}
          <div className="flex items-center justify-end space-x-2">
            <button
              onClick={async () => {
                const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                await Promise.all([
                  fetch(`${API_BASE_URL}/api/events/${eventId1}/athletes?force_refresh=true`),
                  fetch(`${API_BASE_URL}/api/events/${eventId2}/athletes?force_refresh=true`),
                  fetch(`${API_BASE_URL}/api/series/rankings/${eventId1}?force_refresh=true`),
                  fetch(`${API_BASE_URL}/api/series/rankings/${eventId2}?force_refresh=true`),
                ]);
              }}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title="Aktualisieren"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="text-sm">Aktualisieren</span>
            </button>

            <button
              onClick={() => setShowBibJump(true)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="BIB Jump (j)"
            >
              <Keyboard className="h-5 w-5" />
            </button>

            <OfflineSaveButton
              eventIds={[eventId1, eventId2]}
              athletes={combinedAthletes}
              eventInfo={[event1Data.event, event2Data.event]}
              seriesRankings={multiEventRankings?.combined?.series_rankings || []}
              isDataLoading={isLoading || seriesLoading}
              variant="secondary"
              showDetails={false}
            />
          </div>

          {/* 1. Athlete Directory - Always show first */}
          <AthleteNavigation
            athletes={combinedAthletes}
            currentIndex={currentAthleteIndex}
            onNavigate={jumpToAthlete}
          />
          
          {currentAthlete && (
            <>
              {/* 2. Athlete Info with Event Indicator */}
              <div className="relative">
                {/* Event Source Indicator */}
                <div className="absolute -top-3 left-4 z-10">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    currentAthlete.eventSource === eventId1 
                      ? 'bg-red-100 text-red-800 border border-red-200'
                      : 'bg-blue-100 text-blue-800 border border-blue-200'
                  }`}>
                    {currentAthlete.eventName}
                  </span>
                </div>
                <AthleteCard 
                  athlete={currentAthlete} 
                  eventInfo={{
                    name: currentAthlete.eventName,
                    date: currentAthlete.eventSource === eventId1 ? event1Data.event.date : event2Data.event.date,
                    id: currentAthlete.eventSource,
                    status: 'active'
                  }}
                />
                
                {/* Event History */}
                <AthleteEventHistory 
                  athleteId={currentAthlete.id} 
                  eventId={currentAthlete.eventSource}
                />
              </div>
              
              {/* 3. Performance Curve and Series Rankings */}
              {getAthleteSeriesData() && (
                <div className="space-y-4">
                  <PerformanceCurve
                    athleteId={currentAthlete.id}
                    athleteName={currentAthlete.name}
                    seriesData={getAthleteSeriesData()!}
                  />
                  <AthleteSeriesRankings
                    athleteId={currentAthlete.id}
                    athleteName={currentAthlete.name}
                    seriesData={getAthleteSeriesData()!}
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
               <div className="relative">
                 {/* Event Source Indicator */}
                 <div className="absolute -top-3 left-4 z-10">
                   <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                     currentAthlete.eventSource === eventId1 
                       ? 'bg-red-100 text-red-800 border border-red-200'
                       : 'bg-blue-100 text-blue-800 border border-blue-200'
                   }`}>
                     {currentAthlete.eventName}
                   </span>
                 </div>
                 <AthleteCard 
                   athlete={currentAthlete} 
                   eventInfo={{
                     name: currentAthlete.eventName,
                     date: currentAthlete.eventSource === eventId1 ? event1Data.event.date : event2Data.event.date,
                     id: currentAthlete.eventSource,
                     status: 'active'
                   }}
                 />
                 
                 {/* Event History */}
                 <div className="mt-4">
                   <AthleteEventHistory 
                     athleteId={currentAthlete.id} 
                     eventId={currentAthlete.eventSource}
                   />
                 </div>
                 
                 {/* Enhanced Multi-Series Rankings */}
                 {getAthleteSeriesData() && currentAthlete && (
                   <AthleteSeriesRankings
                     athleteId={currentAthlete.id}
                     athleteName={currentAthlete.name}
                     seriesData={getAthleteSeriesData()!}
                     className="mt-4"
                   />
                 )}
               </div>
             )}
           </div>

           {/* Navigation Sidebar */}
           <div className="w-80 space-y-4">
             {/* Toolbar above list (desktop) */}
             <div className="flex items-center justify-end space-x-2">
               <button
                 onClick={async () => {
                   const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                   await Promise.all([
                     fetch(`${API_BASE_URL}/api/events/${eventId1}/athletes?force_refresh=true`),
                     fetch(`${API_BASE_URL}/api/events/${eventId2}/athletes?force_refresh=true`),
                     fetch(`${API_BASE_URL}/api/series/rankings/${eventId1}?force_refresh=true`),
                     fetch(`${API_BASE_URL}/api/series/rankings/${eventId2}?force_refresh=true`),
                   ]);
                 }}
                 className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                 title="Aktualisieren"
               >
                 <RefreshCw className="h-4 w-4" />
                 <span className="text-sm">Aktualisieren</span>
               </button>

               <button
                 onClick={() => setShowBibJump(true)}
                 className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                 title="BIB Jump (j)"
               >
                 <Keyboard className="h-5 w-5" />
               </button>

               <OfflineSaveButton
                 eventIds={[eventId1, eventId2]}
                 athletes={combinedAthletes}
                 eventInfo={[event1Data.event, event2Data.event]}
                 seriesRankings={multiEventRankings?.combined?.series_rankings || []}
                 isDataLoading={isLoading || seriesLoading}
                 variant="secondary"
                 showDetails={false}
               />
             </div>

             <AthleteNavigation
               athletes={combinedAthletes}
               currentIndex={currentAthleteIndex}
               onNavigate={jumpToAthlete}
             />
             
             {/* Performance Curve */}
             {getAthleteSeriesData() && currentAthlete && (
               <PerformanceCurve
                 athleteId={currentAthlete.id}
                 athleteName={currentAthlete.name}
                 seriesData={getAthleteSeriesData()!}
               />
             )}
           </div>
        </div>
      </div>

      {/* Search Modal */}
      {showSearch && (
        <QuickSearch
          athletes={combinedAthletes}
          onSearch={searchAthlete}
          onClose={() => setShowSearch(false)}
        />
      )}

             {/* BIB Jump Modal */}
       {showBibJump && (
         <BibJump
           athletes={combinedAthletes}
           onJump={jumpToBib}
           onClose={() => setShowBibJump(false)}
         />
       )}
    </div>
  );
} 