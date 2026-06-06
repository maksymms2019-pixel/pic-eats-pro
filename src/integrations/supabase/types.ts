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
      custom_foods: {
        Row: {
          barcode: string | null
          brand: string | null
          calories_per_100g: number
          carbs_per_100g: number
          created_at: string
          fat_per_100g: number
          id: string
          name: string
          protein_per_100g: number
          updated_at: string
          user_id: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          calories_per_100g: number
          carbs_per_100g?: number
          created_at?: string
          fat_per_100g?: number
          id?: string
          name: string
          protein_per_100g?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          calories_per_100g?: number
          carbs_per_100g?: number
          created_at?: string
          fat_per_100g?: number
          id?: string
          name?: string
          protein_per_100g?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          calories: number
          carbs_g: number
          created_at: string
          fat_g: number
          grams: number
          id: string
          last_used_at: string | null
          name: string
          photo_url: string | null
          protein_g: number
          use_count: number
          user_id: string
        }
        Insert: {
          calories: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          grams: number
          id?: string
          last_used_at?: string | null
          name: string
          photo_url?: string | null
          protein_g?: number
          use_count?: number
          user_id: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          grams?: number
          id?: string
          last_used_at?: string | null
          name?: string
          photo_url?: string | null
          protein_g?: number
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      food_entries: {
        Row: {
          calories: number
          carbs_g: number
          consumed_at: string
          created_at: string
          entry_date: string
          fat_g: number
          grams: number
          id: string
          meal: Database["public"]["Enums"]["meal_enum"]
          name: string
          notes: string | null
          photo_url: string | null
          protein_g: number
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calories: number
          carbs_g?: number
          consumed_at?: string
          created_at?: string
          entry_date?: string
          fat_g?: number
          grams: number
          id?: string
          meal?: Database["public"]["Enums"]["meal_enum"]
          name: string
          notes?: string | null
          photo_url?: string | null
          protein_g?: number
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          consumed_at?: string
          created_at?: string
          entry_date?: string
          fat_g?: number
          grams?: number
          id?: string
          meal?: Database["public"]["Enums"]["meal_enum"]
          name?: string
          notes?: string | null
          photo_url?: string | null
          protein_g?: number
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity: Database["public"]["Enums"]["activity_enum"] | null
          age: number | null
          bmr_method: string
          body_fat_pct: number | null
          calorie_delta: number | null
          created_at: string
          display_name: string | null
          goal: Database["public"]["Enums"]["goal_enum"] | null
          height_cm: number | null
          id: string
          macro_preset: string
          onboarded: boolean
          protein_per_kg: number | null
          sex: Database["public"]["Enums"]["sex_enum"] | null
          target_calories: number | null
          target_carbs_g: number | null
          target_date: string | null
          target_fat_g: number | null
          target_protein_g: number | null
          target_weight_kg: number | null
          updated_at: string
          weight_kg: number | null
          workout_duration_min: number
          workout_frequency: number
          workout_type: string
        }
        Insert: {
          activity?: Database["public"]["Enums"]["activity_enum"] | null
          age?: number | null
          bmr_method?: string
          body_fat_pct?: number | null
          calorie_delta?: number | null
          created_at?: string
          display_name?: string | null
          goal?: Database["public"]["Enums"]["goal_enum"] | null
          height_cm?: number | null
          id: string
          macro_preset?: string
          onboarded?: boolean
          protein_per_kg?: number | null
          sex?: Database["public"]["Enums"]["sex_enum"] | null
          target_calories?: number | null
          target_carbs_g?: number | null
          target_date?: string | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          target_weight_kg?: number | null
          updated_at?: string
          weight_kg?: number | null
          workout_duration_min?: number
          workout_frequency?: number
          workout_type?: string
        }
        Update: {
          activity?: Database["public"]["Enums"]["activity_enum"] | null
          age?: number | null
          bmr_method?: string
          body_fat_pct?: number | null
          calorie_delta?: number | null
          created_at?: string
          display_name?: string | null
          goal?: Database["public"]["Enums"]["goal_enum"] | null
          height_cm?: number | null
          id?: string
          macro_preset?: string
          onboarded?: boolean
          protein_per_kg?: number | null
          sex?: Database["public"]["Enums"]["sex_enum"] | null
          target_calories?: number | null
          target_carbs_g?: number | null
          target_date?: string | null
          target_fat_g?: number | null
          target_protein_g?: number | null
          target_weight_kg?: number | null
          updated_at?: string
          weight_kg?: number | null
          workout_duration_min?: number
          workout_frequency?: number
          workout_type?: string
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          created_at: string
          id: string
          logged_at: string
          notes: string | null
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          logged_at?: string
          notes?: string | null
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          logged_at?: string
          notes?: string | null
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      activity_enum:
        | "sedentary"
        | "light"
        | "moderate"
        | "active"
        | "very_active"
      goal_enum: "lose" | "maintain" | "gain"
      meal_enum: "breakfast" | "lunch" | "dinner" | "snack"
      sex_enum: "male" | "female"
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
      activity_enum: [
        "sedentary",
        "light",
        "moderate",
        "active",
        "very_active",
      ],
      goal_enum: ["lose", "maintain", "gain"],
      meal_enum: ["breakfast", "lunch", "dinner", "snack"],
      sex_enum: ["male", "female"],
    },
  },
} as const
