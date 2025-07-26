'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Trophy, Users, Calendar, Medal, Award, X, Loader2, TrendingUp } from 'lucide-react';
import Image from 'next/image';
import { SeriesInfo, SeriesListResponse, SeriesRankingsResponse } from '@/types/series';
import { useTranslation } from '@/hooks/useTranslation';

interface SeriesRankingToolProps {
  onClose: () => void;
}

export function SeriesRankingTool({ onClose }: SeriesRankingToolProps) {
  const { t } = useTranslation();
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

  // Load rankings when series is selected
  useEffect(() => {
    if (!selectedSeries) {
      setRankings(null);
      return;
    }

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
    return [...new Set(series.map(s => s.category))].sort();
  }, [series]);

  // Filter series
  const filteredSeries = useMemo(() => {
    return series.filter(s => {
      const matchesSearch = searchQuery === '' || 
        s.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesYear = selectedYear === 'all' || s.year === selectedYear;
      
      const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
      
      return matchesSearch && matchesYear && matchesCategory;
    });
  }, [series, searchQuery, selectedYear, selectedCategory]);

  // Get available divisions from current rankings
  const availableDivisions = useMemo(() => {
    if (!rankings) return [];
    return Object.keys(rankings.divisions);
  }, [rankings]);

  // Filter athletes within selected series
  const filteredRankings = useMemo(() => {
    if (!rankings) return null;

    const filtered = { ...rankings };
    
    // Filter by division
    if (selectedDivision !== 'all') {
      const divisionData = rankings.divisions[selectedDivision];
      if (divisionData) {
        filtered.divisions = { [selectedDivision]: divisionData };
      } else {
        filtered.divisions = {};
      }
    }

    // Filter by athlete search
    if (athleteSearch) {
      Object.keys(filtered.divisions).forEach(divisionName => {
        filtered.divisions[divisionName] = filtered.divisions[divisionName].filter(ranking =>
          ranking.athlete.name.toLowerCase().includes(athleteSearch.toLowerCase()) ||
          ranking.athlete.nationality?.toLowerCase().includes(athleteSearch.toLowerCase())
        );
      });
    }

    return filtered;
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">{t('seriesRankingTool.loadingSeries')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-7xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{t('seriesRankingTool.title')}</h2>
              <p className="text-blue-100 mt-1">
                {t('seriesRankingTool.description')}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - Series List */}
          <div className="w-1/3 border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="space-y-4">
                {/* Series Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder={t('seriesRankingTool.searchSeries')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Filters */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">{t('seriesRankingTool.allYears')}</option>
                    {availableYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>

                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">{t('seriesRankingTool.allCategories')}</option>
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
                  <p>{t('seriesRankingTool.noSeriesFound')}</p>
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
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {seriesItem.name}
                          </p>
                          <div className="flex items-center space-x-2 mt-1">
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
                          <TrendingUp className="h-4 w-4 text-blue-600 ml-2" />
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
                  <h3 className="text-xl font-medium text-gray-900 mb-2">{t('seriesRankingTool.selectSeries')}</h3>
                  <p>{t('seriesRankingTool.selectSeriesDescription')}</p>
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
                          {t('seriesRankingTool.athletesInDivisions', { 
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
                          placeholder={t('seriesRankingTool.searchAthlete')}
                          value={athleteSearch}
                          onChange={(e) => setAthleteSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <select
                        value={selectedDivision}
                        onChange={(e) => setSelectedDivision(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">{t('seriesRankingTool.allDivisions')}</option>
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
                        <p className="text-gray-600">{t('seriesRankingTool.loadingRankings')}</p>
                      </div>
                    </div>
                  ) : filteredRankings && Object.keys(filteredRankings.divisions).length > 0 ? (
                    <div className="p-6 space-y-8">
                      {Object.entries(filteredRankings.divisions).map(([divisionName, divisionRankings]) => (
                        <div key={divisionName}>
                          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Users className="h-5 w-5 mr-2 text-blue-600" />
                            {divisionName}
                            <span className="ml-2 text-sm font-normal text-gray-500">
                              ({t('seriesRankingTool.athletesCount', { count: divisionRankings.length })})
                            </span>
                          </h4>

                          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <div className="grid grid-cols-12 gap-4 p-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
                              <div className="col-span-1">{t('seriesRankingTool.place')}</div>
                              <div className="col-span-4">{t('seriesRankingTool.athlete')}</div>
                              <div className="col-span-2">{t('seriesRankingTool.nationality')}</div>
                              <div className="col-span-2">{t('seriesRankingTool.points')}</div>
                              <div className="col-span-3">{t('seriesRankingTool.events')}</div>
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
                                      {t('seriesRankingTool.age', { age: new Date().getFullYear() - new Date(ranking.athlete.dob).getFullYear() })}
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
                                    {t('seriesRankingTool.eventsCount', { count: ranking.results.length })}
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
                        <h3 className="text-lg font-medium text-gray-900 mb-2">{t('seriesRankingTool.noRankingsFound')}</h3>
                        <p>{t('seriesRankingTool.noAthletesFound')}</p>
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
  );
}