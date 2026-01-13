'use client';

import { useState, useMemo } from 'react';
import { Trophy, ChevronDown, ChevronUp, RefreshCw, Radio } from 'lucide-react';
import { useLiveScoring, isEventLive, isEventCompleted } from '@/hooks/useLiveScoring';
import { useTranslation } from '@/hooks/useTranslation';
import { getCountryFlag, getNationalityDisplay } from '@/utils/nationality';
import type { Heat, HeatResult } from '@/types/livescoring';

interface LiveScoringSectionProps {
  eventId: string;
  currentAthleteId?: string;
  defaultCollapsed?: boolean;
  defaultEnabled?: boolean;
}

export function LiveScoringSection({
  eventId,
  currentAthleteId,
  defaultCollapsed = false,
  defaultEnabled = false
}: LiveScoringSectionProps) {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isEnabled, setIsEnabled] = useState(defaultEnabled);
  const { data, isLoading, error, refetch, isFetching } = useLiveScoring(eventId, {
    enabled: isEnabled
  });
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);

  // Set default division when data loads
  const divisions = useMemo(() => data?.divisions || [], [data?.divisions]);
  const activeDivision = useMemo(() => {
    if (selectedDivision) {
      return divisions.find(d => d.id === selectedDivision) || divisions[0];
    }
    return divisions[0];
  }, [divisions, selectedDivision]);

  const eventStatus = data?.event?.status?.toLowerCase() || '';
  const isLive = isEventLive(eventStatus);
  const isCompleted = isEventCompleted(eventStatus);

  if (!isEnabled) {
    return (
      <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-lg p-4 border border-orange-100 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Radio className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-medium text-gray-700">{t('liveScoring.title')}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsEnabled(true)}
            className="px-2 py-1 text-xs font-medium text-gray-900 bg-white border border-gray-300 rounded shadow-sm hover:bg-white/70 transition-colors"
            aria-pressed={false}
          >
            {t('liveScoring.toggleOff')}
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2">{t('liveScoring.disabledHelp')}</p>
      </div>
    );
  }

  // Don't render if no data and not loading (e.g., API not available)
  if (!isLoading && !data && !error) {
    return null;
  }

  // Gracefully handle 404 errors
  if (error) {
    if (error.message?.includes('404')) {
      return null;
    }
    return (
      <div className="bg-red-50 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between text-red-700">
          <div className="flex items-center space-x-2">
            <Radio className="h-4 w-4" />
            <span className="text-sm font-medium">{t('liveScoring.title')}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsEnabled(false)}
            className="px-2 py-1 text-xs font-medium text-gray-900 bg-white border border-gray-300 rounded shadow-sm hover:bg-white/70 transition-colors"
            aria-pressed={true}
          >
            {t('liveScoring.toggleOn')}
          </button>
        </div>
        <p className="text-xs text-red-600 mt-1">{t('liveScoring.error')}</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-4 border border-orange-100 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Radio className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-medium text-gray-700">{t('liveScoring.title')}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsEnabled(false)}
            className="px-2 py-1 text-xs font-medium text-gray-900 bg-white border border-gray-300 rounded shadow-sm hover:bg-white/70 transition-colors"
            aria-pressed={true}
          >
            {t('liveScoring.toggleOn')}
          </button>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
        </div>
      </div>
    );
  }

  // No divisions/heats available
  if (!divisions.length) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Radio className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">{t('liveScoring.title')}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsEnabled(false)}
            className="px-2 py-1 text-xs font-medium text-gray-900 bg-white border border-gray-300 rounded shadow-sm hover:bg-white/70 transition-colors"
            aria-pressed={true}
          >
            {t('liveScoring.toggleOn')}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">{t('liveScoring.noData')}</p>
      </div>
    );
  }

  const getBadgeColor = (place: number | null) => {
    if (!place) return 'bg-gray-100 text-gray-600 border-gray-200';
    if (place === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (place === 2) return 'bg-gray-100 text-gray-800 border-gray-200';
    if (place === 3) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (place <= 5) return 'bg-green-100 text-green-800 border-green-200';
    if (place <= 10) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  const getStatusColor = () => {
    if (isLive) return 'from-red-50 to-orange-50 border-red-200';
    if (isCompleted) return 'from-green-50 to-emerald-50 border-green-200';
    return 'from-orange-50 to-yellow-50 border-orange-100';
  };

  const getStatusIndicator = () => {
    if (isLive) {
      return (
        <span className="flex items-center space-x-1 text-xs text-red-600 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span>LIVE</span>
        </span>
      );
    }
    if (isCompleted) {
      return <span className="text-xs text-green-600 font-medium">{t('liveScoring.completed')}</span>;
    }
    return <span className="text-xs text-orange-600 font-medium">{t('liveScoring.upcoming')}</span>;
  };

  // Get heats with results, sorted by round importance
  const heatsWithResults = (activeDivision?.heats || [])
    .filter(heat => heat.results && heat.results.length > 0)
    .sort((a, b) => {
      // Sort by round: Final > Semi > Quarter > etc.
      const roundOrder: Record<string, number> = {
        'final': 1,
        'semi-final': 2,
        'semifinal': 2,
        'quarter-final': 3,
        'quarterfinal': 3,
      };
      const aOrder = roundOrder[a.round?.toLowerCase()] || 10;
      const bOrder = roundOrder[b.round?.toLowerCase()] || 10;
      return aOrder - bOrder;
    });

  return (
    <div className={`bg-gradient-to-br ${getStatusColor()} rounded-lg p-4 border mb-4`}>
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-white/30 -m-2 p-2 rounded transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Radio className={`h-4 w-4 ${isLive ? 'text-red-600' : 'text-orange-600'}`} />
            <h4 className="text-sm font-medium text-gray-700">{t('liveScoring.title')}</h4>
          </div>
          {getStatusIndicator()}
        </div>

        <div className="flex items-center space-x-2">
          {/* Division selector */}
          {divisions.length > 1 && !isCollapsed && (
            <select
              value={activeDivision?.id || ''}
              onChange={(e) => {
                setSelectedDivision(e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {divisions.map((div) => (
                <option key={div.id} value={div.id}>
                  {div.name}
                </option>
              ))}
            </select>
          )}

          {/* Refresh button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isFetching) {
                refetch();
              }
            }}
            type="button"
            aria-disabled={isFetching}
            className={`p-1 rounded transition-colors ${
              isFetching ? 'cursor-not-allowed opacity-60' : 'hover:bg-white/50'
            }`}
            title={t('buttons.reload')}
          >
            <RefreshCw className={`h-4 w-4 text-gray-600 ${isFetching ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsEnabled(false);
            }}
            className="px-2 py-1 text-xs font-medium text-gray-900 bg-white border border-gray-300 rounded shadow-sm hover:bg-white/70 transition-colors"
            aria-pressed={true}
          >
            {t('liveScoring.toggleOn')}
          </button>

          {/* Collapse toggle */}
          <div className="p-1 bg-white/50 hover:bg-white/70 rounded transition-colors">
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4 text-gray-600" />
            ) : (
              <ChevronUp className="h-4 w-4 text-gray-600" />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          {heatsWithResults.length === 0 ? (
            <p className="text-xs text-gray-500">{t('liveScoring.noResults')}</p>
          ) : (
            heatsWithResults.map((heat) => (
              <HeatResultsCard
                key={heat.id}
                heat={heat}
                currentAthleteId={currentAthleteId}
                getBadgeColor={getBadgeColor}
              />
            ))
          )}

          {/* Last updated */}
          {data?.last_updated && (
            <div className="text-xs text-gray-500 text-right pt-2 border-t border-gray-200">
              {t('liveScoring.lastUpdated')}: {new Date(data.last_updated).toLocaleTimeString()}
              {isLive && ` - ${t('liveScoring.autoRefresh')}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface HeatResultsCardProps {
  heat: Heat;
  currentAthleteId?: string;
  getBadgeColor: (place: number | null) => string;
}

function HeatResultsCard({ heat, currentAthleteId, getBadgeColor }: HeatResultsCardProps) {
  const isHeatLive = heat.status?.toLowerCase() === 'live' || heat.status?.toLowerCase() === 'in_progress';

  return (
    <div className="bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">
      {/* Heat header */}
      <div className={`px-3 py-2 border-b ${isHeatLive ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{heat.round}</span>
          {isHeatLive && (
            <span className="flex items-center space-x-1 text-xs text-red-600">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
              </span>
              <span>LIVE</span>
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="divide-y divide-gray-50">
        {heat.results.map((result, idx) => (
          <ResultRow
            key={result.athleteId || idx}
            result={result}
            isHighlighted={result.athleteId === currentAthleteId}
            getBadgeColor={getBadgeColor}
          />
        ))}
      </div>
    </div>
  );
}

interface ResultRowProps {
  result: HeatResult;
  isHighlighted: boolean;
  getBadgeColor: (place: number | null) => string;
}

function ResultRow({ result, isHighlighted, getBadgeColor }: ResultRowProps) {
  const flag = getCountryFlag(result.nationality);
  const nationality = result.nationality?.trim();
  const nationalityLabel = nationality ? getNationalityDisplay(nationality) : null;

  return (
    <div
      className={`px-3 py-2 flex items-center justify-between ${
        isHighlighted ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
      }`}
    >
      <div className="flex items-center space-x-3">
        {/* Place badge */}
        <div className={`px-2 py-0.5 rounded-full text-xs font-medium border min-w-[32px] text-center ${getBadgeColor(result.place)}`}>
          {result.place ? `#${result.place}` : '-'}
        </div>

        {/* Athlete info */}
        <div className="flex items-center space-x-2">
          {flag && <span className="text-base">{flag}</span>}
          {nationalityLabel && (
            <span className="text-xs font-medium text-gray-700">{nationalityLabel}</span>
          )}
          <span className={`text-sm ${isHighlighted ? 'font-semibold text-blue-900' : 'text-gray-900'}`}>
            {result.athleteName}
          </span>
        </div>
      </div>

      {/* Score */}
      <div className="flex items-center space-x-2">
        {result.place && result.place <= 3 && (
          <Trophy className={`h-4 w-4 ${
            result.place === 1 ? 'text-yellow-500' :
            result.place === 2 ? 'text-gray-400' :
            'text-orange-400'
          }`} />
        )}
        <span className={`text-sm font-medium ${isHighlighted ? 'text-blue-900' : 'text-gray-700'}`}>
          {result.total !== null ? `${result.total.toFixed(1)} pts` : '-'}
        </span>
      </div>
    </div>
  );
}

