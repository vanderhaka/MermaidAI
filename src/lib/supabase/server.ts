import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { getConfig } from '@/lib/config'
import type { Database } from '@/types/database'

let _client: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createClient() {
  if (!_client) {
    const config = getConfig()
    _client = createSupabaseClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey)
  }
  return _client
}
