// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('env config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('returns typed config when all vars present', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiJ9.service')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')

    const { createConfig } = await import('@/lib/config')
    const config = createConfig()

    expect(config.supabaseUrl).toBe('https://abc.supabase.co')
    expect(config.supabaseAnonKey).toBe('eyJhbGciOiJIUzI1NiJ9.test')
    expect(config.supabaseServiceRoleKey).toBe('eyJhbGciOiJIUzI1NiJ9.service')
    expect(config.siteUrl).toBe('http://localhost:3000')
  })

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiJ9.service')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')

    const { createConfig } = await import('@/lib/config')
    expect(() => createConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiJ9.service')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')

    const { createConfig } = await import('@/lib/config')
    expect(() => createConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.test')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')

    const { createConfig } = await import('@/lib/config')
    expect(() => createConfig()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('throws when NEXT_PUBLIC_SITE_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiJ9.service')

    const { createConfig } = await import('@/lib/config')
    expect(() => createConfig()).toThrow(/NEXT_PUBLIC_SITE_URL/)
  })

  it('rejects empty string for NEXT_PUBLIC_SUPABASE_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.test')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiJ9.service')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')

    const { createConfig } = await import('@/lib/config')
    expect(() => createConfig()).toThrow()
  })

  it('rejects empty string for NEXT_PUBLIC_SUPABASE_ANON_KEY', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiJ9.service')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')

    const { createConfig } = await import('@/lib/config')
    expect(() => createConfig()).toThrow()
  })

  it('trims whitespace from values', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '  https://abc.supabase.co  ')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '  eyJhbGciOiJIUzI1NiJ9.test  ')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '  eyJhbGciOiJIUzI1NiJ9.service  ')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '  http://localhost:3000  ')

    const { createConfig } = await import('@/lib/config')
    const config = createConfig()

    expect(config.supabaseUrl).toBe('https://abc.supabase.co')
    expect(config.siteUrl).toBe('http://localhost:3000')
  })
})
