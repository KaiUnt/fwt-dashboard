export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      commentator_info: {
        Row: {
          id: string
          athlete_id: string
          homebase: string | null
          team: string | null
          sponsors: string | null
          favorite_trick: string | null
          achievements: string | null
          injuries: string | null
          fun_facts: string | null
          notes: string | null
          social_media: Json | null
          created_at: string | null
          updated_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          athlete_id: string
          homebase?: string | null
          team?: string | null
          sponsors?: string | null
          favorite_trick?: string | null
          achievements?: string | null
          injuries?: string | null
          fun_facts?: string | null
          notes?: string | null
          social_media?: Json | null
          created_at?: string | null
          updated_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          athlete_id?: string
          homebase?: string | null
          team?: string | null
          sponsors?: string | null
          favorite_trick?: string | null
          achievements?: string | null
          injuries?: string | null
          fun_facts?: string | null
          notes?: string | null
          social_media?: Json | null
          created_at?: string | null
          updated_at?: string | null
          deleted_at?: string | null
        }
      }
      user_profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          role: 'admin' | 'commentator' | 'viewer'
          organization: string | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          role?: 'admin' | 'commentator' | 'viewer'
          organization?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          role?: 'admin' | 'commentator' | 'viewer'
          organization?: string | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      user_login_activity: {
        Row: {
          id: string
          user_id: string | null
          login_timestamp: string | null
          ip_address: string | null
          user_agent: string | null
          device_info: Json | null
          location_info: Json | null
          session_duration: string | null
          logout_timestamp: string | null
          login_method: 'email' | 'google' | 'github' | 'microsoft'
        }
        Insert: {
          id?: string
          user_id?: string | null
          login_timestamp?: string | null
          ip_address?: string | null
          user_agent?: string | null
          device_info?: Json | null
          location_info?: Json | null
          session_duration?: string | null
          logout_timestamp?: string | null
          login_method?: 'email' | 'google' | 'github' | 'microsoft'
        }
        Update: {
          id?: string
          user_id?: string | null
          login_timestamp?: string | null
          ip_address?: string | null
          user_agent?: string | null
          device_info?: Json | null
          location_info?: Json | null
          session_duration?: string | null
          logout_timestamp?: string | null
          login_method?: 'email' | 'google' | 'github' | 'microsoft'
        }
      }
      user_actions: {
        Row: {
          id: string
          user_id: string | null
          action_type: string
          resource_type: string | null
          resource_id: string | null
          action_details: Json | null
          timestamp: string | null
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          action_type: string
          resource_type?: string | null
          resource_id?: string | null
          action_details?: Json | null
          timestamp?: string | null
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          action_type?: string
          resource_type?: string | null
          resource_id?: string | null
          action_details?: Json | null
          timestamp?: string | null
          ip_address?: string | null
          user_agent?: string | null
        }
      }
      athlete_runs: {
        Row: {
          id: string
          athlete_id: string
          event_id: string
          event_name: string | null
          year: number
          youtube_url: string
          youtube_timestamp: number | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          athlete_id: string
          event_id: string
          event_name?: string | null
          year: number
          youtube_url: string
          youtube_timestamp?: number | null
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          athlete_id?: string
          event_id?: string
          event_name?: string | null
          year?: number
          youtube_url?: string
          youtube_timestamp?: number | null
          created_at?: string
          created_by?: string | null
        }
      }
      athletes: {
        Row: {
          id: string
          name: string
          last_seen: string
        }
        Insert: {
          id: string
          name: string
          last_seen?: string
        }
        Update: {
          id?: string
          name?: string
          last_seen?: string
        }
      }
    }
    Views: {
      active_sessions: {
        Row: {
          full_name: string | null
          email: string | null
          role: 'admin' | 'commentator' | 'viewer' | null
          login_timestamp: string | null
          ip_address: string | null
          session_minutes: number | null
        }
      }
    }
    Functions: {
      log_user_action: {
        Args: {
          p_action_type: string
          p_resource_type?: string
          p_resource_id?: string
          p_action_details?: Json
        }
        Returns: void
      }
    }
  }
}

export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type UserAction = Database['public']['Tables']['user_actions']['Row']
export type LoginActivity = Database['public']['Tables']['user_login_activity']['Row']
export type ActiveSession = Database['public']['Views']['active_sessions']['Row']
export type AthleteRun = Database['public']['Tables']['athlete_runs']['Row']
export type AthleteRunInsert = Database['public']['Tables']['athlete_runs']['Insert']
export type DbAthlete = Database['public']['Tables']['athletes']['Row']