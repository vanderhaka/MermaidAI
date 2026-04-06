// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createProject } from '@/lib/services/project-service'

const mockSingle = vi.fn()
const mockSelect = vi.fn(() => ({ single: mockSingle }))
const mockInsert = vi.fn(() => ({ select: mockSelect }))
const mockFrom = vi.fn(() => ({ insert: mockInsert }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))

describe('createProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success with inserted project for valid input', async () => {
    const project = {
      id: 'proj-1',
      user_id: 'user-1',
      name: 'Test Project',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: project, error: null })

    const result = await createProject({ name: 'Test Project' })

    expect(result).toEqual({ success: true, data: project })
    expect(mockFrom).toHaveBeenCalledWith('projects')
    expect(mockInsert).toHaveBeenCalledWith({ name: 'Test Project' })
    expect(mockSelect).toHaveBeenCalled()
    expect(mockSingle).toHaveBeenCalled()
  })

  it('handles optional description', async () => {
    const project = {
      id: 'proj-2',
      user_id: 'user-1',
      name: 'With Desc',
      description: 'A description',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: project, error: null })

    const result = await createProject({
      name: 'With Desc',
      description: 'A description',
    })

    expect(result).toEqual({ success: true, data: project })
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'With Desc',
      description: 'A description',
    })
  })

  it('returns failure when input validation fails', async () => {
    const result = await createProject({ name: '' })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('>=1 characters'),
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns failure when supabase insert fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    })

    const result = await createProject({ name: 'Failing Project' })

    expect(result).toEqual({ success: false, error: 'Database error' })
  })
})
