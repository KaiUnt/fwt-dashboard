export interface FWTEvent {
  id: string;
  name: string;
  date: string;
  formatted_date: string;
  location: string;
  year: number;
  is_past?: boolean;
  status?: 'upcoming' | 'completed';
}

export interface EventsResponse {
  events: FWTEvent[];
  total: number;
  message: string;
} 