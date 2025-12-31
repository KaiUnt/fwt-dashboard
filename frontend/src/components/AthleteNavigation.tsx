'use client';

import { Users, Search, SlidersHorizontal, Filter, ChevronDown } from 'lucide-react';
import { Athlete, MultiEventAthlete } from '@/types/athletes';
import { useState, useMemo } from 'react';
import { getCountryFlag, getNationalityDisplay, countUniqueNationalities, matchesNationalitySearch } from '@/utils/nationality';
import { useTranslation } from '@/hooks/useTranslation';
import type { SeriesData, SeriesRegion, AthleteMainRanking, SeriesCategoryType } from '@/hooks/useSeriesRankings';
import { getAthleteRankingForEventType, categorizeSeriesType, extractSeriesYear, SERIES_CATEGORY_COLORS } from '@/hooks/useSeriesRankings';

// Sort options
export type SortOption = 'bib' | 'name' | 'division' | 'ranking';

// Division filter options
export type DivisionFilter = 'all' | 'Ski Men' | 'Ski Women' | 'Snowboard Men' | 'Snowboard Women';

// Division order for sorting (base divisions without age categories)
const DIVISION_ORDER = ['Ski Men', 'Ski Women', 'Snowboard Men', 'Snowboard Women'];

// Helper function to extract base division (removes age category like U-14, U-16, U-18, U-21)
function getBaseDivision(division: string | undefined): string {
  if (!division) return '';
  return division.replace(/\s+U-\d+$/, '');
}

// Component to render a single ranking badge for the event type
function RankingBadge({
  ranking
}: {
  ranking: AthleteMainRanking | null;
}) {
  if (!ranking) return null;

  const colors = SERIES_CATEGORY_COLORS[ranking.category];
  return (
    <span
      className={`
        inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold border
        ${colors.bg} ${colors.text} ${colors.border}
      `}
      title={`${colors.name}: #${ranking.place}`}
    >
      #{ranking.place}
    </span>
  );
}

