export interface Athlete {
  id: string;
  name: string;
  nationality?: string;
  dob?: string;
  image?: string;
  bib?: string;
  status: 'confirmed' | 'waitlisted';
  division?: string;
}

export interface MultiEventAthlete extends Athlete {
  eventSource: string;
  eventName: string;
}

export interface EventInfo {
  id: string;
  name: string;
  date: string;
  status: string;
}

export interface EventAthletesResponse {
  event: EventInfo;
  athletes: Athlete[];
  total: number;
}

// Commentator Info Types
export interface CommentatorInfo {
  id?: string;
  athlete_id: string;
  homebase?: string;
  team?: string;
  sponsors?: string;
  favorite_trick?: string;
  achievements?: string;
  injuries?: string;
  fun_facts?: string;
  notes?: string;
  social_media?: {
    instagram?: string;
    youtube?: string;
    website?: string;
  };
  created_at?: string;
  updated_at?: string;
}

export interface CommentatorInfoResponse {
  success: boolean;
  data?: CommentatorInfo;
  error?: string;
}

export interface CommentatorInfoListResponse {
  success: boolean;
  data?: CommentatorInfo[];
  error?: string;
} 