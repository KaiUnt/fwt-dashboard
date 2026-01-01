'use client';

import { Users, Search, SlidersHorizontal, Filter, ChevronDown } from 'lucide-react';
import { Athlete, MultiEventAthlete } from '@/types/athletes';
import { useState, useMemo } from 'react';
import { getCountryFlag, getNationalityDisplay, countUniqueNationalities, matchesNationalitySearch } from '@/utils/nationality';
import { useTranslation } from '@/hooks/useTranslation';
import type { SeriesData, SeriesRegion, AthleteMainRanking, SeriesCategoryType } from '@/hooks/useSeriesRankings';
import { getAthleteRankingForEventType, categorizeSeriesType, extractSeriesYear, isMainSeasonRanking, isMainSeasonRankingForRegion, SERIES_CATEGORY_COLORS } from '@/hooks/useSeriesRankings';
import { normalizeEventNameForMatch, extractYearFromEventName } from '@/utils/eventMatching';

// Sort options
export type SortOption = 'bib' | 'name' | 'division' | 'ranking';

// Division filter options
export type DivisionFilter = 'all' | 'Ski Men' | 'Ski Women' | 'Snowboard Men' | 'Snowboard Women';

type ResultsScope = 'all' | 'event' | 'series';
type TimeWindow = 'lastYear' | 'last3Years' | 'last5Years';
type TopThreshold = 1 | 3 | 5 | 10;

// Division order for sorting (base divisions without age categories)
const DIVISION_ORDER = ['Ski Men', 'Ski Women', 'Snowboard Men', 'Snowboard Women'];

// Helper function to extract base division (removes age category like U-14, U-16, U-18, U-21)
function getBaseDivision(division: string | undefined): string {
  if (!division) return '';
  return division.replace(/\s+U-\d+$/, '');
}

function getYearFromDate(dateString?: string): number | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
}

function getEventYear(eventName?: string, eventDate?: string, fallbackYear?: number): number {
  const dateYear = getYearFromDate(eventDate);
  if (dateYear) return dateYear;
  if (eventName) {
    const nameYear = extractYearFromEventName(eventName);
    if (nameYear) return nameYear;
  }
  return fallbackYear || new Date().getFullYear();
}

