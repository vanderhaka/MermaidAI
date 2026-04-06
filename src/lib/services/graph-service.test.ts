// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockSelect = vi.fn(() => ({ eq: mockEq, single: mockSingle }))
const mockInsert = vi.fn(() => ({ select: mockSelect }))
const mockUpdate = vi.fn(() => ({ eq: mockEq }))
const mockDelete = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))

vi.mock('server-only', () => ({}))

describe('getGraphForModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ eq: mockEq })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns nodes and edges for a module', async () => {
    const nodes = [
      {
        id: 'node-1',
        module_id: 'mod-1',
        node_type: 'process',
        label: 'Step 1',
        pseudocode: '',
        position: { x: 0, y: 0 },
        color: '',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]
    const edges = [
      {
        id: 'edge-1',
        module_id: 'mod-1',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        label: null,
        condition: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]

    // First call (flow_nodes) returns nodes, second call (flow_edges) returns edges
    mockEq
      .mockResolvedValueOnce({ data: nodes, error: null })
      .mockResolvedValueOnce({ data: edges, error: null })

    const { getGraphForModule } = await import('@/lib/services/graph-service')
    const result = await getGraphForModule('mod-1')

    expect(result).toEqual({ success: true, data: { nodes, edges } })
    expect(mockFrom).toHaveBeenCalledWith('flow_nodes')
    expect(mockFrom).toHaveBeenCalledWith('flow_edges')
    expect(mockEq).toHaveBeenCalledWith('module_id', 'mod-1')
  })

  it('returns empty arrays when module has no nodes or edges', async () => {
    mockEq
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })

    const { getGraphForModule } = await import('@/lib/services/graph-service')
    const result = await getGraphForModule('mod-empty')

    expect(result).toEqual({ success: true, data: { nodes: [], edges: [] } })
  })

  it('returns error when node query fails', async () => {
    mockEq.mockResolvedValueOnce({
      data: null,
      error: { message: 'Node query failed' },
    })

    const { getGraphForModule } = await import('@/lib/services/graph-service')
    const result = await getGraphForModule('mod-1')

    expect(result).toEqual({ success: false, error: 'Node query failed' })
  })

  it('returns error when edge query fails', async () => {
    mockEq.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
      data: null,
      error: { message: 'Edge query failed' },
    })

    const { getGraphForModule } = await import('@/lib/services/graph-service')
    const result = await getGraphForModule('mod-1')

    expect(result).toEqual({ success: false, error: 'Edge query failed' })
  })
})

describe('addNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ insert: mockInsert })
    mockInsert.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ single: mockSingle })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns the inserted node on valid input', async () => {
    const dbRow = {
      id: 'node-1',
      module_id: '550e8400-e29b-41d4-a716-446655440000',
      node_type: 'process',
      label: 'Handle request',
      pseudocode: '',
      position: { x: 0, y: 0 },
      color: '#000000',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    mockSingle.mockResolvedValue({ data: dbRow, error: null })

    const { addNode } = await import('@/lib/services/graph-service')
    const result = await addNode({
      module_id: '550e8400-e29b-41d4-a716-446655440000',
      node_type: 'process',
      label: 'Handle request',
      pseudocode: '',
      position: { x: 0, y: 0 },
      color: '#000000',
    })

    expect(result).toEqual({ success: true, data: dbRow })
    expect(mockFrom).toHaveBeenCalledWith('flow_nodes')
    expect(mockInsert).toHaveBeenCalledWith({
      module_id: '550e8400-e29b-41d4-a716-446655440000',
      node_type: 'process',
      label: 'Handle request',
      pseudocode: '',
      position: { x: 0, y: 0 },
      color: '#000000',
    })
  })

  it('returns validation error for invalid input', async () => {
    const { addNode } = await import('@/lib/services/graph-service')
    const result = await addNode({
      module_id: 'not-a-uuid',
      node_type: 'invalid-type',
      label: '',
      pseudocode: '',
      position: { x: 0, y: 0 },
      color: '#000',
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

    const { addNode } = await import('@/lib/services/graph-service')
    const result = await addNode({
      module_id: '550e8400-e29b-41d4-a716-446655440000',
      node_type: 'decision',
      label: 'Check auth',
      pseudocode: '',
      position: { x: 100, y: 200 },
      color: '#ff0000',
    })

    expect(result).toEqual({
      success: false,
      error: 'Foreign key violation',
    })
  })
})

describe('updateNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ update: mockUpdate })
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ select: mockSelect })
    mockSelect.mockReturnValue({ single: mockSingle })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns the updated node when given valid id and partial data', async () => {
    const updatedRow = {
      id: 'node-1',
      module_id: '550e8400-e29b-41d4-a716-446655440000',
      node_type: 'process',
      label: 'Updated label',
      pseudocode: 'do something new',
      position: { x: 50, y: 75 },
      color: '#000000',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-04-06T00:00:00Z',
    }

    mockSingle.mockResolvedValue({ data: updatedRow, error: null })

    const { updateNode } = await import('@/lib/services/graph-service')
    const result = await updateNode('node-1', {
      label: 'Updated label',
      pseudocode: 'do something new',
    })

    expect(result).toEqual({ success: true, data: updatedRow })
    expect(mockFrom).toHaveBeenCalledWith('flow_nodes')
    expect(mockUpdate).toHaveBeenCalledWith({
      label: 'Updated label',
      pseudocode: 'do something new',
    })
    expect(mockEq).toHaveBeenCalledWith('id', 'node-1')
  })

  it('returns error when node id does not exist', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'No rows found' },
    })

    const { updateNode } = await import('@/lib/services/graph-service')
    const result = await updateNode('nonexistent-id', { label: 'New label' })

    expect(result).toEqual({
      success: false,
      error: 'No rows found',
    })
  })
})

describe('removeNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ delete: mockDelete })
    mockDelete.mockReturnValue({ eq: mockEq })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('returns success when node is deleted', async () => {
    mockEq.mockResolvedValue({ error: null })

    const { removeNode } = await import('@/lib/services/graph-service')
    const result = await removeNode('node-1')

    expect(result).toEqual({ success: true, data: null })
    expect(mockFrom).toHaveBeenCalledWith('flow_nodes')
    expect(mockEq).toHaveBeenCalledWith('id', 'node-1')
  })

  it('returns error when node id does not exist', async () => {
    mockEq.mockResolvedValue({
      error: { message: 'No rows found' },
    })

    const { removeNode } = await import('@/lib/services/graph-service')
    const result = await removeNode('nonexistent-id')

    expect(result).toEqual({
      success: false,
      error: 'No rows found',
    })
  })
})
