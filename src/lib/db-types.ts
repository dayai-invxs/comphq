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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      Athlete: {
        Row: {
          bibNumber: string | null
          competitionId: number
          divisionId: number | null
          id: number
          name: string
        }
        Insert: {
          bibNumber?: string | null
          competitionId: number
          divisionId?: number | null
          id?: number
          name: string
        }
        Update: {
          bibNumber?: string | null
          competitionId?: number
          divisionId?: number | null
          id?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "Athlete_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "Competition"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Athlete_divisionId_fkey"
            columns: ["divisionId"]
            isOneToOne: false
            referencedRelation: "Division"
            referencedColumns: ["id"]
          },
        ]
      }
      AuditLog: {
        Row: {
          action: string
          competitionId: number | null
          createdAt: string
          diff: Json | null
          id: number
          resourceId: string | null
          resourceType: string
          userId: string | null
          userName: string | null
        }
        Insert: {
          action: string
          competitionId?: number | null
          createdAt?: string
          diff?: Json | null
          id?: number
          resourceId?: string | null
          resourceType: string
          userId?: string | null
          userName?: string | null
        }
        Update: {
          action?: string
          competitionId?: number | null
          createdAt?: string
          diff?: Json | null
          id?: number
          resourceId?: string | null
          resourceType?: string
          userId?: string | null
          userName?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "AuditLog_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "Competition"
            referencedColumns: ["id"]
          },
        ]
      }
      Competition: {
        Row: {
          id: number
          name: string
          slug: string
        }
        Insert: {
          id?: number
          name: string
          slug: string
        }
        Update: {
          id?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
      CompetitionMember: {
        Row: {
          competitionId: number
          createdAt: string
          role: string
          userId: string
        }
        Insert: {
          competitionId: number
          createdAt?: string
          role?: string
          userId: string
        }
        Update: {
          competitionId?: number
          createdAt?: string
          role?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "CompetitionMember_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "Competition"
            referencedColumns: ["id"]
          },
        ]
      }
      Division: {
        Row: {
          competitionId: number
          id: number
          name: string
          order: number
        }
        Insert: {
          competitionId: number
          id?: number
          name: string
          order: number
        }
        Update: {
          competitionId?: number
          id?: number
          name?: string
          order?: number
        }
        Relationships: [
          {
            foreignKeyName: "Division_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "Competition"
            referencedColumns: ["id"]
          },
        ]
      }
      HeatAssignment: {
        Row: {
          athleteId: number
          heatNumber: number
          id: number
          lane: number
          workoutId: number
        }
        Insert: {
          athleteId: number
          heatNumber: number
          id?: number
          lane: number
          workoutId: number
        }
        Update: {
          athleteId?: number
          heatNumber?: number
          id?: number
          lane?: number
          workoutId?: number
        }
        Relationships: [
          {
            foreignKeyName: "HeatAssignment_athleteId_fkey"
            columns: ["athleteId"]
            isOneToOne: false
            referencedRelation: "Athlete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "HeatAssignment_workoutId_fkey"
            columns: ["workoutId"]
            isOneToOne: false
            referencedRelation: "Workout"
            referencedColumns: ["id"]
          },
        ]
      }
      HeatCompletion: {
        Row: {
          completedAt: string
          heatNumber: number
          id: number
          workoutId: number
        }
        Insert: {
          completedAt?: string
          heatNumber: number
          id?: number
          workoutId: number
        }
        Update: {
          completedAt?: string
          heatNumber?: number
          id?: number
          workoutId?: number
        }
        Relationships: [
          {
            foreignKeyName: "HeatCompletion_workoutId_fkey"
            columns: ["workoutId"]
            isOneToOne: false
            referencedRelation: "Workout"
            referencedColumns: ["id"]
          },
        ]
      }
      Score: {
        Row: {
          athleteId: number
          id: number
          partBPoints: number | null
          partBRawScore: number | null
          points: number | null
          rawScore: number
          tiebreakRawScore: number | null
          workoutId: number
        }
        Insert: {
          athleteId: number
          id?: number
          partBPoints?: number | null
          partBRawScore?: number | null
          points?: number | null
          rawScore: number
          tiebreakRawScore?: number | null
          workoutId: number
        }
        Update: {
          athleteId?: number
          id?: number
          partBPoints?: number | null
          partBRawScore?: number | null
          points?: number | null
          rawScore?: number
          tiebreakRawScore?: number | null
          workoutId?: number
        }
        Relationships: [
          {
            foreignKeyName: "Score_athleteId_fkey"
            columns: ["athleteId"]
            isOneToOne: false
            referencedRelation: "Athlete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Score_workoutId_fkey"
            columns: ["workoutId"]
            isOneToOne: false
            referencedRelation: "Workout"
            referencedColumns: ["id"]
          },
        ]
      }
      Setting: {
        Row: {
          competitionId: number
          key: string
          value: string
        }
        Insert: {
          competitionId: number
          key: string
          value: string
        }
        Update: {
          competitionId?: number
          key?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "Setting_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "Competition"
            referencedColumns: ["id"]
          },
        ]
      }
      UserProfile: {
        Row: {
          createdAt: string
          id: string
          role: string
        }
        Insert: {
          createdAt?: string
          id: string
          role?: string
        }
        Update: {
          createdAt?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      Workout: {
        Row: {
          callTimeSecs: number
          competitionId: number
          halfWeight: boolean
          heatIntervalSecs: number
          heatStartOverrides: Json
          id: number
          lanes: number
          mixedHeats: boolean
          name: string
          number: number
          partBEnabled: boolean
          partBScoreType: string
          scoreType: string
          startTime: string | null
          status: string
          tiebreakEnabled: boolean
          timeBetweenHeatsSecs: number
          walkoutTimeSecs: number
        }
        Insert: {
          callTimeSecs: number
          competitionId: number
          halfWeight?: boolean
          heatIntervalSecs: number
          heatStartOverrides?: Json
          id?: number
          lanes: number
          mixedHeats?: boolean
          name: string
          number: number
          partBEnabled?: boolean
          partBScoreType?: string
          scoreType: string
          startTime?: string | null
          status?: string
          tiebreakEnabled?: boolean
          timeBetweenHeatsSecs?: number
          walkoutTimeSecs: number
        }
        Update: {
          callTimeSecs?: number
          competitionId?: number
          halfWeight?: boolean
          heatIntervalSecs?: number
          heatStartOverrides?: Json
          id?: number
          lanes?: number
          mixedHeats?: boolean
          name?: string
          number?: number
          partBEnabled?: boolean
          partBScoreType?: string
          scoreType?: string
          startTime?: string | null
          status?: string
          tiebreakEnabled?: boolean
          timeBetweenHeatsSecs?: number
          walkoutTimeSecs?: number
        }
        Relationships: [
          {
            foreignKeyName: "Workout_competitionId_fkey"
            columns: ["competitionId"]
            isOneToOne: false
            referencedRelation: "Competition"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      replace_workout_heat_assignments: {
        Args: { p_assignments: Json; p_workout_id: number }
        Returns: undefined
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
