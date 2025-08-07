'use client';

import { Users, Search } from 'lucide-react';
import { Athlete, MultiEventAthlete } from '@/types/athletes';
import { useState } from 'react';
import { getCountryFlag, getNationalityDisplay, countUniqueNationalities, matchesNationalitySearch } from '@/utils/nationality';
import { useTranslation } from '@/hooks/useTranslation';

interface AthleteNavigationProps {
  athletes: (Athlete | MultiEventAthlete)[];
  currentIndex: number;
  onNavigate: (index: number) => void;
}

export function AthleteNavigation({ athletes, currentIndex, onNavigate }: AthleteNavigationProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  // Check if any athlete has a BIB number - if yes, hide waitlisted athletes
  const hasBibNumbers = athletes.some(athlete => athlete.bib);
  
  // Filter out waitlisted athletes if BIB numbers are assigned
  const relevantAthletes = hasBibNumbers 
    ? athletes.filter(athlete => athlete.status === 'confirmed')
    : athletes;

  const filteredAthletes = relevantAthletes.filter(athlete =>
    athlete.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    athlete.bib?.toString().includes(searchQuery) ||
    matchesNationalitySearch(athlete.nationality, searchQuery)
  );

  // Count unique nationalities using the new utility
  const totalNationalities = countUniqueNationalities(relevantAthletes);
  const filteredNationalities = countUniqueNationalities(filteredAthletes);

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
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
      </div>

      {/* Athletes List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredAthletes.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">{t('search.noAthletesFound')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredAthletes.map((athlete, index) => {
              // Find the actual index in the full athletes array  
              const actualIndex = athletes.findIndex(a => 
                a.id === athlete.id && 
                ('eventSource' in a ? a.eventSource : undefined) === ('eventSource' in athlete ? athlete.eventSource : undefined)
              );
              const isActive = actualIndex === currentIndex;
              
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