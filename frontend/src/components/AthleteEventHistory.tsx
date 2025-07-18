'use client';

import { useState, useEffect } from 'react';
import { Trophy, Calendar, MapPin, TrendingUp } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface EventHistoryResult {
  series_name: string;
  division: string;
  event_name: string;
  place: number;
  points: number;
  date: string;
  year: number;
}

interface EventHistoryResponse {
  athlete_id: string;
  event_id: string;
  current_event: string;
  location: string;
  historical_results: EventHistoryResult[];
  total_results: number;
  message: string;
}

interface AthleteEventHistoryProps {
  athleteId: string;
  eventId: string;
}

export function AthleteEventHistory({ athleteId, eventId }: AthleteEventHistoryProps) {
  const { t } = useTranslation();
  const [eventHistory, setEventHistory] = useState<EventHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEventHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/athlete/${athleteId}/event-history/${eventId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        setEventHistory(data);
      } catch (err) {
        console.error('Error fetching event history:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch event history');
      } finally {
        setLoading(false);
      }
    };

    if (athleteId && eventId) {
      fetchEventHistory();
    }
  }, [athleteId, eventId]);

  if (loading) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center space-x-2 mb-3">
          <MapPin className="h-4 w-4 text-blue-600" />
          <h4 className="text-sm font-medium text-gray-700">{t('athlete.eventHistory.title')}</h4>
        </div>
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    // Gracefully handle 404 errors (feature not yet deployed)
    if (error.includes('404')) {
      return null; // Don't show anything if API endpoint not available yet
    }
    return (
      <div className="bg-red-50 rounded-lg p-4">
        <div className="flex items-center space-x-2 mb-2">
          <MapPin className="h-4 w-4 text-red-600" />
          <h4 className="text-sm font-medium text-red-700">{t('athlete.eventHistory.title')}</h4>
        </div>
        <p className="text-xs text-red-600">{t('athlete.eventHistory.error')}</p>
      </div>
    );
  }

  if (!eventHistory || eventHistory.historical_results.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center space-x-2 mb-2">
          <MapPin className="h-4 w-4 text-gray-500" />
          <h4 className="text-sm font-medium text-gray-700">{t('athlete.eventHistory.title')}</h4>
        </div>
        <p className="text-xs text-gray-500">{t('athlete.eventHistory.noResults')}</p>
      </div>
    );
  }

  const getBadgeColor = (place: number) => {
    if (place === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (place === 2) return 'bg-gray-100 text-gray-800 border-gray-200';
    if (place === 3) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (place <= 5) return 'bg-green-100 text-green-800 border-green-200';
    if (place <= 10) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
      <div className="flex items-center space-x-2 mb-3">
        <MapPin className="h-4 w-4 text-blue-600" />
        <h4 className="text-sm font-medium text-gray-700">
          {t('athlete.eventHistory.title')} - {eventHistory.location}
        </h4>
        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
          {eventHistory.total_results} {t('athlete.eventHistory.results')}
        </span>
      </div>
      
      <div className="space-y-2">
        {eventHistory.historical_results.map((result, index) => (
          <div key={index} className="bg-white rounded-md p-3 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`px-2 py-1 rounded-full text-xs font-medium border ${getBadgeColor(result.place)}`}>
                  #{result.place}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {result.year}
                  </div>
                  <div className="text-xs text-gray-500">
                    {result.points} {t('athlete.eventHistory.points')}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {result.place <= 3 && (
                  <Trophy className="h-4 w-4 text-yellow-500" />
                )}
                {result.place <= 5 && result.place > 3 && (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                )}
                <div className="text-right">
                  <div className="text-xs text-gray-500">
                    {result.division}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {eventHistory.historical_results.length > 0 && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>{t('athlete.eventHistory.bestResult')}: #{Math.min(...eventHistory.historical_results.map(r => r.place))}</span>
            <span>{t('athlete.eventHistory.avgPlace')}: #{Math.round(eventHistory.historical_results.reduce((sum, r) => sum + r.place, 0) / eventHistory.historical_results.length)}</span>
          </div>
        </div>
      )}
    </div>
  );
}