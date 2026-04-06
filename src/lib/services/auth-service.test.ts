// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

import { signUp, signOut } from '@/lib/services/auth-service'

const mockSignUp = vi.fn()
const mockSignOut = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  }),
}))

const mockRevalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}))

const mockRedirect = vi.fn().mockImplementation(() => {
  throw new Error('NEXT_REDIRECT')
})
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

describe('signUp', () => {
  beforeEach(() => {
    mockSignUp.mockReset()
  })

  it('returns success when Supabase creates an account', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: '123' } }, error: null })

    const result = await signUp('test@example.com', 'password123')

    expect(result).toEqual({ success: true })
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    })
  })

  it('returns error for invalid email without calling Supabase', async () => {
    const result = await signUp('not-an-email', 'password123')

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('returns error for password shorter than 8 characters', async () => {
    const result = await signUp('test@example.com', 'short')

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(mockSignUp).not.toHaveBeenCalled()
  })

  it('returns error when Supabase returns an error', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    })

    const result = await signUp('test@example.com', 'password123')

    expect(result).toEqual({ success: false, error: 'User already registered' })
  })
})

describe('signOut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({ error: null })
    mockRedirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })
  })

  it('calls supabase.auth.signOut()', async () => {
    await signOut().catch(() => {})
    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('calls revalidatePath to clear cached routes', async () => {
    await signOut().catch(() => {})
    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('calls redirect to /login', async () => {
    await signOut().catch(() => {})
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('calls signOut before revalidatePath and redirect', async () => {
    const callOrder: string[] = []
    mockSignOut.mockImplementation(async () => {
      callOrder.push('signOut')
      return { error: null }
    })
    mockRevalidatePath.mockImplementation(() => {
      callOrder.push('revalidatePath')
    })
    mockRedirect.mockImplementation(() => {
      callOrder.push('redirect')
      throw new Error('NEXT_REDIRECT')
    })

    await signOut().catch(() => {})

    expect(callOrder).toEqual(['signOut', 'revalidatePath', 'redirect'])
  })
})
