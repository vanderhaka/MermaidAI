export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          artifact_id: string | null
          artifact_version_id: string | null
          change_set_id: string | null
          content: string
          created_at: string
          id: string
          metadata: Json | null
          message_key: string | null
          planning_stage: string | null
          project_id: string
          role: string
          turn_id: string | null
        }
        Insert: {
          artifact_id?: string | null
          artifact_version_id?: string | null
          change_set_id?: string | null
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          message_key?: string | null
          planning_stage?: string | null
          project_id: string
          role: string
          turn_id?: string | null
        }
        Update: {
          artifact_id?: string | null
          artifact_version_id?: string | null
          change_set_id?: string | null
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          message_key?: string | null
          planning_stage?: string | null
          project_id?: string
          role?: string
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'chat_messages_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      flow_edges: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          label: string | null
          module_id: string
          source_node_id: string
          target_node_id: string
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          label?: string | null
          module_id: string
          source_node_id: string
          target_node_id: string
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          label?: string | null
          module_id?: string
          source_node_id?: string
          target_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'flow_edges_module_id_fkey'
            columns: ['module_id']
            isOneToOne: false
            referencedRelation: 'modules'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'flow_edges_source_node_id_fkey'
            columns: ['source_node_id']
            isOneToOne: false
            referencedRelation: 'flow_nodes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'flow_edges_target_node_id_fkey'
            columns: ['target_node_id']
            isOneToOne: false
            referencedRelation: 'flow_nodes'
            referencedColumns: ['id']
          },
        ]
      }
      flow_nodes: {
        Row: {
          color: string | null
          created_at: string
          id: string
          label: string
          module_id: string
          node_type: string
          position_x: number | null
          position_y: number | null
          pseudocode: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          label: string
          module_id: string
          node_type: string
          position_x?: number | null
          position_y?: number | null
          pseudocode?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          label?: string
          module_id?: string
          node_type?: string
          position_x?: number | null
          position_y?: number | null
          pseudocode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'flow_nodes_module_id_fkey'
            columns: ['module_id']
            isOneToOne: false
            referencedRelation: 'modules'
            referencedColumns: ['id']
          },
        ]
      }
      module_connections: {
        Row: {
          created_at: string
          id: string
          project_id: string
          source_exit_point: string
          source_module_id: string
          target_entry_point: string
          target_module_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          source_exit_point: string
          source_module_id: string
          target_entry_point: string
          target_module_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          source_exit_point?: string
          source_module_id?: string
          target_entry_point?: string
          target_module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'module_connections_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'module_connections_source_module_id_fkey'
            columns: ['source_module_id']
            isOneToOne: false
            referencedRelation: 'modules'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'module_connections_target_module_id_fkey'
            columns: ['target_module_id']
            isOneToOne: false
            referencedRelation: 'modules'
            referencedColumns: ['id']
          },
        ]
      }
      modules: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          domain: string | null
          entry_points: Json | null
          exit_points: Json | null
          id: string
          name: string
          position_x: number | null
          position_y: number | null
          prd_content: string
          project_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          domain?: string | null
          entry_points?: Json | null
          exit_points?: Json | null
          id?: string
          name: string
          position_x?: number | null
          position_y?: number | null
          prd_content?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          domain?: string | null
          entry_points?: Json | null
          exit_points?: Json | null
          id?: string
          name?: string
          position_x?: number | null
          position_y?: number | null
          prd_content?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'modules_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      open_questions: {
        Row: {
          artifact_version_id: string | null
          created_at: string
          id: string
          node_id: string
          planning_decision_id: string | null
          provenance: string | null
          project_id: string
          question: string
          resolution: string | null
          readiness_impact: string | null
          resolved_at: string | null
          section: string
          status: string
        }
        Insert: {
          artifact_version_id?: string | null
          created_at?: string
          id?: string
          node_id: string
          planning_decision_id?: string | null
          provenance?: string | null
          project_id: string
          question: string
          resolution?: string | null
          readiness_impact?: string | null
          resolved_at?: string | null
          section: string
          status?: string
        }
        Update: {
          artifact_version_id?: string | null
          created_at?: string
          id?: string
          node_id?: string
          planning_decision_id?: string | null
          provenance?: string | null
          project_id?: string
          question?: string
          resolution?: string | null
          readiness_impact?: string | null
          resolved_at?: string | null
          section?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'open_questions_node_id_fkey'
            columns: ['node_id']
            isOneToOne: false
            referencedRelation: 'flow_nodes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'open_questions_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      planning_artifacts: {
        Row: {
          active_version_id: string | null
          created_at: string
          id: string
          kind: string
          project_id: string
          updated_at: string
        }
        Insert: {
          active_version_id?: string | null
          created_at?: string
          id?: string
          kind: string
          project_id: string
          updated_at?: string
        }
        Update: {
          active_version_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'planning_artifacts_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      planning_artifact_versions: {
        Row: {
          artifact_id: string
          content: Json
          content_hash: string
          content_state: string
          created_at: string
          id: string
          project_id: string
          provenance: Json
          readiness_report: Json | null
          rendered_markdown: string | null
          request_hash: string | null
          request_key: string | null
          secondary_source_version_id: string | null
          source_version_id: string | null
          version: number
        }
        Insert: {
          artifact_id: string
          content: Json
          content_hash: string
          content_state?: string
          created_at?: string
          id?: string
          project_id: string
          provenance?: Json
          readiness_report?: Json | null
          rendered_markdown?: string | null
          request_hash?: string | null
          request_key?: string | null
          secondary_source_version_id?: string | null
          source_version_id?: string | null
          version: number
        }
        Update: {
          artifact_id?: string
          content?: Json
          content_hash?: string
          content_state?: string
          created_at?: string
          id?: string
          project_id?: string
          provenance?: Json
          readiness_report?: Json | null
          rendered_markdown?: string | null
          request_hash?: string | null
          request_key?: string | null
          secondary_source_version_id?: string | null
          source_version_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'planning_artifact_versions_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      planning_change_sets: {
        Row: {
          committed_architecture_version_id: string | null
          committed_work_plan_version_id: string | null
          committed_at: string | null
          committed_revision: number | null
          created_at: string
          expected_revision: number
          id: string
          previous_architecture_version_id: string | null
          previous_work_plan_version_id: string | null
          project_id: string
          receipt: Json | null
          request_hash: string | null
          request_payload: Json | null
          state: string
          summary: Json
          turn_id: string | null
          undo_target_change_set_id: string | null
          undone_at: string | null
          undone_by_change_set_id: string | null
        }
        Insert: {
          committed_architecture_version_id?: string | null
          committed_work_plan_version_id?: string | null
          committed_at?: string | null
          committed_revision?: number | null
          created_at?: string
          expected_revision: number
          id?: string
          previous_architecture_version_id?: string | null
          previous_work_plan_version_id?: string | null
          project_id: string
          receipt?: Json | null
          request_hash?: string | null
          request_payload?: Json | null
          state?: string
          summary?: Json
          turn_id?: string | null
          undo_target_change_set_id?: string | null
          undone_at?: string | null
          undone_by_change_set_id?: string | null
        }
        Update: {
          committed_architecture_version_id?: string | null
          committed_work_plan_version_id?: string | null
          committed_at?: string | null
          committed_revision?: number | null
          created_at?: string
          expected_revision?: number
          id?: string
          previous_architecture_version_id?: string | null
          previous_work_plan_version_id?: string | null
          project_id?: string
          receipt?: Json | null
          request_hash?: string | null
          request_payload?: Json | null
          state?: string
          summary?: Json
          turn_id?: string | null
          undo_target_change_set_id?: string | null
          undone_at?: string | null
          undone_by_change_set_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'planning_change_sets_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      planning_decisions: {
        Row: {
          artifact_version_id: string | null
          category: string
          created_at: string
          id: string
          project_id: string
          provenance: string
          readiness_impact: string
          state: string
          statement: string
          supersedes_decision_id: string | null
          updated_at: string
        }
        Insert: {
          artifact_version_id?: string | null
          category: string
          created_at?: string
          id?: string
          project_id: string
          provenance: string
          readiness_impact?: string
          state?: string
          statement: string
          supersedes_decision_id?: string | null
          updated_at?: string
        }
        Update: {
          artifact_version_id?: string | null
          category?: string
          created_at?: string
          id?: string
          project_id?: string
          provenance?: string
          readiness_impact?: string
          state?: string
          statement?: string
          supersedes_decision_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'planning_decisions_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      planning_decision_events: {
        Row: {
          actor_label: string
          actor_type: string
          actor_user_id: string | null
          architecture_version_id: string
          change_set_id: string
          created_at: string
          decision_id: string
          evidence: Json
          from_state: string | null
          id: string
          project_id: string
          reason: string
          sequence: number
          to_state: string
          undone_by_change_set_id: string | null
        }
        Insert: {
          actor_label: string
          actor_type: string
          actor_user_id?: string | null
          architecture_version_id: string
          change_set_id: string
          created_at?: string
          decision_id: string
          evidence: Json
          from_state?: string | null
          id?: string
          project_id: string
          reason: string
          sequence: number
          to_state: string
          undone_by_change_set_id?: string | null
        }
        Update: {
          actor_label?: string
          actor_type?: string
          actor_user_id?: string | null
          architecture_version_id?: string
          change_set_id?: string
          created_at?: string
          decision_id?: string
          evidence?: Json
          from_state?: string | null
          id?: string
          project_id?: string
          reason?: string
          sequence?: number
          to_state?: string
          undone_by_change_set_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'planning_decision_events_architecture_version_id_project_id_fkey'
            columns: ['architecture_version_id', 'project_id']
            isOneToOne: false
            referencedRelation: 'planning_artifact_versions'
            referencedColumns: ['id', 'project_id']
          },
          {
            foreignKeyName: 'planning_decision_events_change_set_id_fkey'
            columns: ['change_set_id']
            isOneToOne: false
            referencedRelation: 'planning_change_sets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'planning_decision_events_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'planning_decision_events_undone_by_change_set_id_fkey'
            columns: ['undone_by_change_set_id']
            isOneToOne: false
            referencedRelation: 'planning_change_sets'
            referencedColumns: ['id']
          },
        ]
      }
      planning_handoff_jobs: {
        Row: {
          attempt_count: number
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          completed_version_id: string | null
          created_at: string
          error_code: string | null
          id: string
          project_id: string
          request_hash: string
          request_key: string
          source_version_id: string
          state: string
          target_artifact_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          completed_version_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          project_id: string
          request_hash: string
          request_key: string
          source_version_id: string
          state?: string
          target_artifact_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          completed_version_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          project_id?: string
          request_hash?: string
          request_key?: string
          source_version_id?: string
          state?: string
          target_artifact_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'planning_handoff_jobs_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      scope_architecture_handoff_jobs: {
        Row: {
          attempt_count: number
          change_set_id: string
          claim_expires_at: string | null
          claim_token: string | null
          claimed_at: string | null
          completed_version_id: string | null
          created_at: string
          error_code: string | null
          id: string
          project_id: string
          request_hash: string
          request_key: string
          source_hash: string
          source_snapshot: Json
          state: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          change_set_id?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          completed_version_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          project_id: string
          request_hash: string
          request_key: string
          source_hash: string
          source_snapshot: Json
          state?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          change_set_id?: string
          claim_expires_at?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          completed_version_id?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          project_id?: string
          request_hash?: string
          request_key?: string
          source_hash?: string
          source_snapshot?: Json
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'scope_architecture_handoff_jobs_completed_version_id_fkey'
            columns: ['completed_version_id']
            isOneToOne: false
            referencedRelation: 'planning_artifact_versions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'scope_architecture_handoff_jobs_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      planning_operations: {
        Row: {
          after_data: Json | null
          before_data: Json | null
          change_set_id: string
          created_at: string
          id: string
          operation_id: string
          operation_type: string
          project_id: string
          request_hash: string
          semantic: boolean
          sequence: number
        }
        Insert: {
          after_data?: Json | null
          before_data?: Json | null
          change_set_id: string
          created_at?: string
          id?: string
          operation_id: string
          operation_type: string
          project_id: string
          request_hash: string
          semantic: boolean
          sequence: number
        }
        Update: {
          after_data?: Json | null
          before_data?: Json | null
          change_set_id?: string
          created_at?: string
          id?: string
          operation_id?: string
          operation_type?: string
          project_id?: string
          request_hash?: string
          semantic?: boolean
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: 'planning_operations_change_set_id_fkey'
            columns: ['change_set_id']
            isOneToOne: false
            referencedRelation: 'planning_change_sets'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'planning_operations_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      planning_readiness_reports: {
        Row: {
          architecture_version_id: string
          created_at: string
          evaluated_revision: number
          id: string
          project_id: string
          report: Json
          report_hash: string
          schema_version: number
          state: string
        }
        Insert: {
          architecture_version_id: string
          created_at?: string
          evaluated_revision: number
          id?: string
          project_id: string
          report: Json
          report_hash: string
          schema_version?: number
          state: string
        }
        Update: {
          architecture_version_id?: string
          created_at?: string
          evaluated_revision?: number
          id?: string
          project_id?: string
          report?: Json
          report_hash?: string
          schema_version?: number
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: 'planning_readiness_reports_architecture_version_id_project_id_fkey'
            columns: ['architecture_version_id', 'project_id']
            isOneToOne: false
            referencedRelation: 'planning_artifact_versions'
            referencedColumns: ['id', 'project_id']
          },
          {
            foreignKeyName: 'planning_readiness_reports_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      planning_states: {
        Row: {
          active_architecture_artifact_id: string | null
          active_execution_handoff_artifact_id: string | null
          active_work_plan_artifact_id: string | null
          architecture_viewport: Json
          auto_decide_enabled: boolean
          created_at: string
          project_id: string
          readiness_state: string
          stage: string
          staged_workflow_enabled: boolean
          updated_at: string
          write_safety_revision: number
        }
        Insert: {
          active_architecture_artifact_id?: string | null
          active_execution_handoff_artifact_id?: string | null
          active_work_plan_artifact_id?: string | null
          architecture_viewport?: Json
          auto_decide_enabled?: boolean
          created_at?: string
          project_id: string
          readiness_state?: string
          stage?: string
          staged_workflow_enabled?: boolean
          updated_at?: string
          write_safety_revision?: number
        }
        Update: {
          active_architecture_artifact_id?: string | null
          active_execution_handoff_artifact_id?: string | null
          active_work_plan_artifact_id?: string | null
          architecture_viewport?: Json
          auto_decide_enabled?: boolean
          created_at?: string
          project_id?: string
          readiness_state?: string
          stage?: string
          staged_workflow_enabled?: boolean
          updated_at?: string
          write_safety_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: 'planning_states_project_id_fkey'
            columns: ['project_id']
            isOneToOne: true
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          mode: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          mode?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          mode?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_architecture_command: {
        Args: {
          p_architecture_content?: Json | null
          p_architecture_content_hash?: string | null
          p_change_set_id: string
          p_expected_revision: number
          p_operations: Json
          p_project_id: string
          p_request_hash: string
          p_turn_id: string | null
        }
        Returns: Json
      }
      begin_scope_architecture_handoff: {
        Args: {
          p_project_id: string
          p_request_key: string
        }
        Returns: Json
      }
      begin_planning_handoff: {
        Args: {
          p_project_id: string
          p_request_hash: string
          p_request_key: string
          p_source_version_id: string
          p_target_kind: string
        }
        Returns: Json
      }
      claim_scope_architecture_handoff: {
        Args: {
          p_job_id: string
          p_lease_seconds?: number
          p_project_id: string
        }
        Returns: Json
      }
      claim_planning_handoff: {
        Args: {
          p_job_id: string
          p_lease_seconds?: number
          p_project_id: string
        }
        Returns: Json
      }
      commit_work_plan_revision: {
        Args: {
          p_assistant_content: string
          p_assistant_message_key: string
          p_change_set_id: string
          p_commands: Json
          p_content: Json
          p_content_hash: string
          p_expected_work_plan_version_id: string
          p_project_id: string
          p_request_hash: string
          p_request_payload: Json
          p_source_architecture_version_id: string
          p_summary: string
          p_turn_id: string
        }
        Returns: Json
      }
      complete_planning_handoff: {
        Args: {
          p_claim_token: string
          p_content: Json
          p_content_hash: string
          p_job_id: string
          p_project_id: string
          p_rendered_markdown?: string | null
          p_version_request_hash: string
        }
        Returns: Json
      }
      complete_scope_architecture_handoff: {
        Args: {
          p_architecture_content: Json
          p_architecture_content_hash: string
          p_claim_token: string
          p_command_request_hash: string
          p_job_id: string
          p_operations: Json
          p_project_id: string
        }
        Returns: Json
      }
      fail_planning_handoff: {
        Args: {
          p_claim_token: string
          p_error_code: string
          p_job_id: string
          p_project_id: string
        }
        Returns: Database['public']['Tables']['planning_handoff_jobs']['Row']
      }
      fail_scope_architecture_handoff: {
        Args: {
          p_claim_token: string
          p_error_code: string
          p_job_id: string
          p_project_id: string
        }
        Returns: Database['public']['Tables']['scope_architecture_handoff_jobs']['Row']
      }
      allocate_planning_artifact_version: {
        Args: {
          p_artifact_id: string
          p_content: Json
          p_content_hash: string
          p_request_hash: string
          p_request_key: string
          p_source_version_id?: string | null
          p_secondary_source_version_id?: string | null
        }
        Returns: Database['public']['Tables']['planning_artifact_versions']['Row']
      }
      initialize_architecture_planning_state: {
        Args: { p_project_id: string }
        Returns: Database['public']['Tables']['planning_states']['Row']
      }
      lock_planning_state: {
        Args: { p_project_id: string }
        Returns: Database['public']['Tables']['planning_states']['Row']
      }
      persist_architecture_readiness_report: {
        Args: {
          p_architecture_version_id: string
          p_evaluated_revision: number
          p_project_id: string
          p_report: Json
        }
        Returns: Database['public']['Tables']['planning_readiness_reports']['Row']
      }
      set_planning_auto_decide: {
        Args: {
          p_enabled: boolean
          p_expected_revision: number
          p_project_id: string
        }
        Returns: Database['public']['Tables']['planning_states']['Row']
      }
      undo_latest_architecture_change_set: {
        Args: {
          p_project_id: string
          p_request_hash: string
          p_target_change_set_id: string
          p_undo_change_set_id: string
        }
        Returns: Json
      }
      undo_latest_work_plan_change_set: {
        Args: {
          p_project_id: string
          p_request_hash: string
          p_target_change_set_id: string
          p_undo_change_set_id: string
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
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
