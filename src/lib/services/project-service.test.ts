// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createProject,
  getProjectById,
  listProjectsByUser,
  updateProject,
  deleteProject,
} from '@/lib/services/project-service'

const mockSingle = vi.fn()
const mockOrder = vi.fn()
const mockDeleteEq = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle, select: mockSelect }))
const mockSelect = vi.fn(() => ({ single: mockSingle, order: mockOrder, eq: mockEq }))
const mockInsert = vi.fn(() => ({ select: mockSelect }))
const mockUpdate = vi.fn(() => ({ eq: mockEq }))
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq }))
const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-1' } },
})
const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
  delete: mockDelete,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom, auth: { getUser: mockGetUser } })),
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
      mode: 'architecture',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: project, error: null })

    const result = await createProject({ name: 'Test Project' })

    expect(result).toEqual({ success: true, data: project })
    expect(mockFrom).toHaveBeenCalledWith('projects')
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'Test Project',
      mode: 'architecture',
      user_id: 'user-1',
    })
    expect(mockSelect).toHaveBeenCalled()
    expect(mockSingle).toHaveBeenCalled()
  })

  it('handles optional description', async () => {
    const project = {
      id: 'proj-2',
      user_id: 'user-1',
      name: 'With Desc',
      description: 'A description',
      mode: 'architecture',
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
      mode: 'architecture',
      user_id: 'user-1',
    })
  })

  it('creates scope mode project when specified', async () => {
    const project = {
      id: 'proj-3',
      user_id: 'user-1',
      name: 'Client Call',
      description: null,
      mode: 'scope',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: project, error: null })

    const result = await createProject({ name: 'Client Call', mode: 'scope' })

    expect(result).toEqual({ success: true, data: project })
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'Client Call',
      mode: 'scope',
      user_id: 'user-1',
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
        mode: 'architecture',
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
      },
      {
        id: 'proj-1',
        name: 'Older Project',
        description: 'Old one',
        mode: 'scope',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]
    mockOrder.mockResolvedValue({ data: projects, error: null })

    const result = await listProjectsByUser()

    expect(result).toEqual({ success: true, data: projects })
    expect(mockFrom).toHaveBeenCalledWith('projects')
    expect(mockSelect).toHaveBeenCalledWith('id, name, description, mode, created_at, updated_at')
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
      mode: 'architecture',
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
      mode: 'architecture',
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
      mode: 'architecture',
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
      mode: 'architecture',
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

describe('getProjectById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns project for a valid ID', async () => {
    const project = {
      id: 'proj-1',
      user_id: 'user-1',
      name: 'My Project',
      description: 'A great project',
      mode: 'architecture',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: project, error: null })

    const result = await getProjectById('proj-1')

    expect(result).toEqual({ success: true, data: project })
    expect(mockFrom).toHaveBeenCalledWith('projects')
    expect(mockSelect).toHaveBeenCalledWith(
      'id, user_id, name, description, mode, created_at, updated_at',
    )
    expect(mockEq).toHaveBeenCalledWith('id', 'proj-1')
    expect(mockSingle).toHaveBeenCalled()
  })

  it('returns failure when project is not found', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: {
        message: 'JSON object requested, multiple (or no) rows returned',
        code: 'PGRST116',
      },
    })

    const result = await getProjectById('nonexistent-id')

    expect(result).toEqual({ success: false, error: expect.any(String) })
  })

  it('returns failure when supabase query fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    })

    const result = await getProjectById('proj-1')

    expect(result).toEqual({ success: false, error: 'Database error' })
  })
})

describe('deleteProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns success when project is deleted', async () => {
    mockDeleteEq.mockResolvedValue({ error: null })

    const result = await deleteProject('proj-1')

    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('projects')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'proj-1')
  })

  it('returns failure when supabase delete fails', async () => {
    mockDeleteEq.mockResolvedValue({
      error: { message: 'Delete failed' },
    })

    const result = await deleteProject('proj-1')

    expect(result).toEqual({ success: false, error: 'Delete failed' })
  })
})
