'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search, Users } from 'lucide-react';
import { Athlete } from '@/types/athletes';
import { getCountryFlag, getNationalityDisplay, matchesNationalitySearch } from '@/utils/nationality';
import { useTranslation } from '@/hooks/useTranslation';

interface QuickSearchProps {
  athletes: Athlete[];
  onSearch: (query: string) => void;
  onClose: () => void;
}

export function QuickSearch({ athletes, onSearch, onClose }: QuickSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter athletes based on search query
  const filteredAthletes = athletes.filter(athlete =>
    athlete.name.toLowerCase().includes(query.toLowerCase()) ||
    athlete.bib?.toString().includes(query) ||
    matchesNationalitySearch(athlete.nationality, query)
  ).slice(0, 8); // Limit to 8 results

  useEffect(() => {
    // Focus input when modal opens
    if (inputRef.current) {
      inputRef.current.focus();
    }

    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleAthleteClick = (athlete: Athlete) => {
    onSearch(athlete.name);
  };


  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-20 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Search className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Athleten suchen</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-6">
          <form onSubmit={handleSubmit}>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, BIB oder Land eingeben..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </form>

          {/* Search Results */}
          {query && (
            <div className="mt-4">
              <div className="text-sm font-medium text-gray-700 mb-3 flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Suchergebnisse ({filteredAthletes.length})</span>
              </div>
              
              {filteredAthletes.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredAthletes.map((athlete, index) => (
                    <button
                      key={`${athlete.id}-${'eventSource' in athlete ? athlete.eventSource : index}`}
                      onClick={() => handleAthleteClick(athlete)}
                      className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        {/* BIB */}
                        {athlete.bib && (
                          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-bold">
                            {athlete.bib}
                          </div>
                        )}
                        
                        {/* Athlete Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {athlete.name}
                            </p>
                            <span className="text-lg">{getCountryFlag(athlete.nationality)}</span>
                          </div>
                          
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="text-xs text-gray-500">
                              {getNationalityDisplay(athlete.nationality)}
                            </span>
                            
                            {athlete.division && (
                              <span className="text-xs text-gray-500">
                                • {athlete.division}
                              </span>
                            )}
                            
                            {athlete.status === 'waitlisted' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Warteliste
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">{t('search.noResults', { query })}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Versuche einen anderen Suchbegriff
                  </p>
                </div>
              )}
            </div>
          )}

          {/* No Query State */}
          {!query && (
            <div className="text-center text-gray-500 py-8">
              <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">Gib einen Namen, BIB-Nummer oder Land ein</p>
              <p className="text-xs text-gray-400 mt-1">
                z.B. "Schmidt", "15" oder "Germany"
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3 rounded-b-xl border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Drücke <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Enter</kbd> um zum ersten Ergebnis zu springen
          </p>
        </div>
      </div>
    </div>
  );
} 