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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_history: {
        Row: {
          alert_setting_id: string | null
          alert_type: string
          body: string | null
          channels: string[]
          created_at: string
          id: string
          is_read: boolean
          metadata: Json | null
          profile_id: string
          property_id: string | null
          read_at: string | null
          title: string
        }
        Insert: {
          alert_setting_id?: string | null
          alert_type: string
          body?: string | null
          channels?: string[]
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          profile_id: string
          property_id?: string | null
          read_at?: string | null
          title: string
        }
        Update: {
          alert_setting_id?: string | null
          alert_type?: string
          body?: string | null
          channels?: string[]
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          profile_id?: string
          property_id?: string | null
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_history_alert_setting_id_fkey"
            columns: ["alert_setting_id"]
            isOneToOne: false
            referencedRelation: "alert_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_history_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_settings: {
        Row: {
          alert_type: string
          channels: Json
          created_at: string
          id: string
          is_enabled: boolean
          profile_id: string
          property_id: string | null
          threshold: number | null
          updated_at: string
        }
        Insert: {
          alert_type: string
          channels?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          profile_id: string
          property_id?: string | null
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          alert_type?: string
          channels?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          profile_id?: string
          property_id?: string | null
          threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_settings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          arrival: string
          base_amount: number | null
          booked_at: string | null
          cleaning_fee: number | null
          created_at: string
          departure: string
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          is_block: boolean
          listing_site: string | null
          net_revenue: number | null
          num_guests: number | null
          ownerrez_id: string | null
          platform_fee: number | null
          property_id: string
          status: string
          taxes: number | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          arrival: string
          base_amount?: number | null
          booked_at?: string | null
          cleaning_fee?: number | null
          created_at?: string
          departure: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          is_block?: boolean
          listing_site?: string | null
          net_revenue?: number | null
          num_guests?: number | null
          ownerrez_id?: string | null
          platform_fee?: number | null
          property_id: string
          status?: string
          taxes?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          arrival?: string
          base_amount?: number | null
          booked_at?: string | null
          cleaning_fee?: number | null
          created_at?: string
          departure?: string
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          is_block?: boolean
          listing_site?: string | null
          net_revenue?: number | null
          num_guests?: number | null
          ownerrez_id?: string | null
          platform_fee?: number | null
          property_id?: string
          status?: string
          taxes?: number | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_records: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
          checklist: Json | null
          completed_at: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          notes: string | null
          property_id: string
          scheduled_date: string
          scheduled_start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id?: string | null
          checklist?: Json | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          property_id: string
          scheduled_date: string
          scheduled_start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string | null
          checklist?: Json | null
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          property_id?: string
          scheduled_date?: string
          scheduled_start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_records_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_records_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      community_insights: {
        Row: {
          body: string | null
          created_at: string
          effective_date: string | null
          expires_at: string | null
          id: string
          impact: string | null
          insight_type: string
          property_id: string | null
          source: string | null
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          effective_date?: string | null
          expires_at?: string | null
          id?: string
          impact?: string | null
          insight_type: string
          property_id?: string | null
          source?: string | null
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          effective_date?: string | null
          expires_at?: string | null
          id?: string
          impact?: string | null
          insight_type?: string
          property_id?: string | null
          source?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_insights_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_issues: {
        Row: {
          actual_cost: number | null
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string | null
          estimated_cost: number | null
          id: string
          images: string[] | null
          priority: string
          property_id: string
          reported_by: string | null
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
          vendor_contact: string | null
          vendor_name: string | null
        }
        Insert: {
          actual_cost?: number | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          images?: string[] | null
          priority?: string
          property_id: string
          reported_by?: string | null
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Update: {
          actual_cost?: number | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          images?: string[] | null
          priority?: string
          property_id?: string
          reported_by?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_issues_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_issues_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_issues_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_data: {
        Row: {
          avg_daily_rate: number | null
          avg_occupancy_rate: number | null
          avg_revpar: number | null
          created_at: string
          data_date: string
          demand_score: number | null
          id: string
          market: string
          property_id: string | null
          raw_data: Json | null
          source: string | null
          supply_count: number | null
        }
        Insert: {
          avg_daily_rate?: number | null
          avg_occupancy_rate?: number | null
          avg_revpar?: number | null
          created_at?: string
          data_date: string
          demand_score?: number | null
          id?: string
          market: string
          property_id?: string | null
          raw_data?: Json | null
          source?: string | null
          supply_count?: number | null
        }
        Update: {
          avg_daily_rate?: number | null
          avg_occupancy_rate?: number | null
          avg_revpar?: number | null
          created_at?: string
          data_date?: string
          demand_score?: number | null
          id?: string
          market?: string
          property_id?: string | null
          raw_data?: Json | null
          source?: string | null
          supply_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "market_data_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      occupancy_snapshots: {
        Row: {
          adr: number | null
          created_at: string
          id: string
          nights_available: number | null
          nights_blocked: number | null
          nights_booked: number | null
          occupancy_rate: number | null
          property_id: string
          revenue: number | null
          revpar: number | null
          snapshot_date: string
        }
        Insert: {
          adr?: number | null
          created_at?: string
          id?: string
          nights_available?: number | null
          nights_blocked?: number | null
          nights_booked?: number | null
          occupancy_rate?: number | null
          property_id: string
          revenue?: number | null
          revpar?: number | null
          snapshot_date: string
        }
        Update: {
          adr?: number | null
          created_at?: string
          id?: string
          nights_available?: number | null
          nights_blocked?: number | null
          nights_booked?: number | null
          occupancy_rate?: number | null
          property_id?: string
          revenue?: number | null
          revpar?: number | null
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "occupancy_snapshots_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing: {
        Row: {
          base_price: number
          created_at: string
          date: string
          id: string
          is_available: boolean
          min_stay: number | null
          property_id: string
          source: string
          updated_at: string
        }
        Insert: {
          base_price: number
          created_at?: string
          date: string
          id?: string
          is_available?: boolean
          min_stay?: number | null
          property_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          created_at?: string
          date?: string
          id?: string
          is_available?: boolean
          min_stay?: number | null
          property_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          country: string
          created_at: string
          description: string | null
          external_name: string
          id: string
          internal_name: string | null
          is_active: boolean
          max_guests: number | null
          owner_id: string
          ownerrez_id: string | null
          public_url: string | null
          square_feet: number | null
          state: string | null
          thumbnail_url: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          country?: string
          created_at?: string
          description?: string | null
          external_name: string
          id?: string
          internal_name?: string | null
          is_active?: boolean
          max_guests?: number | null
          owner_id: string
          ownerrez_id?: string | null
          public_url?: string | null
          square_feet?: number | null
          state?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          country?: string
          created_at?: string
          description?: string | null
          external_name?: string
          id?: string
          internal_name?: string | null
          is_active?: boolean
          max_guests?: number | null
          owner_id?: string
          ownerrez_id?: string | null
          public_url?: string | null
          square_feet?: number | null
          state?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      property_operational_info: {
        Row: {
          check_in_instructions: string | null
          check_in_time: string
          check_out_instructions: string | null
          check_out_time: string
          created_at: string
          door_code: string | null
          emergency_contact: string | null
          extra: Json | null
          house_manual_url: string | null
          id: string
          notes: string | null
          parking_instructions: string | null
          property_id: string
          property_manager: string | null
          recycle_day: string | null
          trash_day: string | null
          updated_at: string
          wifi_name: string | null
          wifi_password: string | null
        }
        Insert: {
          check_in_instructions?: string | null
          check_in_time?: string
          check_out_instructions?: string | null
          check_out_time?: string
          created_at?: string
          door_code?: string | null
          emergency_contact?: string | null
          extra?: Json | null
          house_manual_url?: string | null
          id?: string
          notes?: string | null
          parking_instructions?: string | null
          property_id: string
          property_manager?: string | null
          recycle_day?: string | null
          trash_day?: string | null
          updated_at?: string
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Update: {
          check_in_instructions?: string | null
          check_in_time?: string
          check_out_instructions?: string | null
          check_out_time?: string
          created_at?: string
          door_code?: string | null
          emergency_contact?: string | null
          extra?: Json | null
          house_manual_url?: string | null
          id?: string
          notes?: string | null
          parking_instructions?: string | null
          property_id?: string
          property_manager?: string | null
          recycle_day?: string | null
          trash_day?: string | null
          updated_at?: string
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_operational_info_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          action_url: string | null
          body: string | null
          category: string
          created_at: string
          dismissed_at: string | null
          expires_at: string | null
          id: string
          is_dismissed: boolean
          metadata: Json | null
          priority: string
          property_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          category: string
          created_at?: string
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          is_dismissed?: boolean
          metadata?: Json | null
          priority?: string
          property_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          category?: string
          created_at?: string
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          is_dismissed?: boolean
          metadata?: Json | null
          priority?: string
          property_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          accuracy_rating: number | null
          booking_id: string | null
          cleanliness_rating: number | null
          communication_rating: number | null
          created_at: string
          id: string
          listing_site: string | null
          location_rating: number | null
          overall_rating: number | null
          ownerrez_id: string | null
          property_id: string
          response_at: string | null
          response_text: string | null
          review_text: string | null
          reviewed_at: string | null
          reviewer_name: string | null
          updated_at: string
          value_rating: number | null
        }
        Insert: {
          accuracy_rating?: number | null
          booking_id?: string | null
          cleanliness_rating?: number | null
          communication_rating?: number | null
          created_at?: string
          id?: string
          listing_site?: string | null
          location_rating?: number | null
          overall_rating?: number | null
          ownerrez_id?: string | null
          property_id: string
          response_at?: string | null
          response_text?: string | null
          review_text?: string | null
          reviewed_at?: string | null
          reviewer_name?: string | null
          updated_at?: string
          value_rating?: number | null
        }
        Update: {
          accuracy_rating?: number | null
          booking_id?: string | null
          cleanliness_rating?: number | null
          communication_rating?: number | null
          created_at?: string
          id?: string
          listing_site?: string | null
          location_rating?: number | null
          overall_rating?: number | null
          ownerrez_id?: string | null
          property_id?: string
          response_at?: string | null
          response_text?: string | null
          review_text?: string | null
          reviewed_at?: string | null
          reviewer_name?: string | null
          updated_at?: string
          value_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          property_id: string | null
          records_failed: number | null
          records_synced: number | null
          started_at: string | null
          status: string
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          property_id?: string | null
          records_failed?: number | null
          records_synced?: number | null
          started_at?: string | null
          status?: string
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          property_id?: string | null
          records_failed?: number | null
          records_synced?: number | null
          started_at?: string | null
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