function getTimeWindowRange(eventYear: number, timeWindow: TimeWindow): { start: number; end: number } {
  switch (timeWindow) {
    case 'lastYear':
      return { start: eventYear - 1, end: eventYear - 1 };
    case 'last3Years':
      return { start: eventYear - 2, end: eventYear };
    case 'last5Years':
      return { start: eventYear - 4, end: eventYear };
    default:
      return { start: eventYear, end: eventYear };
  }
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
  // Optional: Event date to derive event year when name lacks a year
  eventDate?: string;
  // Optional: Multi-event dates lookup
  eventDates?: { id: string; date?: string }[];
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
  eventName,
  eventDate,
  eventDates = []
}: AthleteNavigationProps) {
  // Determine the series type from the event name (e.g., "FWT Challenger Fieberbrunn 2025" -> 'challenger')
  const eventSeriesType: SeriesCategoryType = useMemo(() => {
    if (!eventName) return 'other';
    return categorizeSeriesType(eventName);
  }, [eventName]);

  // Extract the year from the event name (e.g., "FWT Challenger Fieberbrunn 2025" -> 2025)
  // This ensures we only show rankings from the same year as the event
  const eventYear: number = useMemo(() => {
    return getEventYear(eventName, eventDate);
  }, [eventName, eventDate]);
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('bib');
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>('all');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [resultsScope, setResultsScope] = useState<ResultsScope>('all');
  const [resultsSeriesCategory, setResultsSeriesCategory] = useState<SeriesCategoryType>('pro');
  const [resultsTimeWindow, setResultsTimeWindow] = useState<TimeWindow>('last3Years');
  const [resultsTopThreshold, setResultsTopThreshold] = useState<TopThreshold>(10);
  const [seriesCategoryFilter, setSeriesCategoryFilter] = useState<SeriesCategoryType | 'all'>('all');
  const [seriesTimeWindow, setSeriesTimeWindow] = useState<TimeWindow>('last3Years');
  const [seriesTopThreshold, setSeriesTopThreshold] = useState<TopThreshold | 'any'>('any');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const eventDateById = useMemo(() => {
    const map = new Map<string, string | undefined>();
    eventDates.forEach(entry => {
      map.set(entry.id, entry.date);
    });
    return map;
  }, [eventDates]);

  const resetFilters = () => {
    setDivisionFilter('all');
    setEventFilter('all');
    setResultsScope('all');
    setResultsSeriesCategory('pro');
    setResultsTimeWindow('last3Years');
    setResultsTopThreshold(10);
    setSeriesCategoryFilter('all');
    setSeriesTimeWindow('last3Years');
    setSeriesTopThreshold('any');
  };

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

  const athleteFilterIndex = useMemo(() => {
    if (!seriesData) return null;

    type AthleteFilterIndex = {
      seriesByYearCategory: Map<number, Map<SeriesCategoryType, number>>;
      eventByYearCategory: Map<number, Map<SeriesCategoryType, number>>;
      eventByYearKey: Map<number, Map<string, number>>;
    };

    const index = new Map<string, Map<string, AthleteFilterIndex>>();

    const ensureIndex = (athleteId: string, baseDivision: string) => {
      let athleteMap = index.get(athleteId);
      if (!athleteMap) {
        athleteMap = new Map<string, AthleteFilterIndex>();
        index.set(athleteId, athleteMap);
      }

      let divisionIndex = athleteMap.get(baseDivision);
      if (!divisionIndex) {
        divisionIndex = {
          seriesByYearCategory: new Map(),
          eventByYearCategory: new Map(),
          eventByYearKey: new Map()
        };
        athleteMap.set(baseDivision, divisionIndex);
      }

      return divisionIndex;
    };

    const updateBestPlace = (
      target: Map<number, Map<string, number>>,
      year: number,
      key: string,
      place?: number
    ) => {
      if (!place || place <= 0 || !key) return;
      let yearMap = target.get(year);
      if (!yearMap) {
        yearMap = new Map<string, number>();
        target.set(year, yearMap);
      }
      const existing = yearMap.get(key);
      if (!existing || place < existing) {
        yearMap.set(key, place);
      }
    };

    const updateBestCategoryPlace = (
      target: Map<number, Map<SeriesCategoryType, number>>,
      year: number,
      category: SeriesCategoryType,
      place?: number
    ) => {
      if (!place || place <= 0) return;
      let yearMap = target.get(year);
      if (!yearMap) {
        yearMap = new Map<SeriesCategoryType, number>();
        target.set(year, yearMap);
      }
      const existing = yearMap.get(category);
      if (!existing || place < existing) {
        yearMap.set(category, place);
      }
    };

    for (const series of seriesData) {
      if (!isMainSeasonRanking(series.series_name)) {
        continue;
      }

      const seriesCategory = categorizeSeriesType(series.series_name);
      const seriesYear = extractSeriesYear(series.series_name);
      const isRegionMatch = isMainSeasonRankingForRegion(series.series_name, selectedRegion);

      for (const [divisionName, rankings] of Object.entries(series.divisions)) {
        const baseDivision = getBaseDivision(divisionName) || '';
        for (const ranking of rankings) {
          const athleteId = ranking.athlete.id;
          const divisionIndex = ensureIndex(athleteId, baseDivision);
          const aggregateIndex = ensureIndex(athleteId, '*');

          if (isRegionMatch) {
            updateBestCategoryPlace(divisionIndex.seriesByYearCategory, seriesYear, seriesCategory, ranking.place);
            updateBestCategoryPlace(aggregateIndex.seriesByYearCategory, seriesYear, seriesCategory, ranking.place);
          }

          if (ranking.results) {
            for (const result of ranking.results) {
              const eventInfo = result.eventDivision?.event || result.event;
              const eventName = eventInfo?.name || '';
              const eventDate = eventInfo?.date;
              const eventYear = getEventYear(eventName, eventDate, seriesYear);
              const eventKey = normalizeEventNameForMatch(eventName);

              if (isRegionMatch) {
                updateBestCategoryPlace(divisionIndex.eventByYearCategory, eventYear, seriesCategory, result.place);
                updateBestCategoryPlace(aggregateIndex.eventByYearCategory, eventYear, seriesCategory, result.place);
              }
              updateBestPlace(divisionIndex.eventByYearKey, eventYear, eventKey, result.place);
              updateBestPlace(aggregateIndex.eventByYearKey, eventYear, eventKey, result.place);
            }
          }
        }
      }
    }

    return index;
  }, [seriesData, selectedRegion]);

  // Apply filters and sorting
  const processedAthletes = useMemo(() => {
    let result = [...relevantAthletes];

    const getAthleteIndex = (athlete: Athlete | MultiEventAthlete) => {
      const baseDivision = getBaseDivision(athlete.division) || '*';
      const athleteMap = athleteFilterIndex?.get(athlete.id);
      return athleteMap?.get(baseDivision) || athleteMap?.get('*') || null;
    };

    const getAthleteEventInfo = (athlete: Athlete | MultiEventAthlete) => {
      const athleteEventName = isMultiEvent && 'eventName' in athlete ? athlete.eventName : eventName || '';
      const athleteEventDate = isMultiEvent && 'eventSource' in athlete
        ? eventDateById.get(athlete.eventSource)
        : eventDate;
      const athleteEventYear = getEventYear(athleteEventName, athleteEventDate);
      const athleteEventKey = normalizeEventNameForMatch(athleteEventName);
      return { athleteEventName, athleteEventDate, athleteEventYear, athleteEventKey };
    };

    const hasCategoryMatchInRange = (
      byYear: Map<number, Map<SeriesCategoryType, number>>,
      category: SeriesCategoryType,
      start: number,
      end: number,
      topThreshold?: TopThreshold
    ) => {
      for (let year = start; year <= end; year += 1) {
        const yearMap = byYear.get(year);
        const place = yearMap?.get(category);
        if (!place) continue;
        if (!topThreshold || place <= topThreshold) {
          return true;
        }
      }
      return false;
    };

    const hasEventMatchInRange = (
      byYear: Map<number, Map<string, number>>,
      eventKey: string,
      start: number,
      end: number,
      topThreshold: TopThreshold
    ) => {
      if (!eventKey) return false;
      for (let year = start; year <= end; year += 1) {
        const yearMap = byYear.get(year);
        const place = yearMap?.get(eventKey);
        if (place && place <= topThreshold) {
          return true;
        }
      }
      return false;
    };

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

    // Apply results filter
    if (resultsScope !== 'all') {
      result = result.filter(athlete => {
        const athleteIndex = getAthleteIndex(athlete);
        if (!athleteIndex) return false;

        const { athleteEventYear, athleteEventKey } = getAthleteEventInfo(athlete);
        const range = getTimeWindowRange(athleteEventYear, resultsTimeWindow);

        if (resultsScope === 'event') {
          return hasEventMatchInRange(
            athleteIndex.eventByYearKey,
            athleteEventKey,
            range.start,
            range.end,
            resultsTopThreshold
          );
        }

        if (resultsScope === 'series') {
          return hasCategoryMatchInRange(
            athleteIndex.eventByYearCategory,
            resultsSeriesCategory,
            range.start,
            range.end,
            resultsTopThreshold
          );
        }

        return true;
      });
    }

    // Apply series filter
    if (seriesCategoryFilter !== 'all') {
      result = result.filter(athlete => {
        const athleteIndex = getAthleteIndex(athlete);
        if (!athleteIndex) return false;

        const { athleteEventYear } = getAthleteEventInfo(athlete);
        const range = getTimeWindowRange(athleteEventYear, seriesTimeWindow);

        return hasCategoryMatchInRange(
          athleteIndex.seriesByYearCategory,
          seriesCategoryFilter,
          range.start,
          range.end,
          seriesTopThreshold === 'any' ? undefined : seriesTopThreshold
        );
      });
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
          const yearA = isMultiEvent && 'eventName' in a
            ? getEventYear(a.eventName, 'eventSource' in a ? eventDateById.get(a.eventSource) : undefined, eventYear)
            : eventYear;
          const yearB = isMultiEvent && 'eventName' in b
            ? getEventYear(b.eventName, 'eventSource' in b ? eventDateById.get(b.eventSource) : undefined, eventYear)
            : eventYear;
          const rankA = getAthleteRankingPlace(a.id, a.division, seriesData, seriesTypeA, selectedRegion, yearA) ?? 5000;
          const rankB = getAthleteRankingPlace(b.id, b.division, seriesData, seriesTypeB, selectedRegion, yearB) ?? 5000;
          return rankA - rankB;
        });
        break;
    }

    return result;
  }, [
    relevantAthletes,
    searchQuery,
    divisionFilter,
    eventFilter,
    resultsScope,
    resultsSeriesCategory,
    resultsTimeWindow,
    resultsTopThreshold,
    seriesCategoryFilter,
    seriesTimeWindow,
    seriesTopThreshold,
    sortOption,
    seriesData,
    athleteFilterIndex,
    isMultiEvent,
    selectedRegion,
    eventSeriesType,
    eventYear,
    eventName,
    eventDate,
    eventDateById
  ]);

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
                setShowFilterPanel(false);
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

          {/* Filter Panel Trigger */}
          <div className="relative flex-1">
            <button
              onClick={() => {
                setShowSortDropdown(false);
                setShowFilterPanel(true);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg transition-colors ${
                divisionFilter !== 'all' || eventFilter !== 'all' || resultsScope !== 'all' || seriesCategoryFilter !== 'all'
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
                  : resultsScope !== 'all' || seriesCategoryFilter !== 'all'
                  ? t('navigation.filter.filtered')
                  : t('navigation.filter.all')}
              </span>
              <ChevronDown className="h-4 w-4 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {showFilterPanel && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowFilterPanel(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-white rounded-t-2xl shadow-xl flex flex-col sm:top-0 sm:bottom-auto sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-96 sm:rounded-none">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <h4 className="text-sm font-semibold text-gray-900">{t('navigation.filter.filtersTitle')}</h4>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetFilters}
                  className="text-xs text-gray-600 hover:text-gray-900"
                >
                  {t('navigation.filter.reset')}
                </button>
                <button
                  onClick={() => setShowFilterPanel(false)}
                  className="text-xs text-gray-600 hover:text-gray-900"
                >
                  {t('buttons.close')}
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-4 py-3 space-y-4">
              {/* Division filters */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {t('navigation.filter.division')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDivisionFilter('all')}
                    className={`px-3 py-2 text-sm rounded-lg border ${
                      divisionFilter === 'all' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {t('navigation.filter.allDivisions')}
                  </button>
                  {availableDivisions.map((division) => (
                    <button
                      key={division}
                      onClick={() => setDivisionFilter(division as DivisionFilter)}
                      className={`px-3 py-2 text-sm rounded-lg border ${
                        divisionFilter === division ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {division}
                    </button>
                  ))}
                </div>
              </div>

              {/* Event filters (only for multi-event) */}
              {isMultiEvent && availableEvents.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {t('navigation.filter.event')}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEventFilter('all')}
                      className={`px-3 py-2 text-sm rounded-lg border ${
                        eventFilter === 'all' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {t('navigation.filter.allEvents')}
                    </button>
                    {availableEvents.map((eventId) => {
                      const eventName = eventNames.find(e => e.id === eventId)?.name || eventId;
                      return (
                        <button
                          key={eventId}
                          onClick={() => setEventFilter(eventId)}
                          className={`px-3 py-2 text-sm rounded-lg border ${
                            eventFilter === eventId ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {eventName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Results filters */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {t('navigation.filter.results')}
                </div>
                <div className="text-xs font-medium text-gray-500 mb-2">
                  {t('navigation.filter.scope')}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {([
                    { value: 'all', label: t('navigation.filter.all') },
                    { value: 'event', label: t('navigation.filter.scopeEvent') },
                    { value: 'series', label: t('navigation.filter.scopeSeries') }
                  ] as Array<{ value: ResultsScope; label: string }>).map(option => (
                    <button
                      key={option.value}
                      onClick={() => setResultsScope(option.value)}
                      className={`px-3 py-2 text-sm rounded-lg border text-left ${
                        resultsScope === option.value ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {resultsScope === 'series' && (
                  <>
                    <div className="text-xs font-medium text-gray-500 mt-3 mb-2">
                      {t('navigation.filter.category')}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['pro', 'challenger', 'qualifier', 'junior', 'junior_wc'] as SeriesCategoryType[]).map(category => (
                        <button
                          key={category}
                          onClick={() => setResultsSeriesCategory(category)}
                          className={`px-3 py-2 text-sm rounded-lg border ${
                            resultsSeriesCategory === category ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {t(`navigation.filter.seriesCategory.${category}`)}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {resultsScope !== 'all' && (
                  <>
                    <div className="text-xs font-medium text-gray-500 mt-3 mb-2">
                      {t('navigation.filter.timeWindow')}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'lastYear', label: t('navigation.filter.lastYear') },
                        { value: 'last3Years', label: t('navigation.filter.last3Years') },
                        { value: 'last5Years', label: t('navigation.filter.last5Years') }
                      ] as Array<{ value: TimeWindow; label: string }>).map(option => (
                        <button
                          key={option.value}
                          onClick={() => setResultsTimeWindow(option.value)}
                          className={`px-2 py-2 text-xs rounded-lg border ${
                            resultsTimeWindow === option.value ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <div className="text-xs font-medium text-gray-500 mt-3 mb-2">
                      {t('navigation.filter.top')}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {([1, 3, 5, 10] as TopThreshold[]).map(threshold => (
                        <button
                          key={threshold}
                          onClick={() => setResultsTopThreshold(threshold)}
                          className={`px-2 py-2 text-xs rounded-lg border ${
                            resultsTopThreshold === threshold ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {t(`navigation.filter.top${threshold}`)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Series filters */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {t('navigation.filter.series')}
                </div>
                <div className="text-xs font-medium text-gray-500 mb-2">
                  {t('navigation.filter.category')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSeriesCategoryFilter('all')}
                    className={`px-3 py-2 text-sm rounded-lg border ${
                      seriesCategoryFilter === 'all' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {t('navigation.filter.all')}
                  </button>
                  {(['pro', 'challenger', 'qualifier', 'junior', 'junior_wc'] as SeriesCategoryType[]).map(category => (
                    <button
                      key={category}
                      onClick={() => setSeriesCategoryFilter(category)}
                      className={`px-3 py-2 text-sm rounded-lg border ${
                        seriesCategoryFilter === category ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {t(`navigation.filter.seriesCategory.${category}`)}
                    </button>
                  ))}
                </div>

                {seriesCategoryFilter !== 'all' && (
                  <>
                    <div className="text-xs font-medium text-gray-500 mt-3 mb-2">
                      {t('navigation.filter.timeWindow')}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'lastYear', label: t('navigation.filter.lastYear') },
                        { value: 'last3Years', label: t('navigation.filter.last3Years') },
                        { value: 'last5Years', label: t('navigation.filter.last5Years') }
                      ] as Array<{ value: TimeWindow; label: string }>).map(option => (
                        <button
                          key={option.value}
                          onClick={() => setSeriesTimeWindow(option.value)}
                          className={`px-2 py-2 text-xs rounded-lg border ${
                            seriesTimeWindow === option.value ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <div className="text-xs font-medium text-gray-500 mt-3 mb-2">
                      {t('navigation.filter.top')}
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      <button
                        onClick={() => setSeriesTopThreshold('any')}
                        className={`px-2 py-2 text-xs rounded-lg border ${
                          seriesTopThreshold === 'any' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {t('navigation.filter.any')}
                      </button>
                      {([1, 3, 5, 10] as TopThreshold[]).map(threshold => (
                        <button
                          key={threshold}
                          onClick={() => setSeriesTopThreshold(threshold)}
                          className={`px-2 py-2 text-xs rounded-lg border ${
                            seriesTopThreshold === threshold ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {t(`navigation.filter.top${threshold}`)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                      ? getEventYear(athlete.eventName, 'eventSource' in athlete ? eventDateById.get(athlete.eventSource) : undefined, eventYear)
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
                ? getEventYear(athlete.eventName, 'eventSource' in athlete ? eventDateById.get(athlete.eventSource) : undefined, eventYear)
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
