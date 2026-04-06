// This file is a placeholder. It will be replaced by `supabase gen types typescript`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      modules: {
        Row: {
          id: string
          project_id: string
          name: string
          description: string | null
          position_x: number
          position_y: number
          color: string | null
          entry_points: string[]
          exit_points: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          description?: string | null
          position_x?: number
          position_y?: number
          color?: string | null
          entry_points?: string[]
          exit_points?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          description?: string | null
          position_x?: number
          position_y?: number
          color?: string | null
          entry_points?: string[]
          exit_points?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      flow_nodes: {
        Row: {
          id: string
          module_id: string
          node_type: string
          label: string
          pseudocode: string | null
          position_x: number
          position_y: number
          color: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          module_id: string
          node_type: string
          label: string
          pseudocode?: string | null
          position_x?: number
          position_y?: number
          color?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          module_id?: string
          node_type?: string
          label?: string
          pseudocode?: string | null
          position_x?: number
          position_y?: number
          color?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      flow_edges: {
        Row: {
          id: string
          module_id: string
          source_node_id: string
          target_node_id: string
          label: string | null
          condition: string | null
          created_at: string
        }
        Insert: {
          id?: string
          module_id: string
          source_node_id: string
          target_node_id: string
          label?: string | null
          condition?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          module_id?: string
          source_node_id?: string
          target_node_id?: string
          label?: string | null
          condition?: string | null
          created_at?: string
        }
      }
      module_connections: {
        Row: {
          id: string
          project_id: string
          source_module_id: string
          target_module_id: string
          source_exit_point: string
          target_entry_point: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          source_module_id: string
          target_module_id: string
          source_exit_point: string
          target_entry_point: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          source_module_id?: string
          target_module_id?: string
          source_exit_point?: string
          target_entry_point?: string
          created_at?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          project_id: string
          role: string
          content: string
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          role: string
          content: string
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          role?: string
          content?: string
          metadata?: Json | null
          created_at?: string
        }
      }
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
