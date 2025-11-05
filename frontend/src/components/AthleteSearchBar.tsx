'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useAdminAthleteSearch } from '@/hooks/useAdminAthleteSearch';

interface AthleteSearchResult {
  id: string;
  name: string;
  last_seen: string;
}

interface AthleteSearchBarProps {
  onSelectAthlete: (athleteId: string, athleteName: string) => void;
}

export function AthleteSearchBar({ onSelectAthlete }: AthleteSearchBarProps) {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: searchResults, isLoading } = useAdminAthleteSearch(query);

  // Close results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show results when we have a query
  useEffect(() => {
    if (query.length >= 2) {
      setShowResults(true);
    } else {
      setShowResults(false);
    }
  }, [query]);

  const handleSelectAthlete = (athlete: AthleteSearchResult) => {
    onSelectAthlete(athlete.id, athlete.name);
    setQuery('');
    setShowResults(false);
  };

  const clearSearch = () => {
    setQuery('');
    setShowResults(false);
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-2xl">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search athlete by name..."
          className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
          autoFocus
        />

        {/* Loading or Clear Button */}
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
          ) : query ? (
            <button
              onClick={clearSearch}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Search Results Dropdown */}
      {showResults && query.length >= 2 && (
        <div className="absolute z-50 mt-2 w-full bg-white rounded-lg shadow-xl border border-gray-200 max-h-96 overflow-y-auto">
          {searchResults && searchResults.length > 0 ? (
            <ul className="py-2">
              {searchResults.map((athlete) => (
                <li key={athlete.id}>
                  <button
                    onClick={() => handleSelectAthlete(athlete)}
                    className="w-full px-4 py-3 hover:bg-blue-50 text-left transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <div className="font-medium text-gray-900 group-hover:text-blue-600">
                        {athlete.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        ID: {athlete.id}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(athlete.last_seen).toLocaleDateString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : !isLoading ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <Search className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No athletes found matching "{query}"</p>
              <p className="text-sm mt-1">Try a different search term</p>
            </div>
          ) : null}
        </div>
      )}

      {/* Helper Text */}
      {!query && (
        <p className="mt-2 text-sm text-gray-500">
          Start typing to search for an athlete (minimum 2 characters)
        </p>
      )}
    </div>
  );
}
