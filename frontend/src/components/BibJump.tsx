'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Hash, Users } from 'lucide-react';
import { Athlete } from '@/types/athletes';
import { getCountryFlag, getNationalityDisplay, matchesNationalitySearch } from '@/utils/nationality';
import { useTranslation } from '@/hooks/useTranslation';

interface BibJumpProps {
  athletes: Athlete[];
  onJump: (bib: string) => void;
  onClose: () => void;
}

export function BibJump({ athletes, onJump, onClose }: BibJumpProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter athletes based on search query (BIB, name, nationality)
  const filteredAthletes = athletes.filter(athlete =>
    athlete.name.toLowerCase().includes(query.toLowerCase()) ||
    athlete.bib?.toString().includes(query) ||
    matchesNationalitySearch(athlete.nationality, query)
  ).slice(0, 12); // Limit to 12 results

  // Get available BIB numbers for display when no query
  const availableBibs = athletes
    .filter(athlete => athlete.bib)
    .map(athlete => athlete.bib!)
    .sort((a, b) => parseInt(a) - parseInt(b));

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
      // If it's a direct BIB match, jump to BIB
      if (availableBibs.includes(query.trim())) {
        onJump(query.trim());
      } else if (filteredAthletes.length > 0) {
        // Jump to first matching athlete
        const athlete = filteredAthletes[0];
        if (athlete.bib) {
          onJump(athlete.bib.toString());
        }
      }
    }
  };

  const handleBibClick = (bib: string) => {
    onJump(bib);
  };

  const handleAthleteClick = (athlete: Athlete) => {
    if (athlete.bib) {
      onJump(athlete.bib.toString());
    }
  };

  const _filteredBibs = availableBibs.filter(bib => 
    bib.includes(query)
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Hash className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">{t('search.searchAthletes')}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Input */}
        <div className="p-6">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="search-input" className="block text-sm font-medium text-gray-700 mb-2">
                {t('search.enterNameBibOrCountry')}:
              </label>
              <input
                id="search-input"
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search.examplePlaceholder')}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg text-gray-950 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={!query.trim() || filteredAthletes.length === 0}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {t('search.jumpToFirstResult')}
            </button>
          </form>

          {/* Search Results or Available BIBs */}
          <div className="mt-6">
            {query ? (
              <>
                <div className="text-sm font-medium text-gray-700 mb-3 flex items-center space-x-2">
                  <Users className="h-4 w-4" />
                  <span>{t('search.searchResults', { count: filteredAthletes.length })}</span>
                </div>
                
                {filteredAthletes.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredAthletes.map((athlete, index) => (
                      <button
                        key={`${athlete.id}-${index}`}
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
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <Hash className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">{t('search.noResults', { query })}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {t('search.tryDifferentSearchTerm')}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                                  <div className="text-sm font-medium text-gray-700 mb-3">
                    {t('search.availableBibNumbers')}:
                  </div>
                
                <div className="max-h-32 overflow-y-auto">
                  <div className="grid grid-cols-6 gap-2">
                    {availableBibs.slice(0, 18).map(bib => (
                      <button
                        key={bib}
                        onClick={() => handleBibClick(bib)}
                        className="p-2 text-sm border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      >
                        {bib}
                      </button>
                    ))}
                    {availableBibs.length > 18 && (
                      <div className="p-2 text-xs text-gray-500 text-center">
                        +{availableBibs.length - 18}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3 rounded-b-xl border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            {t('search.pressEnterToJump')}
          </p>
        </div>
      </div>
    </div>
  );
} 