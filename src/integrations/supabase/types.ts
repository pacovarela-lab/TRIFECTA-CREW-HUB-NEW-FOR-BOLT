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
      alerts: {
        Row: {
          acknowledged: boolean
          company_id: string
          created_at: string
          division_id: string | null
          id: string
          kind: string
          message: string
          project_id: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          task_id: string | null
        }
        Insert: {
          acknowledged?: boolean
          company_id: string
          created_at?: string
          division_id?: string | null
          id?: string
          kind: string
          message: string
          project_id?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          task_id?: string | null
        }
        Update: {
          acknowledged?: boolean
          company_id?: string
          created_at?: string
          division_id?: string | null
          id?: string
          kind?: string
          message?: string
          project_id?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          description: string
          direction: string
          external_ref: string | null
          id: string
          match_confidence: number | null
          matched_expense_id: string | null
          matched_payment_id: string | null
          notes: string | null
          posted_on: string
          raw: Json | null
          reconciled_at: string | null
          reconciled_by: string | null
          running_balance: number | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          description: string
          direction?: string
          external_ref?: string | null
          id?: string
          match_confidence?: number | null
          matched_expense_id?: string | null
          matched_payment_id?: string | null
          notes?: string | null
          posted_on: string
          raw?: Json | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          running_balance?: number | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          description?: string
          direction?: string
          external_ref?: string | null
          id?: string
          match_confidence?: number | null
          matched_expense_id?: string | null
          matched_payment_id?: string | null
          notes?: string | null
          posted_on?: string
          raw?: Json | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          running_balance?: number | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_expense_id_fkey"
            columns: ["matched_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      business_units: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kind: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          kind?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          google_calendar_enabled: boolean
          id: string
          logo_url: string | null
          mobile_offline_expenses_enabled: boolean
          name: string
          onboarding_status: string
          product_feedback_enabled: boolean
          require_verified_phone: boolean
          slug: string | null
          sms_enabled: boolean
          sms_provider_mode: string
          timezone: string
          trial_ends_at: string | null
          trial_exempt: boolean
          trial_limits: Json
          trial_mode_enabled: boolean
          trial_starts_at: string | null
          trial_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          google_calendar_enabled?: boolean
          id?: string
          logo_url?: string | null
          mobile_offline_expenses_enabled?: boolean
          name: string
          onboarding_status?: string
          product_feedback_enabled?: boolean
          require_verified_phone?: boolean
          slug?: string | null
          sms_enabled?: boolean
          sms_provider_mode?: string
          timezone?: string
          trial_ends_at?: string | null
          trial_exempt?: boolean
          trial_limits?: Json
          trial_mode_enabled?: boolean
          trial_starts_at?: string | null
          trial_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          google_calendar_enabled?: boolean
          id?: string
          logo_url?: string | null
          mobile_offline_expenses_enabled?: boolean
          name?: string
          onboarding_status?: string
          product_feedback_enabled?: boolean
          require_verified_phone?: boolean
          slug?: string | null
          sms_enabled?: boolean
          sms_provider_mode?: string
          timezone?: string
          trial_ends_at?: string | null
          trial_exempt?: boolean
          trial_limits?: Json
          trial_mode_enabled?: boolean
          trial_starts_at?: string | null
          trial_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Relationships: []
      }
      divisions: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_attempts: {
        Row: {
          attempts: number
          company_id: string | null
          created_at: string
          email_type: string
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          provider_message_id: string | null
          recipient: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          email_type: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          provider_message_id?: string | null
          recipient: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          email_type?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          provider_message_id?: string | null
          recipient?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_send_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_analysis_runs: {
        Row: {
          attempts: number
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          estimate_id: string
          id: string
          image_set_hash: string
          model: string | null
          request_key: string
          safe_error_code: string | null
          safe_error_message: string | null
          schema_version: string
          stage: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          estimate_id: string
          id?: string
          image_set_hash: string
          model?: string | null
          request_key: string
          safe_error_code?: string | null
          safe_error_message?: string | null
          schema_version: string
          stage: string
          started_at?: string | null
          status: string
        }
        Update: {
          attempts?: number
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          estimate_id?: string
          id?: string
          image_set_hash?: string
          model?: string | null
          request_key?: string
          safe_error_code?: string | null
          safe_error_message?: string | null
          schema_version?: string
          stage?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_analysis_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_analysis_runs_estimate_same_company_fk"
            columns: ["estimate_id", "company_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      estimate_images: {
        Row: {
          byte_size: number
          company_id: string
          created_at: string
          created_by: string
          estimate_id: string
          height: number | null
          id: string
          mime_type: string
          page_number: number
          sha256: string
          storage_path: string
          width: number | null
        }
        Insert: {
          byte_size: number
          company_id: string
          created_at?: string
          created_by: string
          estimate_id: string
          height?: number | null
          id?: string
          mime_type: string
          page_number: number
          sha256: string
          storage_path: string
          width?: number | null
        }
        Update: {
          byte_size?: number
          company_id?: string
          created_at?: string
          created_by?: string
          estimate_id?: string
          height?: number | null
          id?: string
          mime_type?: string
          page_number?: number
          sha256?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_images_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_images_estimate_same_company_fk"
            columns: ["estimate_id", "company_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      estimate_items: {
        Row: {
          category: string | null
          client_price: number | null
          company_id: string
          confidence: number | null
          corrected_at: string | null
          corrected_by: string | null
          created_at: string
          description: string
          description_client_en: string | null
          description_normalized: string | null
          description_original: string | null
          estimate_id: string
          extraction_status: string
          human_confirmed_fields: string[]
          human_corrected: boolean
          id: string
          item_type: string
          planned_cost: number | null
          position: number
          provenance: string
          quantity: number
          sort_order: number | null
          source_image_index: number | null
          source_text: string | null
          total: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          category?: string | null
          client_price?: number | null
          company_id: string
          confidence?: number | null
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          description: string
          description_client_en?: string | null
          description_normalized?: string | null
          description_original?: string | null
          estimate_id: string
          extraction_status?: string
          human_confirmed_fields?: string[]
          human_corrected?: boolean
          id?: string
          item_type?: string
          planned_cost?: number | null
          position?: number
          provenance?: string
          quantity?: number
          sort_order?: number | null
          source_image_index?: number | null
          source_text?: string | null
          total?: number
          unit?: string | null
          unit_price?: number
        }
        Update: {
          category?: string | null
          client_price?: number | null
          company_id?: string
          confidence?: number | null
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          description?: string
          description_client_en?: string | null
          description_normalized?: string | null
          description_original?: string | null
          estimate_id?: string
          extraction_status?: string
          human_confirmed_fields?: string[]
          human_corrected?: boolean
          id?: string
          item_type?: string
          planned_cost?: number | null
          position?: number
          provenance?: string
          quantity?: number
          sort_order?: number | null
          source_image_index?: number | null
          source_text?: string | null
          total?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_items_estimate_same_company_fk"
            columns: ["estimate_id", "company_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      estimate_learned_term_events: {
        Row: {
          company_id: string
          corrected_key: string
          created_at: string
          estimate_id: string
          field_key: string
          id: string
          is_active: boolean
          observed_key: string
          superseded_at: string | null
          target_key: string
          term_id: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          corrected_key: string
          created_at?: string
          estimate_id: string
          field_key: string
          id?: string
          is_active?: boolean
          observed_key: string
          superseded_at?: string | null
          target_key: string
          term_id?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          corrected_key?: string
          created_at?: string
          estimate_id?: string
          field_key?: string
          id?: string
          is_active?: boolean
          observed_key?: string
          superseded_at?: string | null
          target_key?: string
          term_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_learned_term_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_learned_term_events_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_learned_term_events_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "estimate_learned_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_learned_terms: {
        Row: {
          company_id: string
          confidence: number
          confirmations: number
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          normalized_term: string
          observed_term: string
          source_estimate_id: string | null
          term_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          confidence?: number
          confirmations?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          normalized_term: string
          observed_term: string
          source_estimate_id?: string | null
          term_type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          confidence?: number
          confirmations?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          normalized_term?: string
          observed_term?: string
          source_estimate_id?: string | null
          term_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_learned_terms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_learned_terms_source_estimate_id_fkey"
            columns: ["source_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          category: string
          company_id: string
          created_at: string
          estimate_id: string
          id: string
          ordinal: number
          question: string
          reason: string | null
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          category: string
          company_id: string
          created_at?: string
          estimate_id: string
          id?: string
          ordinal: number
          question: string
          reason?: string | null
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          category?: string
          company_id?: string
          created_at?: string
          estimate_id?: string
          id?: string
          ordinal?: number
          question?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_questions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_questions_estimate_same_company_fk"
            columns: ["estimate_id", "company_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      estimates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          business_unit_id: string | null
          charge_amount: number | null
          client_description_en: string | null
          client_id: string | null
          company_id: string
          corrected_at: string | null
          corrected_by: string | null
          created_at: string
          created_by: string | null
          currency_code: string | null
          division_id: string | null
          human_confirmed_fields: string[]
          human_corrected: boolean
          id: string
          imported_by: string | null
          internal_notes: string | null
          parent_estimate_id: string | null
          project_creation_key: string | null
          project_id: string | null
          raw_filename: string | null
          risk_level: string | null
          risk_summary: string | null
          schema_version: string
          source: string
          source_format: string | null
          source_type: string
          status: string
          target_type: string | null
          target_value: number | null
          title: string
          total: number
          updated_at: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_unit_id?: string | null
          charge_amount?: number | null
          client_description_en?: string | null
          client_id?: string | null
          company_id: string
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          division_id?: string | null
          human_confirmed_fields?: string[]
          human_corrected?: boolean
          id?: string
          imported_by?: string | null
          internal_notes?: string | null
          parent_estimate_id?: string | null
          project_creation_key?: string | null
          project_id?: string | null
          raw_filename?: string | null
          risk_level?: string | null
          risk_summary?: string | null
          schema_version?: string
          source?: string
          source_format?: string | null
          source_type?: string
          status?: string
          target_type?: string | null
          target_value?: number | null
          title?: string
          total?: number
          updated_at?: string
          version_number?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_unit_id?: string | null
          charge_amount?: number | null
          client_description_en?: string | null
          client_id?: string | null
          company_id?: string
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          division_id?: string | null
          human_confirmed_fields?: string[]
          human_corrected?: boolean
          id?: string
          imported_by?: string | null
          internal_notes?: string | null
          parent_estimate_id?: string | null
          project_creation_key?: string | null
          project_id?: string | null
          raw_filename?: string | null
          risk_level?: string | null
          risk_summary?: string | null
          schema_version?: string
          source?: string
          source_format?: string | null
          source_type?: string
          status?: string
          target_type?: string | null
          target_value?: number | null
          title?: string
          total?: number
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimates_business_unit_same_company_fk"
            columns: ["business_unit_id", "company_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "estimates_client_same_company_fk"
            columns: ["client_id", "company_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "estimates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_division_same_company_fk"
            columns: ["division_id", "company_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "estimates_parent_same_company_fk"
            columns: ["parent_estimate_id", "company_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "estimates_project_same_company_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      expense_project_splits: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          expense_id: string
          id: string
          percentage: number | null
          project_id: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          expense_id: string
          id?: string
          percentage?: number | null
          project_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          expense_id?: string
          id?: string
          percentage?: number | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_project_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_project_splits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          category_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          division_id: string
          id: string
          import_hash: string | null
          is_overhead: boolean
          project_id: string | null
          receipt_url: string | null
          reconciled_at: string | null
          spent_on: string
          vendor_id: string | null
          worker_id: string | null
        }
        Insert: {
          amount?: number
          bank_transaction_id?: string | null
          category_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          division_id: string
          id?: string
          import_hash?: string | null
          is_overhead?: boolean
          project_id?: string | null
          receipt_url?: string | null
          reconciled_at?: string | null
          spent_on?: string
          vendor_id?: string | null
          worker_id?: string | null
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          division_id?: string
          id?: string
          import_hash?: string | null
          is_overhead?: boolean
          project_id?: string | null
          receipt_url?: string | null
          reconciled_at?: string | null
          spent_on?: string
          vendor_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      handoff_adjustments: {
        Row: {
          actual_labor_before_adjustment: number | null
          actual_materials_before_adjustment: number | null
          company_id: string
          created_at: string
          created_by: string | null
          handoff_labor_budget: number | null
          handoff_materials_budget: number | null
          id: string
          import_file_id: string
          labor_adjustment: number | null
          materials_adjustment: number | null
          project_id: string | null
          project_label: string
          raw_json: Json
          rule: string | null
          stable_key: string
        }
        Insert: {
          actual_labor_before_adjustment?: number | null
          actual_materials_before_adjustment?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          handoff_labor_budget?: number | null
          handoff_materials_budget?: number | null
          id?: string
          import_file_id: string
          labor_adjustment?: number | null
          materials_adjustment?: number | null
          project_id?: string | null
          project_label: string
          raw_json?: Json
          rule?: string | null
          stable_key: string
        }
        Update: {
          actual_labor_before_adjustment?: number | null
          actual_materials_before_adjustment?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          handoff_labor_budget?: number | null
          handoff_materials_budget?: number | null
          id?: string
          import_file_id?: string
          labor_adjustment?: number | null
          materials_adjustment?: number | null
          project_id?: string | null
          project_label?: string
          raw_json?: Json
          rule?: string | null
          stable_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "handoff_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_adjustments_import_file_id_fkey"
            columns: ["import_file_id"]
            isOneToOne: false
            referencedRelation: "import_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_adjustments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_file_same_company_fk"
            columns: ["import_file_id", "company_id"]
            isOneToOne: false
            referencedRelation: "import_files"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "handoff_project_same_company_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      import_files: {
        Row: {
          auto_approved_count: number
          company_id: string
          created_at: string
          duplicate_count: number
          error_message: string | null
          file_name: string
          file_size: number | null
          id: string
          imported_count: number
          metadata: Json
          mime_type: string | null
          needs_review_count: number
          no_match_count: number
          package_hash: string | null
          source: string | null
          status: Database["public"]["Enums"]["import_file_status"]
          total_rows: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          auto_approved_count?: number
          company_id: string
          created_at?: string
          duplicate_count?: number
          error_message?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          imported_count?: number
          metadata?: Json
          mime_type?: string | null
          needs_review_count?: number
          no_match_count?: number
          package_hash?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["import_file_status"]
          total_rows?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          auto_approved_count?: number
          company_id?: string
          created_at?: string
          duplicate_count?: number
          error_message?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          imported_count?: number
          metadata?: Json
          mime_type?: string | null
          needs_review_count?: number
          no_match_count?: number
          package_hash?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["import_file_status"]
          total_rows?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_row_suggestions: {
        Row: {
          company_id: string
          confidence: number
          created_at: string
          field: string
          id: string
          import_row_id: string
          reason: string | null
          target_id: string | null
          target_label: string | null
        }
        Insert: {
          company_id: string
          confidence?: number
          created_at?: string
          field: string
          id?: string
          import_row_id: string
          reason?: string | null
          target_id?: string | null
          target_label?: string | null
        }
        Update: {
          company_id?: string
          confidence?: number
          created_at?: string
          field?: string
          id?: string
          import_row_id?: string
          reason?: string | null
          target_id?: string | null
          target_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_row_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_suggestions_import_row_id_fkey"
            columns: ["import_row_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_row_suggestions_row_same_company_fk"
            columns: ["import_row_id", "company_id"]
            isOneToOne: false
            referencedRelation: "import_rows"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      import_rows: {
        Row: {
          affects_project_profitability: boolean
          bank_confirmed: boolean
          bank_row: string | null
          company_id: string
          component_count: number | null
          component_index: number | null
          component_sum: number | null
          confidence_score: number
          corrected_category: string | null
          corrected_project: string | null
          correction_reason: string | null
          created_at: string
          detected_type: Database["public"]["Enums"]["import_row_type"]
          duplicate_classification: string
          duplicate_of: string | null
          error_message: string | null
          id: string
          import_file_id: string
          import_hash: string | null
          imported_at: string | null
          imported_record_id: string | null
          ledger_transaction_id: string | null
          movement_type: string | null
          notes: string | null
          original_bank_amount: number | null
          original_category: string | null
          original_project: string | null
          parsed_amount: number | null
          parsed_date: string | null
          parsed_description: string | null
          raw_json: Json
          reviewed_at: string | null
          reviewed_by: string | null
          row_number: number
          rule_applied_id: string | null
          source: string | null
          source_sheet: string | null
          split_group_id: string | null
          split_validation: string | null
          stable_key: string | null
          status: Database["public"]["Enums"]["import_row_status"]
          suggested_category_id: string | null
          suggested_client_id: string | null
          suggested_division_id: string | null
          suggested_project_id: string | null
          suggested_vendor_id: string | null
          suggested_worker_id: string | null
          traceability_status:
            | Database["public"]["Enums"]["import_traceability_status"]
            | null
          updated_at: string
          user_note: string | null
        }
        Insert: {
          affects_project_profitability?: boolean
          bank_confirmed?: boolean
          bank_row?: string | null
          company_id: string
          component_count?: number | null
          component_index?: number | null
          component_sum?: number | null
          confidence_score?: number
          corrected_category?: string | null
          corrected_project?: string | null
          correction_reason?: string | null
          created_at?: string
          detected_type?: Database["public"]["Enums"]["import_row_type"]
          duplicate_classification?: string
          duplicate_of?: string | null
          error_message?: string | null
          id?: string
          import_file_id: string
          import_hash?: string | null
          imported_at?: string | null
          imported_record_id?: string | null
          ledger_transaction_id?: string | null
          movement_type?: string | null
          notes?: string | null
          original_bank_amount?: number | null
          original_category?: string | null
          original_project?: string | null
          parsed_amount?: number | null
          parsed_date?: string | null
          parsed_description?: string | null
          raw_json?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          row_number: number
          rule_applied_id?: string | null
          source?: string | null
          source_sheet?: string | null
          split_group_id?: string | null
          split_validation?: string | null
          stable_key?: string | null
          status?: Database["public"]["Enums"]["import_row_status"]
          suggested_category_id?: string | null
          suggested_client_id?: string | null
          suggested_division_id?: string | null
          suggested_project_id?: string | null
          suggested_vendor_id?: string | null
          suggested_worker_id?: string | null
          traceability_status?:
            | Database["public"]["Enums"]["import_traceability_status"]
            | null
          updated_at?: string
          user_note?: string | null
        }
        Update: {
          affects_project_profitability?: boolean
          bank_confirmed?: boolean
          bank_row?: string | null
          company_id?: string
          component_count?: number | null
          component_index?: number | null
          component_sum?: number | null
          confidence_score?: number
          corrected_category?: string | null
          corrected_project?: string | null
          correction_reason?: string | null
          created_at?: string
          detected_type?: Database["public"]["Enums"]["import_row_type"]
          duplicate_classification?: string
          duplicate_of?: string | null
          error_message?: string | null
          id?: string
          import_file_id?: string
          import_hash?: string | null
          imported_at?: string | null
          imported_record_id?: string | null
          ledger_transaction_id?: string | null
          movement_type?: string | null
          notes?: string | null
          original_bank_amount?: number | null
          original_category?: string | null
          original_project?: string | null
          parsed_amount?: number | null
          parsed_date?: string | null
          parsed_description?: string | null
          raw_json?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          row_number?: number
          rule_applied_id?: string | null
          source?: string | null
          source_sheet?: string | null
          split_group_id?: string | null
          split_validation?: string | null
          stable_key?: string | null
          status?: Database["public"]["Enums"]["import_row_status"]
          suggested_category_id?: string | null
          suggested_client_id?: string | null
          suggested_division_id?: string | null
          suggested_project_id?: string | null
          suggested_vendor_id?: string | null
          suggested_worker_id?: string | null
          traceability_status?:
            | Database["public"]["Enums"]["import_traceability_status"]
            | null
          updated_at?: string
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_category_same_company_fk"
            columns: ["suggested_category_id", "company_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_rows_client_same_company_fk"
            columns: ["suggested_client_id", "company_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_division_same_company_fk"
            columns: ["suggested_division_id", "company_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_rows_file_same_company_fk"
            columns: ["import_file_id", "company_id"]
            isOneToOne: false
            referencedRelation: "import_files"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_rows_import_file_id_fkey"
            columns: ["import_file_id"]
            isOneToOne: false
            referencedRelation: "import_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_project_same_company_fk"
            columns: ["suggested_project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_rows_rule_applied_id_fkey"
            columns: ["rule_applied_id"]
            isOneToOne: false
            referencedRelation: "import_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_suggested_client_id_fkey"
            columns: ["suggested_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_suggested_division_id_fkey"
            columns: ["suggested_division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_suggested_project_id_fkey"
            columns: ["suggested_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_suggested_vendor_id_fkey"
            columns: ["suggested_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_suggested_worker_id_fkey"
            columns: ["suggested_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_vendor_same_company_fk"
            columns: ["suggested_vendor_id", "company_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_rows_worker_same_company_fk"
            columns: ["suggested_worker_id", "company_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      import_rules: {
        Row: {
          auto_confirm: boolean
          company_id: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          match_field: string
          match_kind: string
          match_pattern: string
          name: string
          priority: number
          set_category_id: string | null
          set_client_id: string | null
          set_project_id: string | null
          set_type: Database["public"]["Enums"]["import_row_type"] | null
          set_vendor_id: string | null
          set_worker_id: string | null
          updated_at: string
        }
        Insert: {
          auto_confirm?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          match_field: string
          match_kind?: string
          match_pattern: string
          name: string
          priority?: number
          set_category_id?: string | null
          set_client_id?: string | null
          set_project_id?: string | null
          set_type?: Database["public"]["Enums"]["import_row_type"] | null
          set_vendor_id?: string | null
          set_worker_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_confirm?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          match_field?: string
          match_kind?: string
          match_pattern?: string
          name?: string
          priority?: number
          set_category_id?: string | null
          set_client_id?: string | null
          set_project_id?: string | null
          set_type?: Database["public"]["Enums"]["import_row_type"] | null
          set_vendor_id?: string | null
          set_worker_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rules_category_same_company_fk"
            columns: ["set_category_id", "company_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_rules_client_same_company_fk"
            columns: ["set_client_id", "company_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rules_project_same_company_fk"
            columns: ["set_project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_rules_set_category_id_fkey"
            columns: ["set_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rules_set_client_id_fkey"
            columns: ["set_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rules_set_project_id_fkey"
            columns: ["set_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rules_set_vendor_id_fkey"
            columns: ["set_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rules_set_worker_id_fkey"
            columns: ["set_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rules_vendor_same_company_fk"
            columns: ["set_vendor_id", "company_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      import_runs: {
        Row: {
          company_id: string
          created_at: string
          id: string
          source: string
          status: string
          summary: Json | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          source: string
          status?: string
          summary?: Json | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          source?: string
          status?: string
          summary?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      integration_audit_logs: {
        Row: {
          company_id: string
          created_at: string
          error_code: string | null
          event_type: string
          id: string
          metadata: Json
          result: string
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          error_code?: string | null
          event_type: string
          id?: string
          metadata?: Json
          result: string
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          error_code?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          result?: string
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_audit_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempt_count: number
          company_id: string
          created_at: string
          id: string
          idempotency_key: string
          last_error_code: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string | null
          processed_at: string | null
          provider_message_id: string | null
          provider_status: string | null
          scheduled_for: string
          status: string
          task_id: string | null
          type: string
          updated_at: string
          user_id: string | null
          worker_id: string | null
        }
        Insert: {
          attempt_count?: number
          company_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          processed_at?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          scheduled_for?: string
          status?: string
          task_id?: string | null
          type: string
          updated_at?: string
          user_id?: string | null
          worker_id?: string | null
        }
        Update: {
          attempt_count?: number
          company_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          processed_at?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          scheduled_for?: string
          status?: string
          task_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          division_id: string
          id: string
          import_hash: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          project_id: string | null
          received_on: string
          reconciled_at: string | null
        }
        Insert: {
          amount?: number
          bank_transaction_id?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          division_id: string
          id?: string
          import_hash?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          project_id?: string | null
          received_on?: string
          reconciled_at?: string | null
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          division_id?: string
          id?: string
          import_hash?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          project_id?: string | null
          received_on?: string
          reconciled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      product_feedback: {
        Row: {
          app_version: string | null
          biggest_difficulty: string | null
          comments: string | null
          company_id: string
          contact: string | null
          contact_permission: boolean
          created_at: string
          ease_rating: number | null
          id: string
          most_useful_feature: string | null
          priority: string
          route: string | null
          severity: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          submission_id: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          biggest_difficulty?: string | null
          comments?: string | null
          company_id: string
          contact?: string | null
          contact_permission?: boolean
          created_at?: string
          ease_rating?: number | null
          id?: string
          most_useful_feature?: string | null
          priority?: string
          route?: string | null
          severity?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          submission_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          biggest_difficulty?: string | null
          comments?: string | null
          company_id?: string
          contact?: string | null
          contact_permission?: boolean
          created_at?: string
          ease_rating?: number | null
          id?: string
          most_useful_feature?: string | null
          priority?: string
          route?: string | null
          severity?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          submission_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          calendar_notifications_enabled: boolean
          company_id: string | null
          created_at: string
          daily_reminder_enabled: boolean
          daily_reminder_time: string
          email: string | null
          full_name: string | null
          id: string
          mobile_phone_e164: string | null
          mobile_phone_verified_at: string | null
          preferred_calendar_id: string | null
          sms_notifications_enabled: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          calendar_notifications_enabled?: boolean
          company_id?: string | null
          created_at?: string
          daily_reminder_enabled?: boolean
          daily_reminder_time?: string
          email?: string | null
          full_name?: string | null
          id: string
          mobile_phone_e164?: string | null
          mobile_phone_verified_at?: string | null
          preferred_calendar_id?: string | null
          sms_notifications_enabled?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          calendar_notifications_enabled?: boolean
          company_id?: string | null
          created_at?: string
          daily_reminder_enabled?: boolean
          daily_reminder_time?: string
          email?: string | null
          full_name?: string | null
          id?: string
          mobile_phone_e164?: string | null
          mobile_phone_verified_at?: string | null
          preferred_calendar_id?: string | null
          sms_notifications_enabled?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          business_unit_id: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          division_id: string
          end_date: string | null
          estimated_total: number
          exclude_from_overhead: boolean
          id: string
          is_sandbox: boolean
          name: string
          notes: string | null
          project_code: string | null
          project_type: Database["public"]["Enums"]["project_type"]
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_unit_id?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          division_id: string
          end_date?: string | null
          estimated_total?: number
          exclude_from_overhead?: boolean
          id?: string
          is_sandbox?: boolean
          name: string
          notes?: string | null
          project_code?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_unit_id?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          division_id?: string
          end_date?: string | null
          estimated_total?: number
          exclude_from_overhead?: boolean
          id?: string
          is_sandbox?: boolean
          name?: string
          notes?: string | null
          project_code?: string | null
          project_type?: Database["public"]["Enums"]["project_type"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_business_unit_same_company_fk"
            columns: ["business_unit_id", "company_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number | null
          category_id: string | null
          company_id: string
          created_at: string
          description: string | null
          division_id: string | null
          expense_id: string | null
          extracted: Json | null
          file_hash: string | null
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          line_items: Json | null
          mime_type: string | null
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          project_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          spent_on: string | null
          status: Database["public"]["Enums"]["receipt_status"]
          storage_path: string | null
          uploaded_by: string | null
          vendor_id: string | null
        }
        Insert: {
          amount?: number | null
          category_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          division_id?: string | null
          expense_id?: string | null
          extracted?: Json | null
          file_hash?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          line_items?: Json | null
          mime_type?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_on?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          storage_path?: string | null
          uploaded_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          amount?: number | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          division_id?: string | null
          expense_id?: string | null
          extracted?: Json | null
          file_hash?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          line_items?: Json | null
          mime_type?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_on?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          storage_path?: string | null
          uploaded_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          assigned_to: string
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          note: string | null
          requested_by: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          note?: string | null
          requested_by: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          note?: string | null
          requested_by?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reward_notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message: string
          project_id: string | null
          seen: boolean
          task_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message: string
          project_id?: string | null
          seen?: boolean
          task_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message?: string
          project_id?: string | null
          seen?: boolean
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reward_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignment_patterns: {
        Row: {
          company_id: string
          confidence: number
          created_at: string
          division_id: string
          id: string
          last_used_at: string
          project_type: Database["public"]["Enums"]["project_type"]
          task_type: string
          times_assigned: number
          worker_id: string
        }
        Insert: {
          company_id: string
          confidence?: number
          created_at?: string
          division_id: string
          id?: string
          last_used_at?: string
          project_type: Database["public"]["Enums"]["project_type"]
          task_type: string
          times_assigned?: number
          worker_id: string
        }
        Update: {
          company_id?: string
          confidence?: number
          created_at?: string
          division_id?: string
          id?: string
          last_used_at?: string
          project_type?: Database["public"]["Enums"]["project_type"]
          task_type?: string
          times_assigned?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignment_patterns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignment_patterns_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignment_patterns_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          company_id: string
          depends_on_task_id: string
          id: string
          task_id: string
        }
        Insert: {
          company_id: string
          depends_on_task_id: string
          id?: string
          task_id: string
        }
        Update: {
          company_id?: string
          depends_on_task_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          assigned_worker_id: string | null
          assignment_notification_sent_at: string | null
          calendar_event_id: string | null
          calendar_last_synced_at: string | null
          calendar_sync_status: string
          company_id: string
          created_at: string
          description: string | null
          division_id: string
          due_time: string
          duration_minutes: number
          ends_at: string | null
          estimated_duration_hours: number | null
          id: string
          notes: string | null
          notification_version: number
          planned_end_date: string | null
          planned_start_date: string | null
          position: number
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          project_type: Database["public"]["Enums"]["project_type"] | null
          reminder_sms_scheduled_at: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_phase: string | null
          task_type: string | null
          timezone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          assigned_worker_id?: string | null
          assignment_notification_sent_at?: string | null
          calendar_event_id?: string | null
          calendar_last_synced_at?: string | null
          calendar_sync_status?: string
          company_id: string
          created_at?: string
          description?: string | null
          division_id: string
          due_time?: string
          duration_minutes?: number
          ends_at?: string | null
          estimated_duration_hours?: number | null
          id?: string
          notes?: string | null
          notification_version?: number
          planned_end_date?: string | null
          planned_start_date?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          project_type?: Database["public"]["Enums"]["project_type"] | null
          reminder_sms_scheduled_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_phase?: string | null
          task_type?: string | null
          timezone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          assigned_worker_id?: string | null
          assignment_notification_sent_at?: string | null
          calendar_event_id?: string | null
          calendar_last_synced_at?: string | null
          calendar_sync_status?: string
          company_id?: string
          created_at?: string
          description?: string | null
          division_id?: string
          due_time?: string
          duration_minutes?: number
          ends_at?: string | null
          estimated_duration_hours?: number | null
          id?: string
          notes?: string | null
          notification_version?: number
          planned_end_date?: string | null
          planned_start_date?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          project_type?: Database["public"]["Enums"]["project_type"] | null
          reminder_sms_scheduled_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_phase?: string | null
          task_type?: string | null
          timezone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_calendar_connections: {
        Row: {
          access_token_expires_at: string | null
          company_id: string
          connected_at: string | null
          created_at: string
          encrypted_refresh_token: string | null
          id: string
          last_error_code: string | null
          last_sync_at: string | null
          provider: string
          provider_account_email: string | null
          scopes: string[]
          selected_calendar_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_expires_at?: string | null
          company_id: string
          connected_at?: string | null
          created_at?: string
          encrypted_refresh_token?: string | null
          id?: string
          last_error_code?: string | null
          last_sync_at?: string | null
          provider?: string
          provider_account_email?: string | null
          scopes?: string[]
          selected_calendar_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_expires_at?: string | null
          company_id?: string
          connected_at?: string | null
          created_at?: string
          encrypted_refresh_token?: string | null
          id?: string
          last_error_code?: string | null
          last_sync_at?: string | null
          provider?: string
          provider_account_email?: string | null
          scopes?: string[]
          selected_calendar_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_calendar_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_category_patterns: {
        Row: {
          category_id: string | null
          company_id: string
          created_at: string
          division_id: string | null
          id: string
          last_used_at: string
          project_id: string | null
          times_used: number
          vendor_id: string
        }
        Insert: {
          category_id?: string | null
          company_id: string
          created_at?: string
          division_id?: string | null
          id?: string
          last_used_at?: string
          project_id?: string | null
          times_used?: number
          vendor_id: string
        }
        Update: {
          category_id?: string | null
          company_id?: string
          created_at?: string
          division_id?: string | null
          id?: string
          last_used_at?: string
          project_id?: string | null
          times_used?: number
          vendor_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_checkins: {
        Row: {
          checked_in_at: string
          checked_out_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          division_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          project_id: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          checked_in_at?: string
          checked_out_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          division_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          project_id?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          checked_in_at?: string
          checked_out_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          division_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          project_id?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: []
      }
      workers: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          default_division_id: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          trade: string | null
          updated_at: string
          user_id: string | null
          worker_type: Database["public"]["Enums"]["worker_type"]
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          default_division_id?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          trade?: string | null
          updated_at?: string
          user_id?: string | null
          worker_type?: Database["public"]["Enums"]["worker_type"]
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          default_division_id?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          trade?: string | null
          updated_at?: string
          user_id?: string | null
          worker_type?: Database["public"]["Enums"]["worker_type"]
        }
        Relationships: [
          {
            foreignKeyName: "workers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      project_financial_ledger: {
        Row: {
          amount: number | null
          category: string | null
          client: string | null
          company_id: string | null
          confidence_score: number | null
          created_at: string | null
          date: string | null
          description: string | null
          direction: string | null
          division_id: string | null
          expense_id: string | null
          project_id: string | null
          source_id: string | null
          source_note: string | null
          source_type: string | null
          status: string | null
          vendor: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      answer_estimate_review_question: {
        Args: { _answer: string; _question_id: string }
        Returns: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          category: string
          company_id: string
          created_at: string
          estimate_id: string
          id: string
          ordinal: number
          question: string
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "estimate_questions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_import_rules: {
        Args: { _file_id: string }
        Returns: {
          applied: number
          confirmed: number
        }[]
      }
      approve_photo_estimate: { Args: { _estimate_id: string }; Returns: Json }
      beta_feedback_overview: {
        Args: never
        Returns: {
          active_trial_companies: number
          closed_count: number
          expired_trials: number
          fixed_count: number
          new_count: number
          reviewing_count: number
          trials_expiring_soon: number
        }[]
      }
      can_manage_estimate: {
        Args: { _company_id: string; _estimate_id: string }
        Returns: boolean
      }
      can_manage_financial_import: {
        Args: { _company_id: string }
        Returns: boolean
      }
      claim_financial_import_rows: {
        Args: { _row_ids: string[] }
        Returns: {
          affects_project_profitability: boolean
          bank_confirmed: boolean
          bank_row: string | null
          company_id: string
          component_count: number | null
          component_index: number | null
          component_sum: number | null
          confidence_score: number
          corrected_category: string | null
          corrected_project: string | null
          correction_reason: string | null
          created_at: string
          detected_type: Database["public"]["Enums"]["import_row_type"]
          duplicate_classification: string
          duplicate_of: string | null
          error_message: string | null
          id: string
          import_file_id: string
          import_hash: string | null
          imported_at: string | null
          imported_record_id: string | null
          ledger_transaction_id: string | null
          movement_type: string | null
          notes: string | null
          original_bank_amount: number | null
          original_category: string | null
          original_project: string | null
          parsed_amount: number | null
          parsed_date: string | null
          parsed_description: string | null
          raw_json: Json
          reviewed_at: string | null
          reviewed_by: string | null
          row_number: number
          rule_applied_id: string | null
          source: string | null
          source_sheet: string | null
          split_group_id: string | null
          split_validation: string | null
          stable_key: string | null
          status: Database["public"]["Enums"]["import_row_status"]
          suggested_category_id: string | null
          suggested_client_id: string | null
          suggested_division_id: string | null
          suggested_project_id: string | null
          suggested_vendor_id: string | null
          suggested_worker_id: string | null
          traceability_status:
            | Database["public"]["Enums"]["import_traceability_status"]
            | null
          updated_at: string
          user_note: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "import_rows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_financial_ledger_rows: {
        Args: { _row_ids: string[] }
        Returns: {
          affects_project_profitability: boolean
          bank_confirmed: boolean
          bank_row: string | null
          company_id: string
          component_count: number | null
          component_index: number | null
          component_sum: number | null
          confidence_score: number
          corrected_category: string | null
          corrected_project: string | null
          correction_reason: string | null
          created_at: string
          detected_type: Database["public"]["Enums"]["import_row_type"]
          duplicate_classification: string
          duplicate_of: string | null
          error_message: string | null
          id: string
          import_file_id: string
          import_hash: string | null
          imported_at: string | null
          imported_record_id: string | null
          ledger_transaction_id: string | null
          movement_type: string | null
          notes: string | null
          original_bank_amount: number | null
          original_category: string | null
          original_project: string | null
          parsed_amount: number | null
          parsed_date: string | null
          parsed_description: string | null
          raw_json: Json
          reviewed_at: string | null
          reviewed_by: string | null
          row_number: number
          rule_applied_id: string | null
          source: string | null
          source_sheet: string | null
          split_group_id: string | null
          split_validation: string | null
          stable_key: string | null
          status: Database["public"]["Enums"]["import_row_status"]
          suggested_category_id: string | null
          suggested_client_id: string | null
          suggested_division_id: string | null
          suggested_project_id: string | null
          suggested_vendor_id: string | null
          suggested_worker_id: string | null
          traceability_status:
            | Database["public"]["Enums"]["import_traceability_status"]
            | null
          updated_at: string
          user_note: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "import_rows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_notification_outbox: {
        Args: { _limit?: number; _types: string[]; _worker_id: string }
        Returns: {
          attempt_count: number
          company_id: string
          created_at: string
          id: string
          idempotency_key: string
          last_error_code: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string | null
          processed_at: string | null
          provider_message_id: string | null
          provider_status: string | null
          scheduled_for: string
          status: string
          task_id: string | null
          type: string
          updated_at: string
          user_id: string | null
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_google_oauth_states: { Args: never; Returns: number }
      company_trial_state: { Args: { _company_id: string }; Returns: string }
      company_writes_allowed: {
        Args: { _company_id: string }
        Returns: boolean
      }
      consume_google_oauth_state: {
        Args: { p_state_hash: string }
        Returns: {
          company_id: string
          encrypted_code_verifier: string
          expires_at: string
          redirect_uri: string
          user_id: string
        }[]
      }
      create_company_for_current_user: {
        Args: { _name: string; _timezone?: string }
        Returns: string
      }
      create_estimate_revision: {
        Args: { _estimate_id: string }
        Returns: string
      }
      create_google_oauth_state: {
        Args: {
          p_company_id: string
          p_encrypted_code_verifier: string
          p_expires_at: string
          p_redirect_uri: string
          p_state_hash: string
          p_user_id: string
        }
        Returns: undefined
      }
      create_work_from_estimate: {
        Args: {
          _address?: string
          _business_unit_id?: string
          _client_id: string
          _division_id: string
          _estimate_id: string
          _project_creation_key: string
          _project_type?: Database["public"]["Enums"]["project_type"]
        }
        Returns: string
      }
      current_company_id: { Args: never; Returns: string }
      finish_notification_outbox: {
        Args: {
          _error_code?: string
          _id: string
          _provider_id?: string
          _status: string
          _worker_id: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_estimate_review_questions: {
        Args: { _estimate_id: string; _questions: Json }
        Returns: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          category: string
          company_id: string
          created_at: string
          estimate_id: string
          id: string
          ordinal: number
          question: string
          reason: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "estimate_questions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_beta_feedback_admin: { Args: never; Returns: boolean }
      is_company_member: { Args: { _company_id: string }; Returns: boolean }
      my_trial_status: {
        Args: never
        Returns: {
          company_id: string
          days_remaining: number
          state: string
          trial_ends_at: string
        }[]
      }
      persist_estimate_photo_extraction: {
        Args: {
          p_attempts: number
          p_extraction: Json
          p_model: string
          p_run_id: string
        }
        Returns: Json
      }
      persist_estimate_photo_extraction_v1_legacy: {
        Args: {
          p_attempts: number
          p_extraction: Json
          p_model: string
          p_run_id: string
        }
        Returns: Json
      }
      record_estimate_learned_terms: {
        Args: { _estimate_id: string; _terms: Json }
        Returns: number
      }
      save_estimate_human_review: {
        Args: {
          _answers: Json
          _charge_amount: number
          _estimate_id: string
          _items: Json
          _title: string
        }
        Returns: Json
      }
      save_estimate_human_review_v11: {
        Args: {
          _answers: Json
          _charge_amount: number
          _currency_code: string
          _estimate_confirmed_fields: string[]
          _estimate_id: string
          _items: Json
          _questions: Json
          _title: string
        }
        Returns: Json
      }
      set_estimate_learned_term_active: {
        Args: { _is_active: boolean; _term_id: string }
        Returns: {
          company_id: string
          confidence: number
          confirmations: number
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          normalized_term: string
          observed_term: string
          source_estimate_id: string | null
          term_type: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "estimate_learned_terms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      alert_severity: "info" | "warning" | "critical"
      app_role: "admin" | "manager" | "member" | "viewer" | "field"
      feedback_status: "new" | "reviewing" | "fixed" | "closed"
      import_file_status:
        | "uploaded"
        | "parsing"
        | "staged"
        | "reviewing"
        | "completed"
        | "failed"
      import_row_status:
        | "pending"
        | "suggested"
        | "confirmed"
        | "excluded"
        | "imported"
        | "error"
        | "duplicate"
      import_row_type:
        | "expense"
        | "payment"
        | "labor"
        | "estimate"
        | "task"
        | "project"
        | "unknown"
        | "bank_tx"
      import_traceability_status:
        | "CONFIRMED_BANK_MATCH"
        | "CONFIRMED_BY_USER_NOTE"
        | "GENERAL_OVERHEAD_ALLOCATED"
        | "HANDOFF_ADJUSTMENT"
        | "PENDING_BANK_CONFIRMATION"
        | "NEEDS_PROJECT_REVIEW"
      payment_method:
        | "cash"
        | "check"
        | "card"
        | "ach"
        | "zelle"
        | "venmo"
        | "other"
      project_status: "draft" | "active" | "on_hold" | "completed" | "cancelled"
      project_type:
        | "bathroom_remodel"
        | "kitchen_remodel"
        | "painting"
        | "drywall"
        | "flooring"
        | "roof"
        | "landscaping"
        | "junk_removal"
        | "general_handyman"
        | "other"
      receipt_status:
        | "uploaded"
        | "needs_review"
        | "linked_to_project"
        | "ready_to_convert"
        | "converted_to_expense"
        | "rejected"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "overdue"
        | "blocked"
        | "cancelled"
      worker_type: "worker" | "subcontractor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      alert_severity: ["info", "warning", "critical"],
      app_role: ["admin", "manager", "member", "viewer", "field"],
      feedback_status: ["new", "reviewing", "fixed", "closed"],
      import_file_status: [
        "uploaded",
        "parsing",
        "staged",
        "reviewing",
        "completed",
        "failed",
      ],
      import_row_status: [
        "pending",
        "suggested",
        "confirmed",
        "excluded",
        "imported",
        "error",
        "duplicate",
      ],
      import_row_type: [
        "expense",
        "payment",
        "labor",
        "estimate",
        "task",
        "project",
        "unknown",
        "bank_tx",
      ],
      import_traceability_status: [
        "CONFIRMED_BANK_MATCH",
        "CONFIRMED_BY_USER_NOTE",
        "GENERAL_OVERHEAD_ALLOCATED",
        "HANDOFF_ADJUSTMENT",
        "PENDING_BANK_CONFIRMATION",
        "NEEDS_PROJECT_REVIEW",
      ],
      payment_method: [
        "cash",
        "check",
        "card",
        "ach",
        "zelle",
        "venmo",
        "other",
      ],
      project_status: ["draft", "active", "on_hold", "completed", "cancelled"],
      project_type: [
        "bathroom_remodel",
        "kitchen_remodel",
        "painting",
        "drywall",
        "flooring",
        "roof",
        "landscaping",
        "junk_removal",
        "general_handyman",
        "other",
      ],
      receipt_status: [
        "uploaded",
        "needs_review",
        "linked_to_project",
        "ready_to_convert",
        "converted_to_expense",
        "rejected",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: [
        "pending",
        "in_progress",
        "completed",
        "overdue",
        "blocked",
        "cancelled",
      ],
      worker_type: ["worker", "subcontractor"],
    },
  },
} as const
