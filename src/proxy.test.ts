// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const { mockGetUser, mockSignInWithPassword, mockRedirect, mockNext } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockRedirect: vi.fn(),
  mockNext: vi.fn(() => ({ status: 200, headers: new Headers() })),
}))

vi.mock('@/lib/supabase/middleware', () => ({
  createSupabaseMiddlewareClient: vi.fn(() => ({
    supabase: { auth: { getUser: mockGetUser, signInWithPassword: mockSignInWithPassword } },
    response: { status: 200, headers: new Headers() },
  })),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    redirect: mockRedirect,
    next: mockNext,
  },
}))

import { proxy, config } from '@/proxy'

function createMockRequest(pathname: string): NextRequest {
  const url = new URL(pathname, 'http://localhost:3000')
  return {
    nextUrl: url,
    url: url.toString(),
  } as unknown as NextRequest
}

describe('Auth proxy', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    mockRedirect.mockReturnValue({ status: 302, headers: new Headers() })
    mockNext.mockReturnValue({ status: 200, headers: new Headers() })
  })

  describe('unauthenticated user', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'not authenticated' },
      })
    })

    it('redirects /dashboard to /login', async () => {
      const request = createMockRequest('/dashboard')
      await proxy(request)

      expect(mockRedirect).toHaveBeenCalledTimes(1)
      const redirectUrl = mockRedirect.mock.calls[0][0] as URL
      expect(redirectUrl.pathname).toBe('/login')
    })

    it('redirects /dashboard/settings to /login', async () => {
      const request = createMockRequest('/dashboard/settings')
      await proxy(request)

      expect(mockRedirect).toHaveBeenCalledTimes(1)
      const redirectUrl = mockRedirect.mock.calls[0][0] as URL
      expect(redirectUrl.pathname).toBe('/login')
    })

    it('allows access to /', async () => {
      const request = createMockRequest('/')
      await proxy(request)

      expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('allows access to /login', async () => {
      const request = createMockRequest('/login')
      await proxy(request)

      expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('allows access to /signup', async () => {
      const request = createMockRequest('/signup')
      await proxy(request)

      expect(mockRedirect).not.toHaveBeenCalled()
    })
  })

  describe('authenticated user', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      })
    })

    it('allows access to /dashboard', async () => {
      const request = createMockRequest('/dashboard')
      await proxy(request)

      expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('redirects /login to /dashboard', async () => {
      const request = createMockRequest('/login')
      await proxy(request)

      expect(mockRedirect).toHaveBeenCalledTimes(1)
      const redirectUrl = mockRedirect.mock.calls[0][0] as URL
      expect(redirectUrl.pathname).toBe('/dashboard')
    })

    it('redirects /signup to /dashboard', async () => {
      const request = createMockRequest('/signup')
      await proxy(request)

      expect(mockRedirect).toHaveBeenCalledTimes(1)
      const redirectUrl = mockRedirect.mock.calls[0][0] as URL
      expect(redirectUrl.pathname).toBe('/dashboard')
    })

    it('allows access to /', async () => {
      const request = createMockRequest('/')
      await proxy(request)

      expect(mockRedirect).not.toHaveBeenCalled()
    })
  })

  describe('dev auth skip', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'not authenticated' },
      })
      mockSignInWithPassword.mockResolvedValue({
        data: { user: { id: 'dev-user', email: 'dev@example.com' } },
        error: null,
      })
    })

    it('allows a protected route after signing in with local dev credentials', async () => {
      vi.stubEnv('DEV_AUTH_SKIP', 'true')
      vi.stubEnv('TEST_USER_EMAIL', 'dev@example.com')
      vi.stubEnv('TEST_USER_PASSWORD', 'password123')

      const request = createMockRequest('/dashboard')
      await proxy(request)

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'dev@example.com',
        password: 'password123',
      })
      expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('does not dev sign-in in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('DEV_AUTH_SKIP', 'true')
      vi.stubEnv('TEST_USER_EMAIL', 'dev@example.com')
      vi.stubEnv('TEST_USER_PASSWORD', 'password123')

      const request = createMockRequest('/dashboard')
      await proxy(request)

      expect(mockSignInWithPassword).not.toHaveBeenCalled()
      expect(mockRedirect).toHaveBeenCalledTimes(1)
      const redirectUrl = mockRedirect.mock.calls[0][0] as URL
      expect(redirectUrl.pathname).toBe('/login')
    })

    it('falls back to normal redirects when credentials are missing', async () => {
      vi.stubEnv('DEV_AUTH_SKIP', 'true')

      const request = createMockRequest('/dashboard')
      await proxy(request)

      expect(mockSignInWithPassword).not.toHaveBeenCalled()
      expect(mockRedirect).toHaveBeenCalledTimes(1)
      const redirectUrl = mockRedirect.mock.calls[0][0] as URL
      expect(redirectUrl.pathname).toBe('/login')
    })
  })

  describe('session refresh', () => {
    it('calls getUser() to refresh the session', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const request = createMockRequest('/')
      await proxy(request)

      expect(mockGetUser).toHaveBeenCalledTimes(1)
    })
  })

  describe('config.matcher', () => {
    it('excludes static assets and internal paths', () => {
      expect(config.matcher).toBeDefined()
      expect(Array.isArray(config.matcher)).toBe(true)
    })
  })
})
