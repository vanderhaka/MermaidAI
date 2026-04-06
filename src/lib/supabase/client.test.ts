// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ auth: {}, from: vi.fn() })),
}))

vi.mock('@/lib/config', () => ({
  getConfig: () => ({
    supabaseUrl: 'https://abc.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiJ9.test',
  }),
}))

describe('supabase browser client', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns an object with auth and from properties', async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const client = createClient()
    expect(client).toHaveProperty('auth')
    expect(client).toHaveProperty('from')
  })

  it('returns the same instance on multiple calls (singleton)', async () => {
    const { createClient } = await import('@/lib/supabase/client')
    const first = createClient()
    const second = createClient()
    expect(first).toBe(second)
  })

  it('calls createBrowserClient with config values', async () => {
    const { createBrowserClient } = await import('@supabase/ssr')
    const { createClient } = await import('@/lib/supabase/client')
    createClient()
    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://abc.supabase.co',
      'eyJhbGciOiJIUzI1NiJ9.test',
    )
  })
})
