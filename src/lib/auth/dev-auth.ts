import type { SupabaseClient, User } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])

type DevAuthCredentials = {
  email: string
  password: string
}

type AuthResult = {
  data: { user: User | null }
  error: unknown
  usedDevAuth: boolean
}

export function isDevAuthSkipEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.DEV_AUTH_SKIP?.trim().toLowerCase()
  return env.NODE_ENV !== 'production' && Boolean(value && ENABLED_VALUES.has(value))
}

export function getDevAuthCredentials(
  env: NodeJS.ProcessEnv = process.env,
): DevAuthCredentials | null {
  if (!isDevAuthSkipEnabled(env)) return null

  const email = (env.DEV_AUTH_EMAIL ?? env.TEST_USER_EMAIL)?.trim()
  const password = (env.DEV_AUTH_PASSWORD ?? env.TEST_USER_PASSWORD)?.trim()

  if (!email || !password) return null

  return { email, password }
}

export async function getUserWithDevAuth(supabase: SupabaseClient<Database>): Promise<AuthResult> {
  const authResult = await supabase.auth.getUser()
  if (authResult.data.user) {
    return { ...authResult, usedDevAuth: false }
  }

  const credentials = getDevAuthCredentials()
  if (!credentials) {
    return { ...authResult, usedDevAuth: false }
  }

  const devSignInResult = await supabase.auth.signInWithPassword(credentials)

  return {
    data: { user: devSignInResult.data.user ?? null },
    error: devSignInResult.error ?? authResult.error,
    usedDevAuth: true,
  }
}
