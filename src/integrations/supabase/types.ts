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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
