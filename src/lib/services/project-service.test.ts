// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createProject, listProjectsByUser, updateProject } from '@/lib/services/project-service'

const mockSingle = vi.fn()
const mockOrder = vi.fn()
const mockSelect = vi.fn(() => ({ single: mockSingle, order: mockOrder }))
const mockInsert = vi.fn(() => ({ select: mockSelect }))
const mockEq = vi.fn(() => ({ select: mockSelect }))
const mockUpdate = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ insert: mockInsert, select: mockSelect, update: mockUpdate }))

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

describe('listProjectsByUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns projects ordered by created_at desc', async () => {
    const projects = [
      {
        id: 'proj-2',
        name: 'Newer Project',
        description: null,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      },
      {
        id: 'proj-1',
        name: 'Older Project',
        description: 'Old one',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]
    mockOrder.mockResolvedValue({ data: projects, error: null })

    const result = await listProjectsByUser()

    expect(result).toEqual({ success: true, data: projects })
    expect(mockFrom).toHaveBeenCalledWith('projects')
    expect(mockSelect).toHaveBeenCalledWith('id, name, description, created_at, updated_at')
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('returns empty array when user has no projects', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null })

    const result = await listProjectsByUser()

    expect(result).toEqual({ success: true, data: [] })
  })

  it('returns failure when supabase query fails', async () => {
    mockOrder.mockResolvedValue({
      data: null,
      error: { message: 'Query failed' },
    })

    const result = await listProjectsByUser()

    expect(result).toEqual({ success: false, error: 'Query failed' })
  })
})

describe('updateProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns updated project when name is changed', async () => {
    const updated = {
      id: 'proj-1',
      user_id: 'user-1',
      name: 'New Name',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: updated, error: null })

    const result = await updateProject('proj-1', { name: 'New Name' })

    expect(result).toEqual({ success: true, data: updated })
    expect(mockFrom).toHaveBeenCalledWith('projects')
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'New Name' })
    expect(mockEq).toHaveBeenCalledWith('id', 'proj-1')
    expect(mockSelect).toHaveBeenCalled()
    expect(mockSingle).toHaveBeenCalled()
  })

  it('returns updated project when description is changed', async () => {
    const updated = {
      id: 'proj-1',
      user_id: 'user-1',
      name: 'Original',
      description: 'Updated desc',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: updated, error: null })

    const result = await updateProject('proj-1', { description: 'Updated desc' })

    expect(result).toEqual({ success: true, data: updated })
    expect(mockUpdate).toHaveBeenCalledWith({ description: 'Updated desc' })
  })

  it('returns updated project when both name and description are changed', async () => {
    const updated = {
      id: 'proj-1',
      user_id: 'user-1',
      name: 'New Name',
      description: 'New desc',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: updated, error: null })

    const result = await updateProject('proj-1', { name: 'New Name', description: 'New desc' })

    expect(result).toEqual({ success: true, data: updated })
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'New Name', description: 'New desc' })
  })

  it('returns failure when no fields are provided', async () => {
    const result = await updateProject('proj-1', {})

    expect(result).toEqual({
      success: false,
      error: 'At least one field must be provided',
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns failure when name is empty string', async () => {
    const result = await updateProject('proj-1', { name: '' })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('>=1 characters'),
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns failure when supabase update fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Update failed' },
    })

    const result = await updateProject('proj-1', { name: 'Updated' })

    expect(result).toEqual({ success: false, error: 'Update failed' })
  })

  it('does not allow updating id, user_id, or created_at', async () => {
    const updated = {
      id: 'proj-1',
      user_id: 'user-1',
      name: 'Valid Name',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: updated, error: null })

    const result = await updateProject('proj-1', {
      name: 'Valid Name',
      id: 'hacked-id',
      user_id: 'hacked-user',
      created_at: '1999-01-01',
    } as any)

    expect(result).toEqual({ success: true, data: updated })
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Valid Name' })
  })
})
