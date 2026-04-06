// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('clerk config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('defaults to the app auth routes', async () => {
    const { clerkPostAuthUrl, clerkSignInUrl, clerkSignUpUrl } = await import('@/lib/clerk')

    expect(clerkSignInUrl).toBe('/sign-in')
    expect(clerkSignUpUrl).toBe('/sign-up')
    expect(clerkPostAuthUrl).toBe('/dashboard')
  })

  it('uses trimmed public Clerk route overrides when present', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_SIGN_IN_URL', '  /custom-sign-in  ')
    vi.stubEnv('NEXT_PUBLIC_CLERK_SIGN_UP_URL', '  /custom-sign-up  ')

    const { clerkSignInUrl, clerkSignUpUrl } = await import('@/lib/clerk')

    expect(clerkSignInUrl).toBe('/custom-sign-in')
    expect(clerkSignUpUrl).toBe('/custom-sign-up')
  })
})
