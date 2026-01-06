export interface HeatResult {
  athleteId: string;
  athleteName: string;
  nationality?: string;
  total: number | null;
  place: number | null;
}

export interface Heat {
  id: string;
  round: string;
  status: 'pending' | 'live' | 'in_progress' | 'completed' | 'finished' | string;
  results: HeatResult[];
}

export interface Division {
  id: string;
  name: string;
  status: string;
  heats: Heat[];
}

export interface LiveScoringEvent {
  id: string;
  name: string;
  status: 'upcoming' | 'live' | 'in_progress' | 'completed' | 'finished' | string;
}

export interface LiveScoringResponse {
  event: LiveScoringEvent;
  divisions: Division[];
  last_updated: string;
  cache_ttl: number;
  cached: boolean;
}
