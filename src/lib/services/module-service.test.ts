// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))

// Mock Supabase server client
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  update: mockUpdate,
  select: mockSelect,
  delete: mockDelete,
}))

mockInsert.mockReturnValue({ select: mockSelect })
mockUpdate.mockReturnValue({ select: mockSelect })
mockSelect.mockReturnValue({ single: mockSingle, eq: mockEq })
mockEq.mockReturnValue({ single: mockSingle })

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

  afterEach(() => {
    vi.resetModules()
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

describe('deleteModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ delete: mockDelete })
    mockDelete.mockReturnValue({ eq: mockEq })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns success when module is deleted', async () => {
    mockEq.mockResolvedValue({ error: null })

    const { deleteModule } = await import('@/lib/services/module-service')
    const result = await deleteModule('mod-1')

    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('modules')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith('id', 'mod-1')
  })

  it('returns error when database delete fails', async () => {
    mockEq.mockResolvedValue({ error: { message: 'Row not found' } })

    const { deleteModule } = await import('@/lib/services/module-service')
    const result = await deleteModule('mod-1')

    expect(result).toEqual({ success: false, error: 'Row not found' })
  })
})

describe('listModulesByProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ order: mockOrder })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns modules filtered by project_id, ordered by created_at', async () => {
    const dbRows = [
      {
        id: 'mod-1',
        project_id: 'proj-1',
        name: 'Auth Module',
        description: null,
        position_x: 100,
        position_y: 200,
        color: '#ff0000',
        entry_points: ['input'],
        exit_points: ['output'],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'mod-2',
        project_id: 'proj-1',
        name: 'Dashboard Module',
        description: 'Main dashboard',
        position_x: 300,
        position_y: 400,
        color: '#00ff00',
        entry_points: [],
        exit_points: [],
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
    ]

    mockOrder.mockResolvedValue({ data: dbRows, error: null })

    const { listModulesByProject } = await import('@/lib/services/module-service')
    const result = await listModulesByProject('proj-1')

    expect(result).toEqual({
      success: true,
      data: [
        {
          id: 'mod-1',
          project_id: 'proj-1',
          name: 'Auth Module',
          description: null,
          position: { x: 100, y: 200 },
          color: '#ff0000',
          entry_points: ['input'],
          exit_points: ['output'],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'mod-2',
          project_id: 'proj-1',
          name: 'Dashboard Module',
          description: 'Main dashboard',
          position: { x: 300, y: 400 },
          color: '#00ff00',
          entry_points: [],
          exit_points: [],
          created_at: '2026-01-02T00:00:00Z',
          updated_at: '2026-01-02T00:00:00Z',
        },
      ],
    })

    expect(mockFrom).toHaveBeenCalledWith('modules')
    expect(mockSelect).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith('project_id', 'proj-1')
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('returns empty array when no modules exist for project', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null })

    const { listModulesByProject } = await import('@/lib/services/module-service')
    const result = await listModulesByProject('proj-empty')

    expect(result).toEqual({
      success: true,
      data: [],
    })

    expect(mockEq).toHaveBeenCalledWith('project_id', 'proj-empty')
  })

  it('returns error when database query fails', async () => {
    mockOrder.mockResolvedValue({
      data: null,
      error: { message: 'Connection refused' },
    })

    const { listModulesByProject } = await import('@/lib/services/module-service')
    const result = await listModulesByProject('proj-1')

    expect(result).toEqual({
      success: false,
      error: 'Connection refused',
    })
  })
})
