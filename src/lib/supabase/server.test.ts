// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const mockCreateClient = vi.fn().mockReturnValue({ from: vi.fn() })
vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

vi.mock('@/lib/config', () => ({
  getConfig: vi.fn(() => ({
    supabaseUrl: 'https://test.supabase.co',
    supabaseServiceRoleKey: 'test-service-role-key',
    siteUrl: 'http://localhost:3000',
  })),
}))

describe('createClient (server)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('creates a Supabase client with service role key', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    createClient()

    expect(mockCreateClient).toHaveBeenCalledOnce()
    const [url, key] = mockCreateClient.mock.calls[0]
    expect(url).toBe('https://test.supabase.co')
    expect(key).toBe('test-service-role-key')
  })

  it('returns a singleton client', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const client1 = createClient()
    const client2 = createClient()

    expect(client1).toBe(client2)
    expect(mockCreateClient).toHaveBeenCalledOnce()
  })
})
