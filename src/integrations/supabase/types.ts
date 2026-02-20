export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_access_log: {
        Row: {
          accessed_at: string
          blocked: boolean
          endpoint: string
          id: string
          ip_hash: string | null
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          blocked?: boolean
          endpoint: string
          id?: string
          ip_hash?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          blocked?: boolean
          endpoint?: string
          id?: string
          ip_hash?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      auth_audit_log: {
        Row: {
          created_at: string
          event: string
          id: string
          ip_hash: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      content: {
        Row: {
          audio_type: string[] | null
          backdrop_path: string | null
          category_id: string | null
          content_type: string
          created_at: string
          created_by: string | null
          featured: boolean | null
          id: string
          imdb_id: string | null
          number_of_episodes: number | null
          number_of_seasons: number | null
          original_title: string | null
          overview: string | null
          poster_path: string | null
          release_date: string | null
          runtime: number | null
          status: string | null
          title: string
          tmdb_id: number
          updated_at: string
          vote_average: number | null
        }
        Insert: {
          audio_type?: string[] | null
          backdrop_path?: string | null
          category_id?: string | null
          content_type: string
          created_at?: string
          created_by?: string | null
          featured?: boolean | null
          id?: string
          imdb_id?: string | null
          number_of_episodes?: number | null
          number_of_seasons?: number | null
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          runtime?: number | null
          status?: string | null
          title: string
          tmdb_id: number
          updated_at?: string
          vote_average?: number | null
        }
        Update: {
          audio_type?: string[] | null
          backdrop_path?: string | null
          category_id?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          featured?: boolean | null
          id?: string
          imdb_id?: string | null
          number_of_episodes?: number | null
          number_of_seasons?: number | null
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          runtime?: number | null
          status?: string | null
          title?: string
          tmdb_id?: number
          updated_at?: string
          vote_average?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          admin_notes: string | null
          content_type: string
          created_at: string
          id: string
          message: string
          page_url: string | null
          resolved_at: string | null
          status: string
          title: string
          tmdb_id: number
          updated_at: string
          visitor_id: string
        }
        Insert: {
          admin_notes?: string | null
          content_type: string
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          resolved_at?: string | null
          status?: string
          title: string
          tmdb_id: number
          updated_at?: string
          visitor_id: string
        }
        Update: {
          admin_notes?: string | null
          content_type?: string
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
          tmdb_id?: number
          updated_at?: string
          visitor_id?: string
        }
        Relationships: []
      }
      content_requests: {
        Row: {
          admin_notes: string | null
          backdrop_path: string | null
          content_type: string
          created_at: string
          id: string
          original_title: string | null
          overview: string | null
          poster_path: string | null
          release_date: string | null
          requester_email: string | null
          requester_name: string
          status: string
          title: string
          tmdb_id: number
          updated_at: string
          vote_average: number | null
        }
        Insert: {
          admin_notes?: string | null
          backdrop_path?: string | null
          content_type: string
          created_at?: string
          id?: string
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          requester_email?: string | null
          requester_name: string
          status?: string
          title: string
          tmdb_id: number
          updated_at?: string
          vote_average?: number | null
        }
        Update: {
          admin_notes?: string | null
          backdrop_path?: string | null
          content_type?: string
          created_at?: string
          id?: string
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          requester_email?: string | null
          requester_name?: string
          status?: string
          title?: string
          tmdb_id?: number
          updated_at?: string
          vote_average?: number | null
        }
        Relationships: []
      }
      content_views: {
        Row: {
          content_id: string | null
          content_type: string | null
          id: string
          tmdb_id: number | null
          viewed_at: string
        }
        Insert: {
          content_id?: string | null
          content_type?: string | null
          id?: string
          tmdb_id?: number | null
          viewed_at?: string
        }
        Update: {
          content_id?: string | null
          content_type?: string | null
          id?: string
          tmdb_id?: number | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_views_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      my_list: {
        Row: {
          added_at: string
          content_type: string
          id: string
          poster_path: string | null
          profile_id: string
          title: string
          tmdb_id: number
        }
        Insert: {
          added_at?: string
          content_type: string
          id?: string
          poster_path?: string | null
          profile_id: string
          title: string
          tmdb_id: number
        }
        Update: {
          added_at?: string
          content_type?: string
          id?: string
          poster_path?: string | null
          profile_id?: string
          title?: string
          tmdb_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "my_list_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
          banned: boolean | null
          banned_at: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          ip_hash: string | null
          last_login_at: string | null
          login_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned?: boolean | null
          banned_at?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          ip_hash?: string | null
          last_login_at?: string | null
          login_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned?: boolean | null
          banned_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          ip_hash?: string | null
          last_login_at?: string | null
          login_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resolve_failures: {
        Row: {
          attempted_at: string
          content_type: string
          tmdb_id: number
        }
        Insert: {
          attempted_at?: string
          content_type: string
          tmdb_id: number
        }
        Update: {
          attempted_at?: string
          content_type?: string
          tmdb_id?: number
        }
        Relationships: []
      }
      resolve_logs: {
        Row: {
          content_type: string
          created_at: string
          episode: number | null
          error_message: string | null
          id: string
          provider: string | null
          season: number | null
          success: boolean
          title: string
          tmdb_id: number
          video_type: string | null
          video_url: string | null
        }
        Insert: {
          content_type: string
          created_at?: string
          episode?: number | null
          error_message?: string | null
          id?: string
          provider?: string | null
          season?: number | null
          success?: boolean
          title: string
          tmdb_id: number
          video_type?: string | null
          video_url?: string | null
        }
        Update: {
          content_type?: string
          created_at?: string
          episode?: number | null
          error_message?: string | null
          id?: string
          provider?: string | null
          season?: number | null
          success?: boolean
          title?: string
          tmdb_id?: number
          video_type?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      scraping_providers: {
        Row: {
          active: boolean
          base_url: string
          created_at: string
          fail_count: number
          health_status: string
          id: string
          last_checked_at: string | null
          movie_url_template: string
          name: string
          priority: number
          success_count: number
          tv_url_template: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_url: string
          created_at?: string
          fail_count?: number
          health_status?: string
          id?: string
          last_checked_at?: string | null
          movie_url_template?: string
          name: string
          priority?: number
          success_count?: number
          tv_url_template?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_url?: string
          created_at?: string
          fail_count?: number
          health_status?: string
          id?: string
          last_checked_at?: string | null
          movie_url_template?: string
          name?: string
          priority?: number
          success_count?: number
          tv_url_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_alerts: {
        Row: {
          active: boolean
          button_link: string | null
          button_style: string
          button_text: string
          created_at: string
          id: string
          interval_minutes: number
          message: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          button_link?: string | null
          button_style?: string
          button_text?: string
          created_at?: string
          id?: string
          interval_minutes?: number
          message: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          button_link?: string | null
          button_style?: string
          button_text?: string
          created_at?: string
          id?: string
          interval_minutes?: number
          message?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      site_visitors: {
        Row: {
          hostname: string | null
          id: string
          ip_hash: string | null
          pathname: string | null
          referrer: string | null
          user_agent: string | null
          visited_at: string
          visitor_id: string
        }
        Insert: {
          hostname?: string | null
          id?: string
          ip_hash?: string | null
          pathname?: string | null
          referrer?: string | null
          user_agent?: string | null
          visited_at?: string
          visitor_id: string
        }
        Update: {
          hostname?: string | null
          id?: string
          ip_hash?: string | null
          pathname?: string | null
          referrer?: string | null
          user_agent?: string | null
          visited_at?: string
          visitor_id?: string
        }
        Relationships: []
      }
      telegram_ingestions: {
        Row: {
          content_type: string
          created_at: string
          duration: number | null
          episode: number | null
          episode_title: string | null
          file_name: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          resolution: string | null
          season: number | null
          status: string
          synopsis: string | null
          telegram_file_id: string
          telegram_unique_id: string
          telegram_user_id: number
          title: string
          tmdb_backdrop: string | null
          tmdb_id: number | null
          tmdb_poster: string | null
          tmdb_rating: number | null
          tmdb_year: string | null
          updated_at: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          duration?: number | null
          episode?: number | null
          episode_title?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          resolution?: string | null
          season?: number | null
          status?: string
          synopsis?: string | null
          telegram_file_id: string
          telegram_unique_id: string
          telegram_user_id: number
          title: string
          tmdb_backdrop?: string | null
          tmdb_id?: number | null
          tmdb_poster?: string | null
          tmdb_rating?: number | null
          tmdb_year?: string | null
          updated_at?: string
        }
        Update: {
          content_type?: string
          created_at?: string
          duration?: number | null
          episode?: number | null
          episode_title?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          resolution?: string | null
          season?: number | null
          status?: string
          synopsis?: string | null
          telegram_file_id?: string
          telegram_unique_id?: string
          telegram_user_id?: number
          title?: string
          tmdb_backdrop?: string | null
          tmdb_id?: number | null
          tmdb_poster?: string | null
          tmdb_rating?: number | null
          tmdb_year?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tv_categories: {
        Row: {
          id: number
          name: string
          sort_order: number
        }
        Insert: {
          id: number
          name: string
          sort_order?: number
        }
        Update: {
          id?: number
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      tv_channels: {
        Row: {
          active: boolean
          categories: number[] | null
          category: string
          created_at: string
          id: string
          image_url: string | null
          name: string
          sort_order: number
          stream_url: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          categories?: number[] | null
          category?: string
          created_at?: string
          id: string
          image_url?: string | null
          name: string
          sort_order?: number
          stream_url: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          categories?: number[] | null
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          sort_order?: number
          stream_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_index: number | null
          created_at: string
          id: string
          is_default: boolean | null
          name: string
          share_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_index?: number | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          name: string
          share_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_index?: number | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          name?: string
          share_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_cache: {
        Row: {
          audio_type: string
          content_type: string
          created_at: string
          episode: number | null
          expires_at: string
          id: string
          provider: string
          season: number | null
          tmdb_id: number
          video_type: string
          video_url: string
        }
        Insert: {
          audio_type?: string
          content_type: string
          created_at?: string
          episode?: number | null
          expires_at?: string
          id?: string
          provider?: string
          season?: number | null
          tmdb_id: number
          video_type?: string
          video_url: string
        }
        Update: {
          audio_type?: string
          content_type?: string
          created_at?: string
          episode?: number | null
          expires_at?: string
          id?: string
          provider?: string
          season?: number | null
          tmdb_id?: number
          video_type?: string
          video_url?: string
        }
        Relationships: []
      }
      video_cache_backup: {
        Row: {
          audio_type: string
          backed_up_at: string
          content_type: string
          episode: number | null
          id: string
          provider: string
          season: number | null
          tmdb_id: number
          video_type: string
          video_url: string
        }
        Insert: {
          audio_type?: string
          backed_up_at?: string
          content_type: string
          episode?: number | null
          id?: string
          provider?: string
          season?: number | null
          tmdb_id: number
          video_type?: string
          video_url: string
        }
        Update: {
          audio_type?: string
          backed_up_at?: string
          content_type?: string
          episode?: number | null
          id?: string
          provider?: string
          season?: number | null
          tmdb_id?: number
          video_type?: string
          video_url?: string
        }
        Relationships: []
      }
      watch_progress: {
        Row: {
          completed: boolean
          content_type: string
          device_id: string
          duration_seconds: number
          episode: number | null
          id: string
          progress_seconds: number
          season: number | null
          tmdb_id: number
          updated_at: string
        }
        Insert: {
          completed?: boolean
          content_type: string
          device_id: string
          duration_seconds?: number
          episode?: number | null
          id?: string
          progress_seconds?: number
          season?: number | null
          tmdb_id: number
          updated_at?: string
        }
        Update: {
          completed?: boolean
          content_type?: string
          device_id?: string
          duration_seconds?: number
          episode?: number | null
          id?: string
          progress_seconds?: number
          season?: number | null
          tmdb_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      watch_room_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          profile_id: string
          room_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          profile_id: string
          room_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          profile_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_room_messages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "watch_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_room_participants: {
        Row: {
          id: string
          joined_at: string
          last_heartbeat: string
          muted_by_host: boolean
          profile_id: string
          role: string
          room_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          last_heartbeat?: string
          muted_by_host?: boolean
          profile_id: string
          role?: string
          room_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          last_heartbeat?: string
          muted_by_host?: boolean
          profile_id?: string
          role?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_room_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "watch_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_rooms: {
        Row: {
          content_type: string
          created_at: string
          episode: number | null
          expires_at: string
          host_profile_id: string
          id: string
          max_participants: number
          poster_path: string | null
          room_code: string
          room_mode: string
          season: number | null
          status: string
          title: string
          tmdb_id: number
          updated_at: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          episode?: number | null
          expires_at?: string
          host_profile_id: string
          id?: string
          max_participants?: number
          poster_path?: string | null
          room_code: string
          room_mode?: string
          season?: number | null
          status?: string
          title?: string
          tmdb_id: number
          updated_at?: string
        }
        Update: {
          content_type?: string
          created_at?: string
          episode?: number | null
          expires_at?: string
          host_profile_id?: string
          id?: string
          max_participants?: number
          poster_path?: string | null
          room_code?: string
          room_mode?: string
          season?: number | null
          status?: string
          title?: string
          tmdb_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_rooms_host_profile_id_fkey"
            columns: ["host_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      video_cache_safe: {
        Row: {
          audio_type: string | null
          content_type: string | null
          created_at: string | null
          episode: number | null
          expires_at: string | null
          id: string | null
          provider: string | null
          season: number | null
          tmdb_id: number | null
          video_type: string | null
        }
        Insert: {
          audio_type?: string | null
          content_type?: string | null
          created_at?: string | null
          episode?: number | null
          expires_at?: string | null
          id?: string | null
          provider?: string | null
          season?: number | null
          tmdb_id?: number | null
          video_type?: string | null
        }
        Update: {
          audio_type?: string | null
          content_type?: string | null
          created_at?: string | null
          episode?: number | null
          expires_at?: string | null
          id?: string | null
          provider?: string | null
          season?: number | null
          tmdb_id?: number | null
          video_type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_unresolved_content: {
        Args: { batch_limit?: number }
        Returns: {
          content_type: string
          imdb_id: string
          title: string
          tmdb_id: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_room_participant: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator"],
    },
  },
} as const
