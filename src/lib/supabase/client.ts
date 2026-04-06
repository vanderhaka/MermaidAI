import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getConfig } from '@/lib/config'
import type { Database } from '@/types/database'

let client: SupabaseClient<Database> | null = null

export function createClient(): SupabaseClient<Database> {
  if (!client) {
    const config = getConfig()
    client = createBrowserClient<Database>(config.supabaseUrl, config.supabaseAnonKey)
  }
  return client
}
