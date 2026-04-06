// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only (it throws at import time in non-server contexts)
vi.mock('server-only', () => ({}))

// Mock next/headers — cookies() returns a Promise in Next.js 16
const mockGetAll = vi.fn().mockReturnValue([])
const mockSet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      getAll: mockGetAll,
      set: mockSet,
    }),
  ),
}))

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

describe('createClient (server)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls createServerClient with the correct URL and anon key', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    await createClient()

    expect(mockCreateServerClient).toHaveBeenCalledOnce()
    const [url, key] = mockCreateServerClient.mock.calls[0]
    expect(url).toBe('https://test.supabase.co')
    expect(key).toBe('test-anon-key')
  })

  it('passes cookie handlers in the options object', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    await createClient()

    const options = mockCreateServerClient.mock.calls[0][2]
    expect(options).toBeDefined()
    expect(options.cookies).toBeDefined()
    expect(typeof options.cookies.getAll).toBe('function')
    expect(typeof options.cookies.setAll).toBe('function')
  })

  it('cookie getAll delegates to cookies().getAll', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    await createClient()

    const options = mockCreateServerClient.mock.calls[0][2]
    const testCookies = [{ name: 'sb-token', value: 'abc123' }]
    mockGetAll.mockReturnValueOnce(testCookies)

    const result = options.cookies.getAll()
    expect(result).toEqual(testCookies)
  })

  it('cookie setAll delegates to cookies().set for each cookie', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    await createClient()

    const options = mockCreateServerClient.mock.calls[0][2]
    const cookiesToSet = [
      { name: 'sb-token', value: 'abc123', options: { path: '/' } },
      { name: 'sb-refresh', value: 'def456', options: { path: '/' } },
    ]

    options.cookies.setAll(cookiesToSet)
    expect(mockSet).toHaveBeenCalledTimes(2)
    expect(mockSet).toHaveBeenCalledWith('sb-token', 'abc123', { path: '/' })
    expect(mockSet).toHaveBeenCalledWith('sb-refresh', 'def456', { path: '/' })
  })

  it('returns the SupabaseClient from createServerClient', async () => {
    const fakeClient = { from: vi.fn(), auth: {} }
    mockCreateServerClient.mockReturnValueOnce(fakeClient)

    const { createClient } = await import('@/lib/supabase/server')
    const client = await createClient()

    expect(client).toBe(fakeClient)
  })
})
