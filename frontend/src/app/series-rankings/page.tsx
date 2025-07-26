'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Trophy, Users, Calendar, Medal, Award, ArrowLeft, Loader2, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { SeriesInfo, SeriesListResponse, SeriesRankingsResponse } from '@/types/series';
import { useTranslation } from '@/hooks/useTranslation';

export default function SeriesRankingsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [series, setSeries] = useState<SeriesInfo[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  const [rankings, setRankings] = useState<SeriesRankingsResponse | null>(null);
  const [isLoadingSeries, setIsLoadingSeries] = useState(true);
  const [isLoadingRankings, setIsLoadingRankings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all');
  const [athleteSearch, setAthleteSearch] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string | 'all'>('all');
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  // Load all series on mount
  useEffect(() => {
    const fetchSeries = async () => {
      try {
        setIsLoadingSeries(true);
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const response = await fetch(`${API_BASE_URL}/api/fullresults`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: SeriesListResponse = await response.json();
        setSeries(data.series);
      } catch (err) {
        setError(`Failed to load series: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsLoadingSeries(false);
      }
    };

    fetchSeries();
  }, []);

  // Auto-hide header after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsHeaderVisible(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // Load rankings when series is selected
  useEffect(() => {
    if (!selectedSeries) {
      setRankings(null);
      return;
    }

    // Reset filters when changing series
    setAthleteSearch('');
    setSelectedDivision('all');

    const fetchRankings = async () => {
      try {
        setIsLoadingRankings(true);
        setError(null);
        
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const response = await fetch(`${API_BASE_URL}/api/fullresults/${selectedSeries}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: SeriesRankingsResponse = await response.json();
        setRankings(data);
      } catch (err) {
        setError(`Failed to load rankings: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setRankings(null);
      } finally {
        setIsLoadingRankings(false);
      }
    };

    fetchRankings();
  }, [selectedSeries]);

  // Get unique years and categories for filters
  const availableYears = useMemo(() => {
    const years = [...new Set(series.map(s => s.year).filter(Boolean))].sort((a, b) => b! - a!);
    return years as number[];
  }, [series]);

  const availableCategories = useMemo(() => {
    const categories = [...new Set(series.map(s => s.category))];
    // Sort by FWT hierarchy: Pro Tour first, then Challenger, Qualifier, Junior, Other last
    return categories.sort((a, b) => {
      const order = ['Pro Tour', 'Challenger', 'Qualifier', 'Junior', 'Other'];
      return order.indexOf(a) - order.indexOf(b);
    });
  }, [series]);

  // Filter series
  const filteredSeries = useMemo(() => {
    const filtered = series.filter(s => {
      const matchesSearch = searchQuery === '' || 
        s.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesYear = selectedYear === 'all' || s.year === selectedYear;
      
      const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
      
      return matchesSearch && matchesYear && matchesCategory;
    });

    // Sort by different logic depending on year filter
    return filtered.sort((a, b) => {
      const categoryOrder = ['Pro Tour', 'Challenger', 'Qualifier', 'Junior', 'Other'];
      const categoryA = categoryOrder.indexOf(a.category);
      const categoryB = categoryOrder.indexOf(b.category);
      const yearA = a.year || 0;
      const yearB = b.year || 0;
      
      if (selectedYear === 'all') {
        // When "Alle Jahre" is selected: Year first, then category, then name
        // First sort by year (newest first)
        if (yearA !== yearB) {
          return yearB - yearA;
        }
        
        // Then by category priority within same year
        if (categoryA !== categoryB) {
          return categoryA - categoryB;
        }
        
        // Finally by name alphabetically
        return a.name.localeCompare(b.name);
      } else {
        // When specific year is selected: Category first, then year, then name
        // First sort by category priority
        if (categoryA !== categoryB) {
          return categoryA - categoryB;
        }
        
        // Then by year (newest first)
        if (yearA !== yearB) {
          return yearB - yearA;
        }
        
        // Finally by name alphabetically
        return a.name.localeCompare(b.name);
      }
    });
  }, [series, searchQuery, selectedYear, selectedCategory]);

  // Get available divisions from current rankings
  const availableDivisions = useMemo(() => {
    if (!rankings) return [];
    const divisions = Object.keys(rankings.divisions);
    // Sort by FWT division hierarchy: Ski Men, Ski Women, Snowboard Men, Snowboard Women
    return divisions.sort((a, b) => {
      const order = ['Ski Men', 'Ski Women', 'Snowboard Men', 'Snowboard Women'];
      const indexA = order.indexOf(a);
      const indexB = order.indexOf(b);
      // If division not in order list, put it at the end
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [rankings]);

  // Filter athletes within selected series
  const filteredRankings = useMemo(() => {
    if (!rankings) return null;

    // ALWAYS start from original rankings data
    let workingDivisions = { ...rankings.divisions };
    
    // Filter by division first
    if (selectedDivision !== 'all') {
      const divisionData = rankings.divisions[selectedDivision];
      if (divisionData) {
        workingDivisions = { [selectedDivision]: divisionData };
      } else {
        workingDivisions = {};
      }
    }

    // Filter by athlete search
    if (athleteSearch.trim() !== '') {
      Object.keys(workingDivisions).forEach(divisionName => {
        workingDivisions[divisionName] = workingDivisions[divisionName].filter(ranking =>
          ranking.athlete.name.toLowerCase().includes(athleteSearch.toLowerCase()) ||
          ranking.athlete.nationality?.toLowerCase().includes(athleteSearch.toLowerCase())
        );
      });
    }

    return {
      ...rankings,
      divisions: workingDivisions
    };
  }, [rankings, selectedDivision, athleteSearch]);

  const renderPlaceIcon = (place?: number) => {
    if (!place) return <Users className="h-4 w-4 text-gray-400" />;
    
    if (place === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
    if (place === 2) return <Medal className="h-4 w-4 text-gray-400" />;
    if (place === 3) return <Award className="h-4 w-4 text-amber-600" />;
    
    return <span className="text-sm font-bold text-gray-600">#{place}</span>;
  };

  const getPlaceColor = (place?: number) => {
    if (!place) return 'text-gray-400';
    if (place === 1) return 'text-yellow-600';
    if (place === 2) return 'text-gray-500';
    if (place === 3) return 'text-amber-600';
    if (place <= 10) return 'text-blue-600';
    return 'text-gray-600';
  };

  if (isLoadingSeries) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">{t('seriesRankingsPage.loadingSeries')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Auto-Hide Header */}
      <div 
        className={`fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg transition-transform duration-300 ${
          isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
        onMouseEnter={() => setIsHeaderVisible(true)}
        onMouseLeave={() => setIsHeaderVisible(false)}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                title={t('buttons.back')}
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-3xl font-bold">{t('seriesRankingsPage.title')}</h1>
                <p className="text-blue-100 mt-1">
                  {t('seriesRankingsPage.description')}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-blue-100">
              <TrendingUp className="h-5 w-5" />
              <span className="font-medium">{t('seriesRankingsPage.seriesAvailable', { count: series.length })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Header Hover Zone with Indicator */}
      <div 
        className="fixed top-0 left-0 right-0 h-4 z-40"
        onMouseEnter={() => setIsHeaderVisible(true)}
      >
        {/* Header Indicator Arrow */}
        <div className={`absolute top-0 left-1/2 transform -translate-x-1/2 transition-all duration-300 ${
          isHeaderVisible ? 'opacity-0 translate-y-[-4px]' : 'opacity-60 translate-y-0'
        }`}>
          <div className="bg-blue-600 text-white px-2 py-1 rounded-b-md shadow-md flex items-center space-x-1 text-xs">
            <ArrowLeft className="h-3 w-3 rotate-90" />
            <span>{t('seriesRankingsPage.fwtRankings')}</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex h-[800px]">
            {/* Sidebar - Series List */}
            <div className="w-1/3 border-r border-gray-200 flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="space-y-4">
                  {/* Series Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                      type="text"
                      placeholder={t('seriesRankingsPage.searchSeries')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    />
                  </div>

                  {/* Filters */}
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900"
                    >
                      <option value="all">{t('seriesRankingsPage.allYears')}</option>
                      {availableYears.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>

                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 text-gray-900"
                    >
                      <option value="all">{t('seriesRankingsPage.allCategories')}</option>
                      {availableCategories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Series List */}
              <div className="flex-1 overflow-y-auto">
                {error && (
                  <div className="p-4 bg-red-50 border-l-4 border-red-500">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                {filteredSeries.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <Filter className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>{t('seriesRankingsPage.noSeriesFound')}</p>
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredSeries.map(seriesItem => (
                      <button
                        key={seriesItem.id}
                        onClick={() => setSelectedSeries(seriesItem.id)}
                        className={`w-full text-left p-3 rounded-lg mb-2 transition-all ${
                          selectedSeries === seriesItem.id
                            ? 'bg-blue-100 border-2 border-blue-300'
                            : 'hover:bg-gray-50 border-2 border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="font-medium text-gray-900 leading-tight break-words">
                              {seriesItem.name}
                            </p>
                            <div className="flex items-center flex-wrap gap-2 mt-2">
                              {seriesItem.year && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  {seriesItem.year}
                                </span>
                              )}
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                seriesItem.category === 'Pro Tour' ? 'bg-purple-100 text-purple-800' :
                                seriesItem.category === 'Challenger' ? 'bg-blue-100 text-blue-800' :
                                seriesItem.category === 'Qualifier' ? 'bg-green-100 text-green-800' :
                                seriesItem.category === 'Junior' ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {seriesItem.category}
                              </span>
                            </div>
                          </div>
                          {selectedSeries === seriesItem.id && (
                            <TrendingUp className="h-4 w-4 text-blue-600 ml-2 flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Main Content - Rankings */}
            <div className="flex-1 flex flex-col">
              {!selectedSeries ? (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <Trophy className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-xl font-medium text-gray-900 mb-2">{t('seriesRankingsPage.selectSeries')}</h3>
                    <p>{t('seriesRankingsPage.selectSeriesDescription')}</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Rankings Header */}
                  <div className="p-6 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">
                          {rankings?.series_name || 'Loading...'}
                        </h3>
                        {rankings && (
                          <p className="text-gray-600 mt-1">
                            {t('seriesRankingsPage.athletesInDivisions', { 
                              athletes: rankings.total_athletes, 
                              divisions: Object.keys(rankings.divisions).length 
                            })}
                          </p>
                        )}
                      </div>
                      {isLoadingRankings && (
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      )}
                    </div>

                    {/* Rankings Filters */}
                    {rankings && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                          <input
                            type="text"
                            placeholder={t('seriesRankingsPage.searchAthlete')}
                            value={athleteSearch}
                            onChange={(e) => setAthleteSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                          />
                        </div>

                        <select
                          value={selectedDivision}
                          onChange={(e) => setSelectedDivision(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                        >
                          <option value="all">{t('seriesRankingsPage.allDivisions')}</option>
                          {availableDivisions.map(division => (
                            <option key={division} value={division}>{division}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Rankings Content */}
                  <div className="flex-1 overflow-y-auto">
                    {isLoadingRankings ? (
                      <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                          <p className="text-gray-600">{t('seriesRankingsPage.loadingRankings')}</p>
                        </div>
                      </div>
                    ) : filteredRankings && Object.keys(filteredRankings.divisions).length > 0 ? (
                      <div className="p-6 space-y-8">
                        {Object.entries(filteredRankings.divisions)
                          .sort(([a], [b]) => {
                            const order = ['Ski Men', 'Ski Women', 'Snowboard Men', 'Snowboard Women'];
                            const indexA = order.indexOf(a);
                            const indexB = order.indexOf(b);
                            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                            if (indexA === -1) return 1;
                            if (indexB === -1) return -1;
                            return indexA - indexB;
                          })
                          .map(([divisionName, divisionRankings]) => (
                          <div key={divisionName}>
                            <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                              <Users className="h-5 w-5 mr-2 text-blue-600" />
                              {divisionName}
                              <span className="ml-2 text-sm font-normal text-gray-500">
                                ({t('seriesRankingsPage.athletesCount', { count: divisionRankings.length })})
                              </span>
                            </h4>

                            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                              <div className="grid grid-cols-12 gap-4 p-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
                                <div className="col-span-1">{t('seriesRankingsPage.place')}</div>
                                <div className="col-span-4">{t('seriesRankingsPage.athlete')}</div>
                                <div className="col-span-2">{t('seriesRankingsPage.nationality')}</div>
                                <div className="col-span-2">{t('seriesRankingsPage.points')}</div>
                                <div className="col-span-3">{t('seriesRankingsPage.events')}</div>
                              </div>

                              {divisionRankings.map((ranking, index) => (
                                <div key={ranking.athlete.id} className={`grid grid-cols-12 gap-4 p-3 border-b border-gray-100 hover:bg-gray-50 ${
                                  index < 3 ? 'bg-gradient-to-r from-yellow-50 to-amber-50' : ''
                                }`}>
                                  <div className="col-span-1 flex items-center">
                                    <div className="flex items-center space-x-2">
                                      {renderPlaceIcon(ranking.place)}
                                      {ranking.place && (
                                        <span className={`font-bold ${getPlaceColor(ranking.place)}`}>
                                          {ranking.place}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="col-span-4 flex items-center space-x-3">
                                    {ranking.athlete.image && (
                                      <Image
                                        src={ranking.athlete.image}
                                        alt={ranking.athlete.name}
                                        width={32}
                                        height={32}
                                        className="h-8 w-8 rounded-full object-cover"
                                      />
                                    )}
                                    <div>
                                      <p className="font-medium text-gray-900">{ranking.athlete.name}</p>
                                      {ranking.athlete.dob && (
                                        <p className="text-xs text-gray-500">
                                          {t('seriesRankingsPage.age', { age: new Date().getFullYear() - new Date(ranking.athlete.dob).getFullYear() })}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="col-span-2 flex items-center">
                                    <span className="text-2xl mr-2">{ranking.athlete.nationality === 'SUI' ? '🇨🇭' : 
                                      ranking.athlete.nationality === 'FRA' ? '🇫🇷' :
                                      ranking.athlete.nationality === 'AUT' ? '🇦🇹' :
                                      ranking.athlete.nationality === 'USA' ? '🇺🇸' :
                                      ranking.athlete.nationality === 'CAN' ? '🇨🇦' :
                                      ranking.athlete.nationality === 'GER' ? '🇩🇪' :
                                      ranking.athlete.nationality === 'ITA' ? '🇮🇹' :
                                      ranking.athlete.nationality === 'ESP' ? '🇪🇸' :
                                      ranking.athlete.nationality === 'GBR' ? '🇬🇧' :
                                      ranking.athlete.nationality === 'NOR' ? '🇳🇴' :
                                      ranking.athlete.nationality === 'SWE' ? '🇸🇪' :
                                      ranking.athlete.nationality === 'JPN' ? '🇯🇵' :
                                      ranking.athlete.nationality === 'NZL' ? '🇳🇿' :
                                      '🏳️'}</span>
                                    <span className="text-sm text-gray-600">{ranking.athlete.nationality}</span>
                                  </div>

                                  <div className="col-span-2 flex items-center">
                                    <span className="font-semibold text-gray-900">
                                      {ranking.points ? ranking.points.toLocaleString() : '-'}
                                    </span>
                                  </div>

                                  <div className="col-span-3 flex items-center">
                                    <span className="text-sm text-gray-600">
                                      {t('seriesRankingsPage.eventsCount', { count: ranking.results.length })}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-64 text-gray-500">
                        <div className="text-center">
                          <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('seriesRankingsPage.noRankingsFound')}</h3>
                          <p>{t('seriesRankingsPage.noAthletesFound')}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}