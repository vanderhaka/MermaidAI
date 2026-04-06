// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))

// Mock Supabase server client
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()

const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  delete: mockDelete,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mockFrom,
  }),
}))

const validInput = {
  project_id: '550e8400-e29b-41d4-a716-446655440000',
  source_module_id: '660e8400-e29b-41d4-a716-446655440001',
  target_module_id: '770e8400-e29b-41d4-a716-446655440002',
  source_exit_point: 'output',
  target_entry_point: 'input',
}

const dbRow = {
  id: 'conn-1',
  project_id: '550e8400-e29b-41d4-a716-446655440000',
  source_module_id: '660e8400-e29b-41d4-a716-446655440001',
  target_module_id: '770e8400-e29b-41d4-a716-446655440002',
  source_exit_point: 'output',
  target_entry_point: 'input',
  created_at: '2026-01-01T00:00:00Z',
}

describe('connectModules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ insert: mockInsert })
    mockInsert.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ single: mockSingle })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns the created connection on success', async () => {
    mockSingle.mockResolvedValue({ data: dbRow, error: null })

    const { connectModules } = await import('@/lib/services/module-connection-service')
    const result = await connectModules(validInput)

    expect(result).toEqual({
      success: true,
      data: dbRow,
    })

    expect(mockFrom).toHaveBeenCalledWith('module_connections')
    expect(mockInsert).toHaveBeenCalledWith({
      project_id: validInput.project_id,
      source_module_id: validInput.source_module_id,
      target_module_id: validInput.target_module_id,
      source_exit_point: validInput.source_exit_point,
      target_entry_point: validInput.target_entry_point,
    })
  })

  it('returns validation error for self-connection', async () => {
    const { connectModules } = await import('@/lib/services/module-connection-service')
    const result = await connectModules({
      ...validInput,
      target_module_id: validInput.source_module_id,
    })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('Validation failed'),
    })

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns validation error for invalid UUID', async () => {
    const { connectModules } = await import('@/lib/services/module-connection-service')
    const result = await connectModules({
      ...validInput,
      project_id: 'not-a-uuid',
    })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('Validation failed'),
    })

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns validation error for empty exit point', async () => {
    const { connectModules } = await import('@/lib/services/module-connection-service')
    const result = await connectModules({
      ...validInput,
      source_exit_point: '',
    })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('Validation failed'),
    })

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns error when database insert fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Foreign key violation' },
    })

    const { connectModules } = await import('@/lib/services/module-connection-service')
    const result = await connectModules(validInput)

    expect(result).toEqual({
      success: false,
      error: 'Foreign key violation',
    })
  })
})

describe('disconnectModules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ delete: mockDelete })
    mockDelete.mockReturnValue({ eq: mockEq })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns success when connection is removed', async () => {
    mockEq.mockResolvedValue({ error: null })

    const { disconnectModules } = await import('@/lib/services/module-connection-service')
    const result = await disconnectModules('conn-1')

    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('module_connections')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith('id', 'conn-1')
  })

  it('returns error when database delete fails', async () => {
    mockEq.mockResolvedValue({ error: { message: 'Row not found' } })

    const { disconnectModules } = await import('@/lib/services/module-connection-service')
    const result = await disconnectModules('conn-1')

    expect(result).toEqual({
      success: false,
      error: 'Row not found',
    })
  })
})
