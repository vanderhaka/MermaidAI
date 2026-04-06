// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))

// Mock Supabase server client
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()
const mockFrom = vi.fn(() => ({
  insert: mockInsert,
}))

mockInsert.mockReturnValue({ select: mockSelect })
mockSelect.mockReturnValue({ single: mockSingle })

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mockFrom,
  }),
}))

describe('createModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ insert: mockInsert })
    mockInsert.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ single: mockSingle })
  })

  it('returns inserted module with position mapped from {x,y} to position_x/position_y', async () => {
    const dbRow = {
      id: 'mod-1',
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Auth Module',
      description: null,
      position_x: 100,
      position_y: 200,
      color: '#ff0000',
      entry_points: ['input'],
      exit_points: ['output'],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    mockSingle.mockResolvedValue({ data: dbRow, error: null })

    const { createModule } = await import('@/lib/services/module-service')
    const result = await createModule({
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Auth Module',
      position: { x: 100, y: 200 },
      color: '#ff0000',
      entry_points: ['input'],
      exit_points: ['output'],
    })

    expect(result).toEqual({
      success: true,
      data: {
        id: 'mod-1',
        project_id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Auth Module',
        description: null,
        position: { x: 100, y: 200 },
        color: '#ff0000',
        entry_points: ['input'],
        exit_points: ['output'],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    })

    // Verify it called from('modules')
    expect(mockFrom).toHaveBeenCalledWith('modules')

    // Verify the insert mapped position to position_x/position_y
    expect(mockInsert).toHaveBeenCalledWith({
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Auth Module',
      position_x: 100,
      position_y: 200,
      color: '#ff0000',
      entry_points: ['input'],
      exit_points: ['output'],
    })
  })

  it('returns validation error for invalid input', async () => {
    const { createModule } = await import('@/lib/services/module-service')
    const result = await createModule({
      project_id: 'not-a-uuid',
      name: '',
      position: { x: 0, y: 0 },
      color: '#000',
    })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('Validation failed'),
    })

    // Should not call Supabase
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns error when database insert fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Foreign key violation' },
    })

    const { createModule } = await import('@/lib/services/module-service')
    const result = await createModule({
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Module',
      position: { x: 0, y: 0 },
      color: '#000',
    })

    expect(result).toEqual({
      success: false,
      error: 'Foreign key violation',
    })
  })

  it('defaults entry_points and exit_points to empty arrays', async () => {
    const dbRow = {
      id: 'mod-2',
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Simple Module',
      description: null,
      position_x: 0,
      position_y: 0,
      color: '#000',
      entry_points: [],
      exit_points: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    mockSingle.mockResolvedValue({ data: dbRow, error: null })

    const { createModule } = await import('@/lib/services/module-service')
    const result = await createModule({
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Simple Module',
      position: { x: 0, y: 0 },
      color: '#000',
    })

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        entry_points: [],
        exit_points: [],
      }),
    })

    // Verify defaults were passed to insert
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_points: [],
        exit_points: [],
      }),
    )
  })
})
