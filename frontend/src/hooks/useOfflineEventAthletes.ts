'use client';

import { useQuery } from '@tanstack/react-query';
import { useOfflineStorage, useIsOffline } from './useOfflineStorage';
import { EventAthletesResponse } from '@/types/athletes';
import { createEventId } from '@/utils/offlineStorage';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Original online fetch function
async function fetchEventAthletes(eventId: string): Promise<EventAthletesResponse> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/athletes`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch athletes: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Transform the data to match our frontend structure
  const athletes = [];
  for (const division of data.event.eventDivisions) {
    for (const entry of division.entries) {
      if (entry.status === 'confirmed' || entry.status === 'waitlisted') {
        athletes.push({
          id: entry.athlete.id,
          name: entry.athlete.name,
          nationality: entry.athlete.nationality,
          dob: entry.athlete.dob,
          image: entry.athlete.image,
          bib: entry.bib,
          status: entry.status,
          division: division.division.name
        });
      }
    }
  }
  
  // Sort by BIB number
  athletes.sort((a, b) => {
    const bibA = parseInt(a.bib || '999');
    const bibB = parseInt(b.bib || '999');
    return bibA - bibB;
  });
  
  return {
    event: {
      id: data.event.id || eventId,
      name: data.event.name,
      date: data.event.date,
      status: data.event.status
    },
    athletes,
    total: athletes.length
  };
}

// Offline-first hook
export function useOfflineEventAthletes(eventId: string) {
  const isOffline = useIsOffline();
  const { getOfflineEvent } = useOfflineStorage();

  return useQuery({
    queryKey: ['event-athletes', eventId],
    queryFn: async (): Promise<EventAthletesResponse> => {
      // Try online first if we have internet
      if (!isOffline) {
        try {
          return await fetchEventAthletes(eventId);
        } catch {
          // Fall through to offline fallback
        }
      }
      
      // Try offline fallback
      const offlineData = await getOfflineEvent(eventId);
      if (offlineData) {
        return {
          event: {
            id: offlineData.eventData.events[0].id,
            name: offlineData.eventData.events[0].name,
            date: offlineData.eventData.events[0].date,
            status: 'offline' as const
          },
          athletes: offlineData.athletes,
          total: offlineData.athletes.length
        };
      }
      
      // No offline data available
      throw new Error('No offline data available for this event');
    },
    retry: isOffline ? 0 : 2, // Don't retry in offline mode
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Multi-event offline-first hook
export function useOfflineMultiEventAthletes(eventId1: string, eventId2: string) {
  const isOffline = useIsOffline();
  const { getOfflineEvent } = useOfflineStorage();

  return useQuery({
    queryKey: ['multi-event-athletes', eventId1, eventId2],
    queryFn: async () => {
      // Try online first if we have internet
      if (!isOffline) {
        try {
          // Fetch both events from API
          const [event1Data, event2Data] = await Promise.all([
            fetchEventAthletes(eventId1),
            fetchEventAthletes(eventId2)
          ]);
          
          // Add eventSource property to athletes for proper identification
          const athletes1WithSource = event1Data.athletes.map(athlete => ({
            ...athlete,
            eventSource: eventId1,
            eventName: event1Data.event.name
          }));

          const athletes2WithSource = event2Data.athletes.map(athlete => ({
            ...athlete,
            eventSource: eventId2,
            eventName: event2Data.event.name
          }));

          const combinedSorted = [...athletes1WithSource, ...athletes2WithSource].sort((a, b) => {
            const bibA = parseInt(a.bib || '999');
            const bibB = parseInt(b.bib || '999');
            return bibA - bibB;
          });

          return {
            event1: event1Data,
            event2: event2Data,
            combined: {
              athletes: combinedSorted,
              total: event1Data.athletes.length + event2Data.athletes.length
            }
          };
        } catch {
          // Fall through to offline fallback
        }
      }
      
      // Try offline fallback
      const multiEventId = createEventId([eventId1, eventId2]);
      const offlineData = await getOfflineEvent(multiEventId);
      
      if (offlineData) {
        // Find the events in offline data
        const event1 = offlineData.eventData.events.find(e => e.id === eventId1);
        const event2 = offlineData.eventData.events.find(e => e.id === eventId2);
        
        if (event1 && event2) {
          return {
            event1: {
              event: {
                id: event1.id,
                name: event1.name,
                date: event1.date,
                status: 'offline' as const
              },
              athletes: offlineData.athletes.filter(a => a.eventSource === eventId1),
              total: offlineData.athletes.filter(a => a.eventSource === eventId1).length
            },
            event2: {
              event: {
                id: event2.id,
                name: event2.name,
                date: event2.date,
                status: 'offline' as const
              },
              athletes: offlineData.athletes.filter(a => a.eventSource === eventId2),
              total: offlineData.athletes.filter(a => a.eventSource === eventId2).length
            },
            combined: {
              athletes: offlineData.athletes,
              total: offlineData.athletes.length
            }
          };
        }
      }
      
      // No offline data available
      throw new Error('No offline data available for these events');
    },
    retry: isOffline ? 0 : 2, // Don't retry in offline mode
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Helper hook to check if event is available offline
export function useEventAvailabilityStatus(eventId: string) {
  const { getOfflineEventStatus } = useOfflineStorage();
  const isOffline = useIsOffline();
  
  const offlineStatus = getOfflineEventStatus([eventId]);
  
  return {
    isOffline,
    isAvailableOffline: !!offlineStatus,
    isStale: offlineStatus?.isStale || false,
    offlineTimestamp: offlineStatus?.timestamp,
    canAccessOnline: !isOffline,
    recommendedSource: isOffline ? 'offline' : 'online'
  };
} 