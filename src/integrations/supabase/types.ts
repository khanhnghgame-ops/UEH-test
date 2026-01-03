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
      activity_logs: {
        Row: {
          action: string
          action_type: string
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          metadata: Json | null
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          action_type: string
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
          user_name: string
        }
        Update: {
          action?: string
          action_type?: string
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_comments: {
        Row: {
          content: string
          created_at: string
          feedback_id: string
          id: string
          is_hidden: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          feedback_id: string
          id?: string
          is_hidden?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          feedback_id?: string
          id?: string
          is_hidden?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_comments_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedbacks"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks: {
        Row: {
          content: string
          created_at: string
          id: string
          is_hidden: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          additional_info: string | null
          class_code: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          instructor_email: string | null
          instructor_name: string | null
          is_public: boolean
          leader_id: string | null
          name: string
          share_token: string | null
          show_activity_public: boolean
          show_members_public: boolean
          updated_at: string
          zalo_link: string | null
        }
        Insert: {
          additional_info?: string | null
          class_code?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          instructor_email?: string | null
          instructor_name?: string | null
          is_public?: boolean
          leader_id?: string | null
          name: string
          share_token?: string | null
          show_activity_public?: boolean
          show_members_public?: boolean
          updated_at?: string
          zalo_link?: string | null
        }
        Update: {
          additional_info?: string | null
          class_code?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          instructor_email?: string | null
          instructor_name?: string | null
          is_public?: boolean
          leader_id?: string | null
          name?: string
          share_token?: string | null
          show_activity_public?: boolean
          show_members_public?: boolean
          updated_at?: string
          zalo_link?: string | null
        }
        Relationships: []
      }
      member_stage_scores: {
        Row: {
          adjusted_score: number | null
          average_score: number | null
          bug_hunter_bonus: boolean
          created_at: string
          early_submission_bonus: boolean
          final_stage_score: number | null
          id: string
          k_coefficient: number | null
          late_task_count: number
          stage_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          adjusted_score?: number | null
          average_score?: number | null
          bug_hunter_bonus?: boolean
          created_at?: string
          early_submission_bonus?: boolean
          final_stage_score?: number | null
          id?: string
          k_coefficient?: number | null
          late_task_count?: number
          stage_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          adjusted_score?: number | null
          average_score?: number | null
          bug_hunter_bonus?: boolean
          created_at?: string
          early_submission_bonus?: boolean
          final_stage_score?: number | null
          id?: string
          k_coefficient?: number | null
          late_task_count?: number
          stage_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_stage_scores_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          is_read: boolean
          message: string | null
          task_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          task_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          task_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_approvals: {
        Row: {
          created_at: string
          group_id: string
          id: string
          processed_at: string | null
          processed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_approvals_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_approved: boolean
          must_change_password: boolean
          student_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_approved?: boolean
          must_change_password?: boolean
          student_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_approved?: boolean
          must_change_password?: boolean
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          group_id: string
          id: string
          name: string
          order_index: number
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          group_id: string
          id?: string
          name: string
          order_index?: number
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          group_id?: string
          id?: string
          name?: string
          order_index?: number
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_history: {
        Row: {
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          note: string | null
          submission_link: string
          submission_type: string | null
          submitted_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          note?: string | null
          submission_link: string
          submission_type?: string | null
          submitted_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          note?: string | null
          submission_link?: string
          submission_type?: string | null
          submitted_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignments: {
        Row: {
          assigned_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_scores: {
        Row: {
          base_score: number
          bug_hunter_bonus: boolean
          created_at: string
          early_bonus: boolean
          final_score: number | null
          id: string
          late_penalty: number
          review_count: number
          review_penalty: number
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_score?: number
          bug_hunter_bonus?: boolean
          created_at?: string
          early_bonus?: boolean
          final_score?: number | null
          id?: string
          late_penalty?: number
          review_count?: number
          review_penalty?: number
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_score?: number
          bug_hunter_bonus?: boolean
          created_at?: string
          early_bonus?: boolean
          final_score?: number | null
          id?: string
          late_penalty?: number
          review_count?: number
          review_penalty?: number
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_scores_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          created_by: string
          deadline: string | null
          description: string | null
          group_id: string
          id: string
          stage_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          submission_link: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deadline?: string | null
          description?: string | null
          group_id: string
          id?: string
          stage_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          submission_link?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deadline?: string | null
          description?: string | null
          group_id?: string
          id?: string
          stage_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          submission_link?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_notifications: { Args: never; Returns: undefined }
      ensure_admin_exists: { Args: never; Returns: undefined }
      generate_share_token: { Args: never; Returns: string }
      get_email_by_student_id: {
        Args: { _student_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_group_leader: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_leader: { Args: { _user_id: string }; Returns: boolean }
      is_task_assignee: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "leader" | "member"
      approval_status: "pending" | "approved" | "rejected"
      task_status: "TODO" | "IN_PROGRESS" | "DONE" | "VERIFIED"
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
      app_role: ["admin", "leader", "member"],
      approval_status: ["pending", "approved", "rejected"],
      task_status: ["TODO", "IN_PROGRESS", "DONE", "VERIFIED"],
    },
  },
} as const
