'use client';

import { useState } from 'react';
import { Trophy, Users, Calendar, Filter, Medal, Star, Target, Zap, ChevronDown, MapPin, Calendar as CalendarIcon, TrendingUp, ExternalLink } from 'lucide-react';
import { 
  getEventBasedOverview, 
  getSeriesDetailView,
  getAvailableSeriesForAthlete,
  getAllEventsChronologically,
  SeriesDetailView,
  EventResultDetail,
  isMainSeasonRanking
} from '@/hooks/useSeriesRankings';
import { SeriesData } from '@/hooks/useSeriesRankings';
import { useTranslation } from '@/hooks/useTranslation';

interface AthleteSeriesRankingsProps {
  athleteId: string;
  athleteName: string;
  seriesData: SeriesData[];
  className?: string;
}

type ViewMode = 'overview' | 'series-detail' | 'all-events';
type SortMode = 'chronological' | 'points' | 'ranking';

export function AthleteSeriesRankings({ 
  athleteId, 
  athleteName, 
  seriesData, 
  className = "" 
}: AthleteSeriesRankingsProps) {
  const { t } = useTranslation();
  const [activeYear, setActiveYear] = useState<number | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [showAdminDropdown, setShowAdminDropdown] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('chronological');
  const [seriesSortMode, setSeriesSortMode] = useState<SortMode>('ranking');

  // Get overview and available series
  const overview = getEventBasedOverview(seriesData, athleteId);
  const { mainSeries, adminSeries } = getAvailableSeriesForAthlete(seriesData, athleteId);
  
  // Get series detail if in detail mode
  const seriesDetail = selectedSeries && viewMode === 'series-detail' 
    ? getSeriesDetailView(seriesData, athleteId, selectedSeries)
    : null;
    
  // Get all events chronologically for all-events view
  const allEventsChronological = getAllEventsChronologically(seriesData, athleteId);

  // Sort events based on selected sort mode
  const getSortedEvents = () => {
    const events = [...allEventsChronological];
    
    switch (sortMode) {
      case 'chronological':
        return events.sort((a, b) => {
          if (a.eventDate && b.eventDate) {
            return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
          }
          return 0;
        });
        
      case 'points':
        return events.sort((a, b) => {
          const pointsA = a.points || 0;
          const pointsB = b.points || 0;
          if (pointsB !== pointsA) {
            return pointsB - pointsA; // Higher points first
          }
          // Secondary sort by date if points are equal
          if (a.eventDate && b.eventDate) {
            return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
          }
          return 0;
        });
        
      case 'ranking':
        return events.sort((a, b) => {
          const placeA = a.place || 999; // Events without place go to end
          const placeB = b.place || 999;
          if (placeA !== placeB) {
            return placeA - placeB; // Lower place (better ranking) first
          }
          // Secondary sort by date if rankings are equal
          if (a.eventDate && b.eventDate) {
            return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
          }
          return 0;
        });
        
      default:
        return events;
    }
  };

  const sortedEvents = getSortedEvents();

  // Sort series detail events based on selected sort mode
  const getSortedSeriesEvents = () => {
    if (!seriesDetail?.eventResults) return [];
    
    const events = [...seriesDetail.eventResults];
    
    switch (seriesSortMode) {
      case 'chronological':
        return events.sort((a, b) => {
          if (a.eventDate && b.eventDate) {
            return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
          }
          return 0;
        });
        
      case 'points':
        return events.sort((a, b) => {
          const pointsA = a.points || 0;
          const pointsB = b.points || 0;
          if (pointsB !== pointsA) {
            return pointsB - pointsA; // Higher points first
          }
          // Secondary sort by date if points are equal
          if (a.eventDate && b.eventDate) {
            return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
          }
          return 0;
        });
        
      case 'ranking':
        return events.sort((a, b) => {
          const placeA = a.place || 999; // Events without place go to end
          const placeB = b.place || 999;
          if (placeA !== placeB) {
            return placeA - placeB; // Lower place (better ranking) first
          }
          // Secondary sort by date if rankings are equal
          if (a.eventDate && b.eventDate) {
            return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
          }
          return 0;
        });
        
      default:
        return events;
    }
  };

  const sortedSeriesEvents = getSortedSeriesEvents();

  if (!overview) {
    return (
      <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-2 mb-2">
          <Users className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">New FWT Athlete</h3>
        </div>
        <p className="text-sm text-gray-700">{t('seriesRankings.firstEvent')}</p>
      </div>
    );
  }

  // Get main series categories that are available for the athlete
  const mainSeriesCategories = overview.availableCategories.filter(cat => cat.isMainSeries);

  // Filter main series by year
  const getMainSeriesByYear = (year: number | 'all') => {
    if (year === 'all') return mainSeries;
    return mainSeries.filter(s => {
      const seriesYear = parseInt(s.series_name.match(/\b(20[0-9]{2})\b/)?.[1] || '0');
      return seriesYear === year;
    });
  };

  // Group main series by category
  const getMainSeriesByCategory = (year: number | 'all') => {
    const filteredSeries = getMainSeriesByYear(year);
    const grouped = {
      pro: filteredSeries.filter(s => s.series_name.toLowerCase().includes('pro tour')),
      challenger: filteredSeries.filter(s => s.series_name.toLowerCase().includes('challenger') && !s.series_name.toLowerCase().includes('qualifying')),
      qualifier: filteredSeries.filter(s => (s.series_name.toLowerCase().includes('qualifier') || s.series_name.toLowerCase().includes('ifsa')) && !s.series_name.toLowerCase().includes('national')),
      junior: filteredSeries.filter(s => s.series_name.toLowerCase().includes('junior') && !s.series_name.toLowerCase().includes('national'))
    };
    return grouped;
  };

  const mainSeriesByCategory = getMainSeriesByCategory(activeYear);

  // Get category icon
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'pro': return <Star className="h-4 w-4" />;
      case 'challenger': return <Trophy className="h-4 w-4" />;
      case 'qualifier': return <Target className="h-4 w-4" />;
      case 'junior': return <Zap className="h-4 w-4" />;
      default: return <Medal className="h-4 w-4" />;
    }
  };

  // Get category color
  const getCategoryColor = (category: string, isMainSeries?: boolean) => {
    if (isMainSeries) {
      // Main series get colors based on category
      switch (category) {
        case 'pro': return 'text-purple-600 bg-purple-100';
        case 'challenger': return 'text-yellow-600 bg-yellow-100';
        case 'qualifier': return 'text-green-600 bg-green-100';
        case 'junior': return 'text-blue-600 bg-blue-100';
        default: return 'text-gray-600 bg-gray-100';
      }
    }
    
    // Non-main series stay gray
    return 'text-gray-600 bg-gray-100';
  };

  // Handle series selection
  const handleSeriesSelect = (seriesName: string) => {
    setSelectedSeries(seriesName);
    setViewMode('series-detail');
    setShowAdminDropdown(false);
  };

  // Handle back to overview
  const handleBackToOverview = () => {
    setViewMode('overview');
    setSelectedSeries(null);
  };

  // Handle all events view
  const handleAllEventsView = () => {
    setViewMode('all-events');
    setSelectedSeries(null);
    setShowAdminDropdown(false);
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className={`bg-white border rounded-lg shadow-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-gray-900">
                {athleteName} Series Rankings
              </h3>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span>{allEventsChronological.length} Events</span>
                <span>{overview.availableYears.length} Years Active</span>
                <span>{mainSeries.length} Main Series</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Series Rankings Button */}
            <button
              onClick={() => window.open('/series-rankings', '_blank')}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 shadow-sm text-sm font-medium"
              title="Open FWT Series Rankings in new tab"
            >
              <TrendingUp className="h-4 w-4" />
              <span>{t('seriesRankings.fwtSeriesRankings')}</span>
              <ExternalLink className="h-3 w-3" />
            </button>
            
            {(viewMode === 'series-detail' || viewMode === 'all-events') && (
              <button
                onClick={handleBackToOverview}
                className="px-4 py-2 text-sm bg-blue-600 text-white border border-blue-600 rounded-md hover:bg-blue-700 hover:border-blue-700 transition-colors font-medium shadow-sm"
              >
                ← {t('seriesRankings.backToOverview')}
              </button>
            )}
          </div>
        </div>
      </div>

      {viewMode === 'overview' ? (
        <>
          {/* All Events Button */}
          <div className="border-b bg-gradient-to-r from-slate-100 to-blue-100 px-4 py-3">
            <div className="flex items-center justify-center">
              <button
                onClick={handleAllEventsView}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center space-x-3 shadow-lg"
              >
                <Trophy className="h-5 w-5" />
                <span>{t('seriesRankings.allEventsTitle')}</span>
                <span className="bg-white/20 px-2 py-1 rounded text-sm">
                  {t('seriesRankings.eventsCount', { count: allEventsChronological.length })}
                </span>
              </button>
            </div>
            <p className="text-center text-sm text-gray-600 mt-2">
              📖 {t('seriesRankings.allEventsDescription')}
            </p>
          </div>

          {/* Year Navigation */}
          <div className="border-b bg-gray-50 px-4 py-3">
            <div className="flex items-center space-x-2 mb-3">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{t('seriesRankings.year')}:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveYear('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  activeYear === 'all'
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                }`}
              >
                ALL
              </button>
              
              {overview.availableYears.map((year) => (
                <button
                  key={year}
                  onClick={() => setActiveYear(year)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    activeYear === year
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {year}
                  {year >= new Date().getFullYear() - 1 && (
                    <span className="ml-1">🔥</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Main Series Buttons */}
          <div className="border-b bg-gray-50 px-4 py-3">
            <div className="flex items-center space-x-2 mb-3">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{t('seriesRankings.mainSeries')}:</span>
            </div>
            
            <div className="space-y-3">
              {/* Pro Tour */}
              {mainSeriesByCategory.pro.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">🏆 Pro Tour</div>
                  <div className="flex flex-wrap gap-2">
                    {mainSeriesByCategory.pro.map((series) => (
                      <button
                        key={series.series_id}
                        onClick={() => handleSeriesSelect(series.series_name)}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-purple-100 text-purple-800 border border-purple-200 hover:bg-purple-200 transition-colors flex items-center space-x-2"
                      >
                        <Star className="h-4 w-4" />
                        <span>{series.series_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Challenger */}
              {mainSeriesByCategory.challenger.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">🥇 Challenger</div>
                  <div className="flex flex-wrap gap-2">
                    {mainSeriesByCategory.challenger.map((series) => (
                      <button
                        key={series.series_id}
                        onClick={() => handleSeriesSelect(series.series_name)}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-200 hover:bg-yellow-200 transition-colors flex items-center space-x-2"
                      >
                        <Trophy className="h-4 w-4" />
                        <span>{series.series_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Qualifier */}
              {mainSeriesByCategory.qualifier.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">🎯 Qualifier</div>
                  <div className="flex flex-wrap gap-2">
                    {mainSeriesByCategory.qualifier.map((series) => (
                      <button
                        key={series.series_id}
                        onClick={() => handleSeriesSelect(series.series_name)}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-green-100 text-green-800 border border-green-200 hover:bg-green-200 transition-colors flex items-center space-x-2"
                      >
                        <Target className="h-4 w-4" />
                        <span>{series.series_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Junior */}
              {mainSeriesByCategory.junior.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-2">⚡ Junior</div>
                  <div className="flex flex-wrap gap-2">
                    {mainSeriesByCategory.junior.map((series) => (
                      <button
                        key={series.series_id}
                        onClick={() => handleSeriesSelect(series.series_name)}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 transition-colors flex items-center space-x-2"
                      >
                        <Zap className="h-4 w-4" />
                        <span>{series.series_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Admin Series Dropdown */}
            {adminSeries.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <button
                  onClick={() => setShowAdminDropdown(!showAdminDropdown)}
                  className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAdminDropdown ? 'rotate-180' : ''}`} />
                  <span>{t('seriesRankings.moreSeries')}</span>
                  <span className="text-xs bg-gray-200 px-2 py-1 rounded">{adminSeries.length}</span>
                </button>
                
                {showAdminDropdown && (
                  <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                    {adminSeries.map((series) => (
                      <button
                        key={series.series_id}
                        onClick={() => handleSeriesSelect(series.series_name)}
                        className="block w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      >
                        📋 {series.series_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Overview Message */}
          <div className="p-4 text-center text-gray-500">
            <Trophy className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">{t('seriesRankings.selectSeriesToView')}</p>
            <p className="text-xs mt-1">{t('seriesRankings.chooseFromSeries', { mainCount: mainSeries.length, adminCount: adminSeries.length })}</p>
          </div>
        </>
      ) : viewMode === 'all-events' ? (
        /* All Events Chronological View */
        <>
          {/* Sorting Controls */}
          <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center space-x-2 mb-2">
              <Filter className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">{t('seriesRankings.sortBy')}:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSortMode('chronological')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  sortMode === 'chronological'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                }`}
              >
                📅 {t('seriesRankings.chronological')}
              </button>
              <button
                onClick={() => setSortMode('points')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  sortMode === 'points'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                }`}
              >
                🏆 {t('seriesRankings.highestPoints')}
              </button>
              <button
                onClick={() => setSortMode('ranking')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  sortMode === 'ranking'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                }`}
              >
                🥇 {t('seriesRankings.bestRanking')}
              </button>
            </div>
          </div>

          {/* All Events List */}
          <div className="max-h-[32rem] overflow-y-auto">
            {sortedEvents.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <Trophy className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p>{t('seriesRankings.noEventsFound')}</p>
              </div>
            ) : (
              <div className="space-y-3 p-4">
                {sortedEvents.map((result, index) => {
                  const seriesInfo = result.rawResult?.seriesInfo;
                  const allSeriesInfo = result.rawResult?.allSeriesInfo || [seriesInfo];
                  
                  return (
                    <div
                      key={index}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            {seriesInfo && getCategoryIcon(seriesInfo.seriesCategory)}
                            {seriesInfo && (
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(seriesInfo.seriesCategory, seriesInfo.isMainSeries)}`}>
                                {seriesInfo.seriesCategory.toUpperCase()}
                              </span>
                            )}
                            {allSeriesInfo.length > 1 && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                                {allSeriesInfo.length} Series
                              </span>
                            )}
                          </div>
                          
                          <h5 className="font-semibold text-gray-900 text-sm leading-tight">
                            {result.eventName}
                          </h5>
                          
                          <div className="flex items-center space-x-3 mt-1 text-xs text-gray-600">
                            {result.eventDate && (
                              <div className="flex items-center space-x-1">
                                <CalendarIcon className="h-3 w-3" />
                                <span>{formatDate(result.eventDate)}</span>
                              </div>
                            )}
                            {result.location && (
                              <div className="flex items-center space-x-1">
                                <MapPin className="h-3 w-3" />
                                <span>{result.location}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* Show all series this event is in */}
                          {allSeriesInfo.length > 0 && (
                            <div className="mt-2 text-xs">
                              <div className="text-gray-500 mb-1">{t('seriesRankings.foundIn')}:</div>
                              <div className="flex flex-wrap gap-1">
                                {allSeriesInfo
                                  .sort((a: any, b: any) => {
                                    // Main series first
                                    if (a.isMainSeries && !b.isMainSeries) return -1;
                                    if (!a.isMainSeries && b.isMainSeries) return 1;
                                    // Then by priority
                                    return (b.priority || 0) - (a.priority || 0);
                                  })
                                  .map((series: any, idx: number) => (
                                  <span
                                    key={idx}
                                    className={`px-2 py-1 rounded text-xs ${getCategoryColor(series.seriesCategory, series.isMainSeries)}`}
                                  >
                                    {series.seriesName.replace(/^\d{4}\s*/, '')}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="text-right ml-4">
                          {result.place ? (
                            <div className="text-xl font-bold text-gray-900">
                              #{result.place}
                            </div>
                          ) : result.status ? (
                            <div className="text-sm font-bold text-red-600">
                              {result.status}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">
                              {t('seriesRankings.noResult')}
                            </div>
                          )}
                          {result.points && (
                            <div className="text-xs text-gray-600">
                              {t('seriesRankings.pointsShort', { points: result.points })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Series Detail View */
        seriesDetail && (
          <>
            {/* Series Header */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  {getCategoryIcon(seriesDetail.seriesInfo.category)}
                  <div>
                    <h4 className="font-bold text-gray-900 text-lg">
                      {seriesDetail.seriesInfo.name}
                    </h4>
                    <div className="flex items-center space-x-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(seriesDetail.seriesInfo.category, seriesDetail.seriesInfo.isMainSeries)}`}>
                        {seriesDetail.seriesInfo.category.toUpperCase()}
                      </span>
                      <span className="text-gray-600">{seriesDetail.overallRanking.division}</span>
                      <span className="text-gray-600">{t('seriesRankings.eventsCount', { count: seriesDetail.eventResults.length })}</span>
                                              <span className="text-gray-600">
                          {seriesSortMode === 'chronological' && t('seriesRankings.chronological')}
                          {seriesSortMode === 'points' && t('seriesRankings.byPoints')}
                          {seriesSortMode === 'ranking' && t('seriesRankings.byRanking')}
                        </span>
                      {seriesDetail.seriesInfo.isMainSeries && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                          MAIN SERIES
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Overall Ranking */}
                <div className="text-right">
                  {seriesDetail.overallRanking.place && (
                    <div className="text-3xl font-bold text-gray-900">
                      #{seriesDetail.overallRanking.place}
                    </div>
                  )}
                  {seriesDetail.overallRanking.points && (
                    <div className="text-sm text-gray-600">
                      {t('seriesRankings.points', { points: seriesDetail.overallRanking.points })}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Series Sorting Controls */}
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex items-center space-x-2 mb-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                                        <span className="text-sm font-medium text-gray-700">{t('seriesRankings.sortEventsBy')}:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSeriesSortMode('ranking')}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      seriesSortMode === 'ranking'
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    🥇 {t('seriesRankings.bestRanking')}
                  </button>
                  <button
                    onClick={() => setSeriesSortMode('points')}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      seriesSortMode === 'points'
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    🏆 {t('seriesRankings.highestPoints')}
                  </button>
                  <button
                    onClick={() => setSeriesSortMode('chronological')}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      seriesSortMode === 'chronological'
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    📅 {t('seriesRankings.chronological')}
                  </button>
                </div>
              </div>
            </div>

            {/* Event Results */}
            <div className="max-h-96 overflow-y-auto">
              {sortedSeriesEvents.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <Trophy className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p>{t('seriesRankings.noEventResultsFound')}</p>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {sortedSeriesEvents.map((result, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h5 className="font-semibold text-gray-900 text-sm leading-tight">
                            {result.eventName}
                          </h5>
                          <div className="flex items-center space-x-3 mt-1 text-xs text-gray-600">
                            {result.eventDate && (
                              <div className="flex items-center space-x-1">
                                <CalendarIcon className="h-3 w-3" />
                                <span>{formatDate(result.eventDate)}</span>
                              </div>
                            )}
                            {result.location && (
                              <div className="flex items-center space-x-1">
                                <MapPin className="h-3 w-3" />
                                <span>{result.location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-right ml-4">
                          {result.place ? (
                            <div className="text-xl font-bold text-gray-900">
                              #{result.place}
                            </div>
                          ) : result.status ? (
                            <div className="text-sm font-bold text-red-600">
                              {result.status}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">
                              {t('seriesRankings.noResult')}
                            </div>
                          )}
                          {result.points && (
                            <div className="text-xs text-gray-600">
                              {t('seriesRankings.pointsShort', { points: result.points })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )
      )}

      {/* Footer */}
      <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500">
        {viewMode === 'overview' ? (
          <span>{t('seriesRankings.overviewFooter', { mainCount: mainSeries.length, adminCount: adminSeries.length })}</span>
        ) : viewMode === 'all-events' ? (
          <span>{t('seriesRankings.careerTimelineFooter', { count: allEventsChronological.length })}</span>
        ) : (
          <span>{t('seriesRankings.detailedViewFooter', { name: seriesDetail?.seriesInfo.name })}</span>
        )}
      </div>
    </div>
  );
} 