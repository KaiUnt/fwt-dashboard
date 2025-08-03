'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { Search, Calendar, Loader2, ToggleLeft, ToggleRight, Eye, History, Clock, RefreshCw, Download, Trash2 } from 'lucide-react';
import { EventCard } from './EventCard';
import { SearchInput } from './SearchInput';
import { FilterTabs } from './FilterTabs';

import { useEvents } from '@/hooks/useEvents';
import { FWTEvent } from '@/types/events';
import { useQueryClient } from '@tanstack/react-query';
import { useOfflineStorage, useIsOffline } from '@/hooks/useOfflineStorage';
import { useTranslation } from '@/hooks/useTranslation';


export function EventsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [includePastEvents, setIncludePastEvents] = useState(false);
  const { data: eventsData, isLoading, error } = useEvents(includePastEvents);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [isMultiEventMode, setIsMultiEventMode] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Offline functionality
  const isOffline = useIsOffline();
  const { 
    getOfflineEventStatuses, 
    deleteOfflineEvent, 
    formatTimestamp,
    formatFileSize,
    parseEventId,
    isDataStale
  } = useOfflineStorage();
  
  const offlineEvents = getOfflineEventStatuses();

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate both current and past events queries
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      // Wait a bit to show the refresh animation
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      setIsRefreshing(false);
    }
  };

  // Enhance events with past/future status (Frontend-only solution)
  const eventsWithStatus = useMemo(() => {
    const rawEvents = eventsData?.events || [];
    const now = new Date();
    // Grace period: Events are considered "past" only after 4 days
    // This accounts for potential event postponements/rescheduling
    const gracePeriod = 4 * 24 * 60 * 60 * 1000; // 4 days in milliseconds
    const cutoffDate = new Date(now.getTime() - gracePeriod);
    
    return rawEvents.map(event => ({
      ...event,
      is_past: new Date(event.date) < cutoffDate,
      status: new Date(event.date) < cutoffDate ? 'completed' as const : 'upcoming' as const
    }));
  }, [eventsData]);

  const events = eventsWithStatus;

  // Get unique years for filter
  const availableYears = useMemo(() => {
    const years = [...new Set(events.map(event => event.year))].sort();
    return years;
  }, [events]);

  // Filter events based on search, year, and past/future status
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesSearch = searchQuery === '' || 
        event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.location.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesYear = selectedYear === 'all' || event.year === selectedYear;
      
      // Show past events only if toggle is enabled
      const matchesTimeFilter = includePastEvents || !event.is_past;
      
      return matchesSearch && matchesYear && matchesTimeFilter;
    });
  }, [events, searchQuery, selectedYear, includePastEvents]);

  // Multi-Event handlers
  const toggleEventSelection = (eventId: string) => {
    setSelectedEventIds(prev => {
      if (prev.includes(eventId)) {
        return prev.filter(id => id !== eventId);
      } else if (prev.length < 2) {
        return [...prev, eventId];
      }
      return prev; // Already 2 selected, ignore
    });
  };

  const handleMultiEventDashboard = () => {
    if (selectedEventIds.length === 2) {
      router.push(`/dashboard/multi/${selectedEventIds[0]}/${selectedEventIds[1]}`);
    }
  };

  // Reset selection when switching modes
  useEffect(() => {
    setSelectedEventIds([]);
  }, [isMultiEventMode]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">{t('events.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('errors.errorTitle')}</h2>
          <p className="text-gray-600">
            {t('errors.errorMessage')}
          </p>
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isRefreshing ? (
              <div className="flex items-center space-x-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>{t('search.searching')}</span>
              </div>
            ) : (
              t('buttons.reload')
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {t('events.title')}
              </h1>
              <p className="text-gray-600 mt-1">
                {isMultiEventMode 
                  ? t('events.multiEventDescription')
                  : t('events.subtitle')
                }
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <Calendar className="h-4 w-4" />
                <span>
                  {t('events.eventsCount', { count: events.length })}
                  {includePastEvents && (
                    <span className="ml-1 text-xs">
                      ({events.filter(e => !e.is_past).length} {t('events.upcoming')}, {events.filter(e => e.is_past).length} {t('events.past')})
                    </span>
                  )}
                </span>
              </div>
              
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg border-2 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-all duration-200 disabled:opacity-50"
                title={t('events.refreshTitle')}
              >
                <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="font-medium">
                  {isRefreshing ? t('buttons.updating') : t('buttons.update')}
                </span>
              </button>
              
              {/* Past Events Toggle */}
              <button
                onClick={() => setIncludePastEvents(!includePastEvents)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg border-2 transition-all duration-200 ${
                  includePastEvents
                    ? 'bg-orange-50 border-orange-200 text-orange-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
                title={t('events.showPastEvents')}
              >
                {includePastEvents ? (
                  <History className="h-5 w-5 text-orange-600" />
                ) : (
                  <Clock className="h-5 w-5" />
                )}
                <span className="font-medium">
                  {includePastEvents ? t('buttons.allEvents') : t('buttons.showAllEvents')}
                </span>
              </button>
              
              {/* Multi-Event Toggle */}
              <button
                onClick={() => setIsMultiEventMode(!isMultiEventMode)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg border-2 transition-all duration-200 ${
                  isMultiEventMode
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {isMultiEventMode ? (
                  <ToggleRight className="h-5 w-5 text-blue-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5" />
                )}
                <span className="font-medium">{t('buttons.multiEventMode')}</span>
              </button>
            </div>
          </div>
          
          {/* Multi-Event Status */}
          {isMultiEventMode && (
            <div className="mt-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <div className="text-blue-700 font-medium">
                  {t('events.selectedEvents', { count: selectedEventIds.length })}
                </div>
                {selectedEventIds.length > 0 && (
                  <div className="text-sm text-blue-600">
                    {selectedEventIds.map((id) => {
                      const event = events.find(e => e.id === id);
                      return event ? (
                        <span key={id} className="bg-blue-100 px-2 py-1 rounded mr-2">
                          {event.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
              
              {selectedEventIds.length === 2 && (
                <button
                  onClick={handleMultiEventDashboard}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Eye className="h-4 w-4" />
                  <span>{t('buttons.multiEventDashboard')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Offline Events Section */}
        {offlineEvents.length > 0 && (
          <div className="mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Download className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {isOffline ? t('offline.offlineMode') : t('offline.offlineAvailable')}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {isOffline 
                        ? t('offline.noConnection')
                        : offlineEvents.length === 1 
                          ? t('offline.savedEventsSingular', { count: offlineEvents.length })
                          : t('offline.savedEventsPlural', { count: offlineEvents.length })
                      }
                    </p>
                  </div>
                </div>
                {!isOffline && (
                  <div className="text-xs text-gray-500">
                    {t('offline.autoDelete')}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {offlineEvents.map(offlineEvent => {
                  const eventIds = parseEventId(offlineEvent.id);
                  const isStale = isDataStale(offlineEvent.timestamp);
                  
                  return (
                    <div
                      key={offlineEvent.id}
                      className="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                                                     <div className="flex items-center space-x-2 mb-1">
                             <h3 className="font-semibold text-gray-900">
                               {offlineEvent.eventData.events.length === 1 
                                 ? offlineEvent.eventData.events[0].name
                                 : t('offline.multiEvent', { names: offlineEvent.eventData.events.map(e => e.name).join(' + ') })
                               }
                             </h3>
                             {isStale && (
                               <span className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded-full">
                                 {t('offline.stale')}
                               </span>
                             )}
                           </div>
                           <p className="text-sm text-gray-600 mb-1">
                             📅 {(() => {
                               const dates = offlineEvent.eventData.events.map(e => e.date);
                               const uniqueDates = [...new Set(dates)];
                               if (uniqueDates.length === 1) {
                                 return new Date(uniqueDates[0]).toLocaleDateString('de-DE');
                               } else {
                                 return uniqueDates.map(date => new Date(date).toLocaleDateString('de-DE')).join(', ');
                               }
                             })()}
                           </p>
                          <p className="text-xs text-gray-500">
                            {t('offline.athletesCount', { count: offlineEvent.totalAthletes })} • {formatFileSize(offlineEvent.estimatedSize)}
                          </p>
                        </div>
                        
                        <button
                          onClick={() => deleteOfflineEvent(offlineEvent.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          title={t('buttons.deleteOfflineData')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                          {t('offline.saved', { timestamp: formatTimestamp(offlineEvent.timestamp) })}
                        </div>
                        <button
                          onClick={() => {
                            if (eventIds.length === 1) {
                              router.push(`/dashboard/${eventIds[0]}`);
                            } else {
                              router.push(`/dashboard/multi/${eventIds[0]}/${eventIds[1]}`);
                            }
                          }}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          {t('buttons.openDashboard')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Online Events Section */}
        {!isOffline && (
          <>
            {/* Search and Filters */}
            <div className="mb-8 space-y-4">
              <SearchInput 
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={t('search.eventsPlaceholder')}
              />
              
              <FilterTabs
                availableYears={availableYears}
                selectedYear={selectedYear}
                onYearChange={setSelectedYear}
                totalEvents={events.length}
                filteredCount={filteredEvents.length}
              />
            </div>
          </>
        )}

        {/* Results */}
        {filteredEvents.length === 0 ? (
          <div className="text-center py-12">
            <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              {t('events.noEventsFoundTitle')}
            </h3>
            <p className="text-gray-500 max-w-md mx-auto">
              {searchQuery || selectedYear !== 'all' 
                ? t('events.noEventsFoundDescription')
                : t('events.noUpcomingEvents')
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map(event => (
              <EventCard 
                key={event.id} 
                event={event}
                onClick={() => isMultiEventMode 
                  ? toggleEventSelection(event.id)
                  : handleEventSelect(event, router)
                }
                isMultiMode={isMultiEventMode}
                isSelected={selectedEventIds.includes(event.id)}
                isSelectable={!isMultiEventMode || selectedEventIds.length < 2 || selectedEventIds.includes(event.id)}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function handleEventSelect(event: FWTEvent, router: AppRouterInstance) {
  // Navigate to dashboard for selected event
  router.push(`/dashboard/${event.id}`);
} 