'use client';

import { useTranslation } from '@/hooks/useTranslation';
import { Clock, History, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';

interface FilterTabsProps {
  availableYears: number[];
  selectedYear: number | 'all';
  onYearChange: (year: number | 'all') => void;
  totalEvents: number;
  filteredCount: number;
  // Controls moved from header into this right-side controls area
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isLoading?: boolean;
  includePastEvents?: boolean;
  onTogglePastEvents?: () => void;
  isMultiEventMode?: boolean;
  onToggleMultiEventMode?: () => void;
}

export function FilterTabs({ 
  availableYears, 
  selectedYear, 
  onYearChange, 
  totalEvents, 
  filteredCount,
  onRefresh,
  isRefreshing,
  isLoading,
  includePastEvents,
  onTogglePastEvents,
  isMultiEventMode,
  onToggleMultiEventMode,
}: FilterTabsProps) {
  const { t } = useTranslation();
  
  const tabs = [
    { key: 'all' as const, label: t('filters.allYears'), count: totalEvents },
    ...availableYears.map(year => ({ 
      key: year, 
      label: year.toString(), 
      count: 0 // Will be calculated below 
    }))
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      {/* Year Filter Tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onYearChange(tab.key)}
            className={`
              px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
              ${selectedYear === tab.key
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }
            `}
          >
            {tab.label}
            {tab.key === 'all' && (
              <span className="ml-1 text-xs text-gray-500">
                ({totalEvents})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Right-aligned controls (no results counter) */}
      <div className="flex items-center justify-end gap-3">
        {/* Action Buttons moved from header */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={!!isRefreshing || !!isLoading}
            className="flex items-center space-x-2 px-3 py-2 rounded-lg border-2 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-all duration-200 disabled:opacity-50"
            title={t('events.refreshTitle')}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="font-medium text-sm">
              {isRefreshing ? t('buttons.updating') : t('buttons.update')}
            </span>
          </button>
        )}

        {onTogglePastEvents !== undefined && (
          <button
            onClick={onTogglePastEvents}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg border-2 transition-all duration-200 ${
              includePastEvents
                ? 'bg-orange-50 border-orange-200 text-orange-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
            title={t('events.showPastEvents')}
          >
            {includePastEvents ? (
              <History className="h-4 w-4 text-orange-600" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            <span className="font-medium text-sm">
              {includePastEvents ? t('buttons.allEvents') : t('buttons.showAllEvents')}
            </span>
          </button>
        )}

        {onToggleMultiEventMode !== undefined && (
          <button
            onClick={onToggleMultiEventMode}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg border-2 transition-all duration-200 ${
              isMultiEventMode
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            {isMultiEventMode ? (
              <ToggleRight className="h-4 w-4 text-blue-600" />
            ) : (
              <ToggleLeft className="h-4 w-4" />
            )}
            <span className="font-medium text-sm">{t('buttons.multiEventMode')}</span>
          </button>
        )}
      </div>
    </div>
  );
} 