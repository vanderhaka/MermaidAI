// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSelect, mockEq, mockSingle, mockUpsert } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockSingle: vi.fn(),
  mockUpsert: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    }),
  }),
}))

import { getOrCreateProfile } from '@/lib/services/profile-service'

beforeEach(() => {
  vi.clearAllMocks()
  mockSelect.mockReturnValue({ eq: mockEq })
  mockEq.mockReturnValue({ single: mockSingle })
  mockUpsert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) })
})

const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

const fakeProfile = {
  id: userId,
  display_name: null,
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('getOrCreateProfile', () => {
  it('returns existing profile when found', async () => {
    mockSingle.mockResolvedValue({ data: fakeProfile, error: null })

    const result = await getOrCreateProfile(userId)

    expect(result).toEqual({ success: true, data: fakeProfile })
  })

  it('queries the profiles table with the user id', async () => {
    mockSingle.mockResolvedValue({ data: fakeProfile, error: null })

    await getOrCreateProfile(userId)

    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockEq).toHaveBeenCalledWith('id', userId)
  })

  it('upserts a profile when none exists', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })

    const upsertSingle = vi.fn().mockResolvedValue({ data: fakeProfile, error: null })
    const upsertSelect = vi.fn().mockReturnValue({ single: upsertSingle })
    mockUpsert.mockReturnValue({ select: upsertSelect })

    const result = await getOrCreateProfile(userId)

    expect(mockUpsert).toHaveBeenCalledWith({ id: userId }, { onConflict: 'id' })
    expect(result).toEqual({ success: true, data: fakeProfile })
  })

  it('returns error on select failure (non-PGRST116)', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })

    const result = await getOrCreateProfile(userId)

    expect(result).toEqual({
      success: false,
      error: 'relation does not exist',
    })
  })

  it('returns error when upsert fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })

    const upsertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'unique violation' },
    })
    const upsertSelect = vi.fn().mockReturnValue({ single: upsertSingle })
    mockUpsert.mockReturnValue({ select: upsertSelect })

    const result = await getOrCreateProfile(userId)

    expect(result).toEqual({
      success: false,
      error: 'unique violation',
    })
  })
})
