'use client';

import { Calendar, MapPin, ArrowRight, Check, CheckCircle, Archive } from 'lucide-react';
import { FWTEvent } from '@/types/events';
import { useTranslation } from '@/hooks/useTranslation';

interface EventCardProps {
  event: FWTEvent;
  onClick: () => void;
  isMultiMode?: boolean;
  isSelected?: boolean;
  isSelectable?: boolean;
}

export function EventCard({ 
  event, 
  onClick, 
  isMultiMode = false, 
  isSelected = false, 
  isSelectable = true 
}: EventCardProps) {
  const { t } = useTranslation();
  
  // Extract event type from name (Pro, Challenger, Junior)
  const getEventType = (name: string): string => {
    if (name.toLowerCase().includes('pro')) return 'Pro';
    if (name.toLowerCase().includes('challenger')) return 'Challenger';
    if (name.toLowerCase().includes('junior')) return 'Junior';
    return 'Event';
  };

  const eventType = getEventType(event.name);
  
  // Color scheme based on event type and status
  const getTypeColors = (type: string, isPast: boolean = false) => {
    // Past events get muted colors
    if (isPast) {
      return {
        bg: 'bg-gradient-to-r from-gray-400 to-gray-500',
        badge: 'bg-gray-100 text-gray-700',
        border: 'border-gray-300'
      };
    }

    switch (type) {
      case 'Pro':
        return {
          bg: 'bg-gradient-to-r from-red-500 to-pink-600',
          badge: 'bg-red-100 text-red-800',
          border: 'border-red-200'
        };
      case 'Challenger':
        return {
          bg: 'bg-gradient-to-r from-blue-500 to-indigo-600',
          badge: 'bg-blue-100 text-blue-800',
          border: 'border-blue-200'
        };
      case 'Junior':
        return {
          bg: 'bg-gradient-to-r from-green-500 to-emerald-600',
          badge: 'bg-green-100 text-green-800',
          border: 'border-green-200'
        };
      default:
        return {
          bg: 'bg-gradient-to-r from-gray-500 to-slate-600',
          badge: 'bg-gray-100 text-gray-800',
          border: 'border-gray-200'
        };
    }
  };

  const isPastEvent = event.is_past || event.status === 'completed';
  const colors = getTypeColors(eventType, isPastEvent);

  return (
    <div 
      onClick={isSelectable ? onClick : undefined}
      className={`
        bg-white rounded-xl shadow-md transition-all duration-300 
        overflow-hidden group border
        ${isSelectable ? 'cursor-pointer hover:shadow-xl hover:scale-[1.02] hover:-translate-y-1' : 'cursor-not-allowed opacity-50'}
        ${isSelected ? `${colors.border} ring-2 ring-blue-500 ring-opacity-50` : colors.border}
        ${isMultiMode && isSelected ? 'shadow-lg' : ''}
      `}
    >
      {/* Header with gradient */}
      <div className={`${colors.bg} p-4 text-white relative`}>
        {/* Multi-mode selection indicator */}
        {isMultiMode && (
          <div className="absolute top-3 right-3">
            {isSelected ? (
              <div className="bg-white rounded-full p-1">
                <Check className="h-4 w-4 text-blue-600" />
              </div>
            ) : (
              <div className="border-2 border-white border-opacity-60 rounded-full w-6 h-6" />
            )}
          </div>
        )}
        
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <div className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${colors.badge}`}>
                {eventType}
              </div>
              {isPastEvent && (
                <div className="inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  <CheckCircle className="h-3 w-3" />
                  <span>{t('events.completed')}</span>
                </div>
              )}
            </div>
            <h3 className={`font-bold text-lg leading-tight ${isPastEvent ? 'opacity-90' : ''}`}>
              {event.name}
            </h3>
          </div>
          {!isMultiMode && (
            <>
              {isPastEvent ? (
                <Archive className="h-5 w-5 opacity-60" />
              ) : (
                <ArrowRight className="h-5 w-5 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
              )}
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="space-y-3">
          {/* Date */}
          <div className="flex items-center space-x-2 text-gray-600">
            <Calendar className="h-4 w-4" />
            <span className="text-sm font-medium">{event.formatted_date}</span>
            <span className="text-xs text-gray-400">({event.year})</span>
          </div>

          {/* Location */}
          <div className="flex items-center space-x-2 text-gray-600">
            <MapPin className="h-4 w-4" />
            <span className="text-sm font-medium">{event.location}</span>
          </div>
        </div>

        {/* Action hint */}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center group-hover:text-gray-700 transition-colors">
            {isPastEvent 
              ? t('events.pastEventArchive')
              : isMultiMode 
                ? (isSelected ? t('events.eventSelected') : t('events.clickToSelect'))
                : t('events.clickToOpenDashboard')
            }
          </p>
        </div>
      </div>
    </div>
  );
} 