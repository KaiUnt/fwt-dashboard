'use client';

import { useQuery } from '@tanstack/react-query';
import { EventAthletesResponse } from '@/types/athletes';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

export function useEventAthletes(eventId: string) {
  return useQuery({
    queryKey: ['event-athletes', eventId],
    queryFn: () => fetchEventAthletes(eventId),
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
} 