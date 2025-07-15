'use client';

interface FilterTabsProps {
  availableYears: number[];
  selectedYear: number | 'all';
  onYearChange: (year: number | 'all') => void;
  totalEvents: number;
  filteredCount: number;
}

export function FilterTabs({ 
  availableYears, 
  selectedYear, 
  onYearChange, 
  totalEvents, 
  filteredCount 
}: FilterTabsProps) {
  const tabs = [
    { key: 'all' as const, label: 'Alle Jahre', count: totalEvents },
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

      {/* Results Counter */}
      <div className="text-sm text-gray-600">
        {filteredCount === totalEvents ? (
          <span>{totalEvents} Events</span>
        ) : (
          <span>
            {filteredCount} von {totalEvents} Events
          </span>
        )}
      </div>
    </div>
  );
} 