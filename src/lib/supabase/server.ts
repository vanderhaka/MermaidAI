import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { getConfig } from '@/lib/config'
import type { Database } from '@/types/database'

export async function createClient() {
  const config = getConfig()
  const cookieStore = await cookies()

  return createServerClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      },
    },
  })
}
