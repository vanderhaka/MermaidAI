import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import { getConfig } from '@/lib/config'

export function createSupabaseMiddlewareClient(request: NextRequest) {
  const { supabaseUrl, supabaseAnonKey } = getConfig()

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  return { supabase, response }
}
