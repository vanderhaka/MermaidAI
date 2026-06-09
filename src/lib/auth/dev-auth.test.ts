// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getDevAuthCredentials, getUserWithDevAuth, isDevAuthSkipEnabled } from './dev-auth'

function makeSupabaseAuthMock({
  user = null,
  authError = null,
  devUser = { id: 'dev-user', email: 'dev@example.com' },
  devError = null,
}: {
  user?: unknown
  authError?: unknown
  devUser?: unknown
  devError?: unknown
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: authError }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: devUser }, error: devError }),
    },
  }
}

describe('dev auth skip', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('is disabled by default', () => {
    expect(isDevAuthSkipEnabled()).toBe(false)
    expect(getDevAuthCredentials()).toBeNull()
  })

  it('is disabled in production even when the flag is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEV_AUTH_SKIP', 'true')
    vi.stubEnv('TEST_USER_EMAIL', 'dev@example.com')
    vi.stubEnv('TEST_USER_PASSWORD', 'password123')

    expect(isDevAuthSkipEnabled()).toBe(false)
    expect(getDevAuthCredentials()).toBeNull()
  })

  it('uses explicit dev credentials before test credentials', () => {
    vi.stubEnv('DEV_AUTH_SKIP', 'true')
    vi.stubEnv('DEV_AUTH_EMAIL', ' dev@example.com ')
    vi.stubEnv('DEV_AUTH_PASSWORD', ' dev-password ')
    vi.stubEnv('TEST_USER_EMAIL', 'test@example.com')
    vi.stubEnv('TEST_USER_PASSWORD', 'test-password')

    expect(getDevAuthCredentials()).toEqual({
      email: 'dev@example.com',
      password: 'dev-password',
    })
  })

  it('falls back to test credentials', () => {
    vi.stubEnv('DEV_AUTH_SKIP', '1')
    vi.stubEnv('TEST_USER_EMAIL', 'test@example.com')
    vi.stubEnv('TEST_USER_PASSWORD', 'test-password')

    expect(getDevAuthCredentials()).toEqual({
      email: 'test@example.com',
      password: 'test-password',
    })
  })

  it('returns an existing Supabase user without dev sign-in', async () => {
    const supabase = makeSupabaseAuthMock({ user: { id: 'user-1' } })

    const result = await getUserWithDevAuth(supabase as never)

    expect(result).toEqual({
      data: { user: { id: 'user-1' } },
      error: null,
      usedDevAuth: false,
    })
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('returns unauthenticated when the flag is disabled', async () => {
    const supabase = makeSupabaseAuthMock({ user: null, authError: { message: 'missing' } })

    const result = await getUserWithDevAuth(supabase as never)

    expect(result).toEqual({
      data: { user: null },
      error: { message: 'missing' },
      usedDevAuth: false,
    })
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('signs in with configured dev credentials when no user is present', async () => {
    vi.stubEnv('DEV_AUTH_SKIP', 'true')
    vi.stubEnv('TEST_USER_EMAIL', 'test@example.com')
    vi.stubEnv('TEST_USER_PASSWORD', 'test-password')
    const supabase = makeSupabaseAuthMock({ user: null, devUser: { id: 'dev-user' } })

    const result = await getUserWithDevAuth(supabase as never)

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'test-password',
    })
    expect(result).toEqual({
      data: { user: { id: 'dev-user' } },
      error: null,
      usedDevAuth: true,
    })
  })
})
