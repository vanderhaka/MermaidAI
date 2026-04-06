// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @supabase/ssr
const mockCreateServerClient = vi.fn().mockReturnValue({ from: vi.fn() })
vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

// Mock config
vi.mock('@/lib/config', () => ({
  getConfig: vi.fn(() => ({
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-role-key',
    siteUrl: 'http://localhost:3000',
  })),
}))

// Mock next/server
const mockNextResponseNext = vi.fn()
vi.mock('next/server', () => {
  class MockNextRequest {
    url: string
    cookies: { getAll: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }
    constructor(url: string) {
      this.url = url
      this.cookies = {
        getAll: vi.fn().mockReturnValue([]),
        set: vi.fn(),
      }
    }
  }

  class MockNextResponse {
    static next = mockNextResponseNext
  }
  mockNextResponseNext.mockReturnValue({
    cookies: {
      set: vi.fn(),
    },
  })

  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
  }
})

describe('createSupabaseMiddlewareClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNextResponseNext.mockReturnValue({
      cookies: {
        set: vi.fn(),
      },
    })
  })

  it('returns an object with supabase client and response', async () => {
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost:3000/')

    const { createSupabaseMiddlewareClient } = await import('@/lib/supabase/middleware')
    const result = createSupabaseMiddlewareClient(request)

    expect(result).toHaveProperty('supabase')
    expect(result).toHaveProperty('response')
  })

  it('calls createServerClient with correct URL and anon key', async () => {
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost:3000/')

    const { createSupabaseMiddlewareClient } = await import('@/lib/supabase/middleware')
    createSupabaseMiddlewareClient(request)

    expect(mockCreateServerClient).toHaveBeenCalledOnce()
    const [url, key] = mockCreateServerClient.mock.calls[0]
    expect(url).toBe('https://test.supabase.co')
    expect(key).toBe('test-anon-key')
  })

  it('passes cookie handlers in the options object', async () => {
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost:3000/')

    const { createSupabaseMiddlewareClient } = await import('@/lib/supabase/middleware')
    createSupabaseMiddlewareClient(request)

    const options = mockCreateServerClient.mock.calls[0][2]
    expect(options).toBeDefined()
    expect(options.cookies).toBeDefined()
    expect(typeof options.cookies.getAll).toBe('function')
    expect(typeof options.cookies.setAll).toBe('function')
  })

  it('cookie getAll reads from request cookies', async () => {
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost:3000/')
    const testCookies = [{ name: 'sb-token', value: 'abc123' }]
    request.cookies.getAll = vi.fn().mockReturnValue(testCookies)

    const { createSupabaseMiddlewareClient } = await import('@/lib/supabase/middleware')
    createSupabaseMiddlewareClient(request)

    const options = mockCreateServerClient.mock.calls[0][2]
    const result = options.cookies.getAll()
    expect(result).toEqual(testCookies)
  })

  it('cookie setAll writes to both request and response', async () => {
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost:3000/')
    const mockRequestCookieSet = vi.fn()
    request.cookies.set = mockRequestCookieSet

    const mockResponseCookieSet = vi.fn()
    mockNextResponseNext.mockReturnValue({
      cookies: { set: mockResponseCookieSet },
    })

    const { createSupabaseMiddlewareClient } = await import('@/lib/supabase/middleware')
    createSupabaseMiddlewareClient(request)

    const options = mockCreateServerClient.mock.calls[0][2]
    const cookiesToSet = [
      { name: 'sb-token', value: 'abc123', options: { path: '/' } },
      { name: 'sb-refresh', value: 'def456', options: { path: '/' } },
    ]

    options.cookies.setAll(cookiesToSet)

    // Writes to request cookies
    expect(mockRequestCookieSet).toHaveBeenCalledTimes(2)
    expect(mockRequestCookieSet).toHaveBeenCalledWith('sb-token', 'abc123')
    expect(mockRequestCookieSet).toHaveBeenCalledWith('sb-refresh', 'def456')

    // Writes to response cookies
    expect(mockResponseCookieSet).toHaveBeenCalledTimes(2)
    expect(mockResponseCookieSet).toHaveBeenCalledWith('sb-token', 'abc123', {
      path: '/',
    })
    expect(mockResponseCookieSet).toHaveBeenCalledWith('sb-refresh', 'def456', { path: '/' })
  })

  it('creates response via NextResponse.next()', async () => {
    const { NextRequest } = await import('next/server')
    const request = new NextRequest('http://localhost:3000/')

    const { createSupabaseMiddlewareClient } = await import('@/lib/supabase/middleware')
    createSupabaseMiddlewareClient(request)

    expect(mockNextResponseNext).toHaveBeenCalledOnce()
  })
})
