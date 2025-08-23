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
  custom_fields?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export interface CommentatorInfoResponse {
  success: boolean;
  data?: CommentatorInfo;
  error?: string;
  message?: string;
}

export interface CommentatorInfoListResponse {
  success: boolean;
  data?: CommentatorInfo[];
  error?: string;
}

// Friends System Types
export interface UserConnection {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
}

export interface FriendRequest {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  requester?: UserProfile;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  organization: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Friend {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  friend: UserProfile;
}

// Enhanced Commentator Info with Authorship
export interface CommentatorInfoWithAuthor extends CommentatorInfo {
  created_by?: string;
  author_name?: string;
  is_own_data: boolean;
  fieldAuthors?: Record<string, { value: string; author: string; isOwnData: boolean }>;
}

// Tab Data Interface
export interface TabData {
  id: 'mine' | 'all' | string; // string for friend IDs
  label: string;
  author_name?: string;
  count: number;
  data: CommentatorInfoWithAuthor[];
} 