interface AthleteNavigationProps {
  athletes: (Athlete | MultiEventAthlete)[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  // Optional: Series data for ranking sort (passed from parent, no extra API calls)
  seriesData?: SeriesData[];
  // Optional: Multi-event support
  isMultiEvent?: boolean;
  eventNames?: { id: string; name: string }[];
  // Optional: Selected region for filtering rankings (default: Region 1)
  selectedRegion?: SeriesRegion;
  // Optional: Event name to determine the series type (e.g., "FWT Challenger Fieberbrunn 2025" -> challenger)
  eventName?: string;
}

// Helper function to get athlete ranking for the event's series type (for sorting purposes)
function getAthleteRankingPlace(
  athleteId: string,
  division: string | undefined,
  seriesData: SeriesData[] | undefined,
  eventSeriesType: SeriesCategoryType,
  selectedRegion: SeriesRegion = '1',
  eventYear?: number
): number | undefined {
  const ranking = getAthleteRankingForEventType(seriesData || [], athleteId, division, eventSeriesType, selectedRegion, eventYear);
  return ranking?.place;
}

export function AthleteNavigation({
  athletes,
  currentIndex,
  onNavigate,
  seriesData,
  isMultiEvent = false,
  eventNames = [],
  selectedRegion = '1',
  eventName
}: AthleteNavigationProps) {
  // Determine the series type from the event name (e.g., "FWT Challenger Fieberbrunn 2025" -> 'challenger')
  const eventSeriesType: SeriesCategoryType = useMemo(() => {
    if (!eventName) return 'other';
    return categorizeSeriesType(eventName);
  }, [eventName]);

  // Extract the year from the event name (e.g., "FWT Challenger Fieberbrunn 2025" -> 2025)
  // This ensures we only show rankings from the same year as the event
  const eventYear: number = useMemo(() => {
    if (!eventName) return new Date().getFullYear();
    return extractSeriesYear(eventName);
  }, [eventName]);
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('bib');
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>('all');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Check if any athlete has a BIB number - if yes, hide waitlisted athletes
  const hasBibNumbers = athletes.some(athlete => athlete.bib);

  // Filter out waitlisted athletes if BIB numbers are assigned
  const relevantAthletes = hasBibNumbers
    ? athletes.filter(athlete => athlete.status === 'confirmed')
    : athletes;

  // Get available divisions from athletes (using base divisions without age categories)
  const availableDivisions = useMemo(() => {
    const baseDivisions = new Set<string>();
    relevantAthletes.forEach(athlete => {
      if (athlete.division) {
        baseDivisions.add(getBaseDivision(athlete.division));
      }
    });
    return DIVISION_ORDER.filter(d => baseDivisions.has(d));
  }, [relevantAthletes]);

  // Get available events for multi-event mode
  const availableEvents = useMemo(() => {
    if (!isMultiEvent) return [];
    const events = new Set<string>();
    relevantAthletes.forEach(athlete => {
      if ('eventSource' in athlete && athlete.eventSource) {
        events.add(athlete.eventSource);
      }
    });
    return Array.from(events);
  }, [relevantAthletes, isMultiEvent]);

  // Apply filters and sorting
  const processedAthletes = useMemo(() => {
    let result = [...relevantAthletes];

    // Apply search filter
    if (searchQuery) {
      result = result.filter(athlete =>
        athlete.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        athlete.bib?.toString().includes(searchQuery) ||
        matchesNationalitySearch(athlete.nationality, searchQuery)
      );
    }

    // Apply division filter (match base division, ignoring age categories)
    if (divisionFilter !== 'all') {
      result = result.filter(athlete => getBaseDivision(athlete.division) === divisionFilter);
    }

    // Apply event filter (multi-event mode)
    if (eventFilter !== 'all' && isMultiEvent) {
      result = result.filter(athlete =>
        'eventSource' in athlete && athlete.eventSource === eventFilter
      );
    }

    // Apply sorting
    switch (sortOption) {
      case 'bib':
        result.sort((a, b) => {
          const bibA = parseInt(a.bib || '999');
          const bibB = parseInt(b.bib || '999');
          return bibA - bibB;
        });
        break;

      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;

      case 'division':
        result.sort((a, b) => {
          // Use base division for sorting (ignore age categories)
          const divIndexA = DIVISION_ORDER.indexOf(getBaseDivision(a.division));
          const divIndexB = DIVISION_ORDER.indexOf(getBaseDivision(b.division));
          const divA = divIndexA === -1 ? 999 : divIndexA;
          const divB = divIndexB === -1 ? 999 : divIndexB;
          if (divA !== divB) return divA - divB;
          // Within division, sort by BIB
          const bibA = parseInt(a.bib || '999');
          const bibB = parseInt(b.bib || '999');
          return bibA - bibB;
        });
        break;

      case 'ranking':
        result.sort((a, b) => {
          // Use base division for sorting (ignore age categories)
          const divIndexA = DIVISION_ORDER.indexOf(getBaseDivision(a.division));
          const divIndexB = DIVISION_ORDER.indexOf(getBaseDivision(b.division));
          const divA = divIndexA === -1 ? 999 : divIndexA;
          const divB = divIndexB === -1 ? 999 : divIndexB;
          // First sort by division
          if (divA !== divB) return divA - divB;
          // Within division, sort by ranking for the event's series type (athletes without ranking go to the end)
          // In multi-event mode, use each athlete's own event type and year
          const seriesTypeA = isMultiEvent && 'eventName' in a ? categorizeSeriesType(a.eventName) : eventSeriesType;
          const seriesTypeB = isMultiEvent && 'eventName' in b ? categorizeSeriesType(b.eventName) : eventSeriesType;
          const yearA = isMultiEvent && 'eventName' in a ? extractSeriesYear(a.eventName) : eventYear;
          const yearB = isMultiEvent && 'eventName' in b ? extractSeriesYear(b.eventName) : eventYear;
          const rankA = getAthleteRankingPlace(a.id, a.division, seriesData, seriesTypeA, selectedRegion, yearA) ?? 5000;
          const rankB = getAthleteRankingPlace(b.id, b.division, seriesData, seriesTypeB, selectedRegion, yearB) ?? 5000;
          return rankA - rankB;
        });
        break;
    }

    return result;
  }, [relevantAthletes, searchQuery, divisionFilter, eventFilter, sortOption, seriesData, isMultiEvent, selectedRegion, eventSeriesType, eventYear]);

  // For display - use processedAthletes instead of filteredAthletes
  const filteredAthletes = processedAthletes;

  // Count unique nationalities using the new utility
  const totalNationalities = countUniqueNationalities(relevantAthletes);
  const filteredNationalities = countUniqueNationalities(filteredAthletes);

  // Check if we should show division headers (for division/ranking sort without filter)
  const showDivisionHeaders = (sortOption === 'division' || sortOption === 'ranking') && divisionFilter === 'all';

  // Group athletes by base division for rendering with headers (ignore age categories)
  const athletesByDivision = useMemo(() => {
    if (!showDivisionHeaders) return null;

    const grouped: Record<string, typeof filteredAthletes> = {};
    filteredAthletes.forEach(athlete => {
      const div = getBaseDivision(athlete.division) || 'Other';
      if (!grouped[div]) grouped[div] = [];
      grouped[div].push(athlete);
    });
    return grouped;
  }, [filteredAthletes, showDivisionHeaders]);

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-visible">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Users className="h-5 w-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">{t('navigation.athletes')}</h3>
          <span className="text-sm text-gray-500">({relevantAthletes.length})</span>
          {hasBibNumbers && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
              {t('navigation.liveEvent')}
            </span>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search.athleteSearchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-950 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Sort & Filter Controls */}
        <div className="flex items-center gap-2 mt-3">
          {/* Sort Dropdown */}
          <div className="relative flex-1">
            <button
              onClick={() => {
                setShowSortDropdown(!showSortDropdown);
                setShowFilterDropdown(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2 text-gray-700">
                <SlidersHorizontal className="h-4 w-4" />
                {t(`navigation.sort.${sortOption}`)}
              </span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showSortDropdown && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                {(['bib', 'name', 'division', 'ranking'] as SortOption[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setSortOption(option);
                      setShowSortDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      sortOption === option ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {t(`navigation.sort.${option}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter Dropdown */}
          <div className="relative flex-1">
            <button
              onClick={() => {
                setShowFilterDropdown(!showFilterDropdown);
                setShowSortDropdown(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg transition-colors ${
                divisionFilter !== 'all' || eventFilter !== 'all'
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                {divisionFilter !== 'all'
                  ? divisionFilter
                  : eventFilter !== 'all'
                  ? eventNames.find(e => e.id === eventFilter)?.name || 'Event'
                  : t('navigation.filter.all')}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showFilterDropdown && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {/* Division filters */}
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  {t('navigation.filter.division')}
                </div>
                <button
                  onClick={() => {
                    setDivisionFilter('all');
                    setShowFilterDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                    divisionFilter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  {t('navigation.filter.allDivisions')}
                </button>
                {availableDivisions.map((division) => (
                  <button
                    key={division}
                    onClick={() => {
                      setDivisionFilter(division as DivisionFilter);
                      setShowFilterDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      divisionFilter === division ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {division}
                  </button>
                ))}

                {/* Event filters (only for multi-event) */}
                {isMultiEvent && availableEvents.length > 0 && (
                  <>
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-t border-b border-gray-100 mt-1">
                      {t('navigation.filter.event')}
                    </div>
                    <button
                      onClick={() => {
                        setEventFilter('all');
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                        eventFilter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      {t('navigation.filter.allEvents')}
                    </button>
                    {availableEvents.map((eventId) => {
                      const eventName = eventNames.find(e => e.id === eventId)?.name || eventId;
                      return (
                        <button
                          key={eventId}
                          onClick={() => {
                            setEventFilter(eventId);
                            setShowFilterDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                            eventFilter === eventId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                          }`}
                        >
                          {eventName}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Athletes List */}
      <div className="max-h-96 overflow-y-auto overflow-x-hidden rounded-b-xl">
        {filteredAthletes.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">{t('search.noAthletesFound')}</p>
          </div>
        ) : showDivisionHeaders && athletesByDivision ? (
          // Render with division headers
          <div>
            {DIVISION_ORDER.filter(div => athletesByDivision[div]?.length > 0).map((divisionName) => (
              <div key={divisionName}>
                {/* Division Header */}
                <div className="sticky top-0 bg-gray-100 px-4 py-2 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {divisionName}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    ({athletesByDivision[divisionName].length})
                  </span>
                </div>
                {/* Athletes in this division */}
                <div className="divide-y divide-gray-200">
                  {athletesByDivision[divisionName].map((athlete, index) => {
                    const actualIndex = athletes.findIndex(a =>
                      a.id === athlete.id &&
                      ('eventSource' in a ? a.eventSource : undefined) === ('eventSource' in athlete ? athlete.eventSource : undefined)
                    );
                    const isActive = actualIndex === currentIndex;
                    // In multi-event mode, use the athlete's own event name to determine series type and year
                    const athleteSeriesType = isMultiEvent && 'eventName' in athlete
                      ? categorizeSeriesType(athlete.eventName)
                      : eventSeriesType;
                    const athleteEventYear = isMultiEvent && 'eventName' in athlete
                      ? extractSeriesYear(athlete.eventName)
                      : eventYear;
                    const ranking = getAthleteRankingForEventType(seriesData || [], athlete.id, athlete.division, athleteSeriesType, selectedRegion, athleteEventYear);

                    return (
                      <button
                        key={`${athlete.id}-${'eventSource' in athlete ? athlete.eventSource : index}`}
                        onClick={() => onNavigate(actualIndex)}
                        className={`
                          w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors
                          ${isActive ? 'bg-blue-50 border-r-2 border-blue-500' : ''}
                        `}
                      >
                        <div className="flex items-center space-x-3">
                          {/* BIB */}
                          {athlete.bib && (
                            <div className={`
                              flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                              ${isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}
                            `}>
                              {athlete.bib}
                            </div>
                          )}

                          {/* Athlete Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <p className={`
                                text-sm font-medium truncate
                                ${isActive ? 'text-blue-900' : 'text-gray-900'}
                              `}>
                                {athlete.name}
                              </p>
                              <span className="text-lg">{getCountryFlag(athlete.nationality)}</span>
                            </div>

                            <div className="flex items-center space-x-2 mt-1">
                              <span className={`
                                text-xs
                                ${isActive ? 'text-blue-600' : 'text-gray-700'}
                              `}>
                                {getNationalityDisplay(athlete.nationality)}
                              </span>
                              {/* Show single ranking badge for this event's series type */}
                              <RankingBadge ranking={ranking} />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Render without division headers (flat list)
          <div className="divide-y divide-gray-200">
            {filteredAthletes.map((athlete, index) => {
              // Find the actual index in the full athletes array
              const actualIndex = athletes.findIndex(a =>
                a.id === athlete.id &&
                ('eventSource' in a ? a.eventSource : undefined) === ('eventSource' in athlete ? athlete.eventSource : undefined)
              );
              const isActive = actualIndex === currentIndex;
              // In multi-event mode, use the athlete's own event name to determine series type and year
              const athleteSeriesType = isMultiEvent && 'eventName' in athlete
                ? categorizeSeriesType(athlete.eventName)
                : eventSeriesType;
              const athleteEventYear = isMultiEvent && 'eventName' in athlete
                ? extractSeriesYear(athlete.eventName)
                : eventYear;
              const ranking = getAthleteRankingForEventType(seriesData || [], athlete.id, athlete.division, athleteSeriesType, selectedRegion, athleteEventYear);

              return (
                <button
                  key={`${athlete.id}-${'eventSource' in athlete ? athlete.eventSource : index}`}
                  onClick={() => onNavigate(actualIndex)}
                  className={`
                    w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors
                    ${isActive ? 'bg-blue-50 border-r-2 border-blue-500' : ''}
                  `}
                >
                  <div className="flex items-center space-x-3">
                    {/* BIB */}
                    {athlete.bib && (
                      <div className={`
                        flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                        ${isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}
                      `}>
                        {athlete.bib}
                      </div>
                    )}

                    {/* Athlete Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className={`
                          text-sm font-medium truncate
                          ${isActive ? 'text-blue-900' : 'text-gray-900'}
                        `}>
                          {athlete.name}
                        </p>
                        <span className="text-lg">{getCountryFlag(athlete.nationality)}</span>
                      </div>

                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`
                          text-xs
                          ${isActive ? 'text-blue-600' : 'text-gray-700'}
                        `}>
                          {getNationalityDisplay(athlete.nationality)}
                        </span>

                        {/* Show single ranking badge for this event's series type */}
                        <RankingBadge ranking={ranking} />

                        {athlete.status === 'waitlisted' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            WL
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-4 py-2 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          {filteredAthletes.length !== relevantAthletes.length 
            ? t('navigation.athletesFiltered', { 
                filtered: filteredAthletes.length, 
                total: relevantAthletes.length, 
                filteredNationalities, 
                totalNationalities 
              })
            : t('navigation.athletesTotal', { 
                count: relevantAthletes.length, 
                nationalities: totalNationalities 
              })
          }
          {hasBibNumbers && (
            <span className="block text-xs text-green-600 mt-1">
              {t('navigation.waitlistHidden')}
            </span>
          )}
        </p>
      </div>
    </div>
  );
} 