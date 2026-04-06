// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getGraphForModule } from '@/lib/services/graph-service'

const mockEq = vi.fn()
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({
  select: mockSelect,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))

vi.mock('server-only', () => ({}))

describe('getGraphForModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    const result = await getGraphForModule('mod-empty')

    expect(result).toEqual({ success: true, data: { nodes: [], edges: [] } })
  })

  it('returns error when node query fails', async () => {
    mockEq.mockResolvedValueOnce({
      data: null,
      error: { message: 'Node query failed' },
    })

    const result = await getGraphForModule('mod-1')

    expect(result).toEqual({ success: false, error: 'Node query failed' })
  })

  it('returns error when edge query fails', async () => {
    mockEq.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
      data: null,
      error: { message: 'Edge query failed' },
    })

    const result = await getGraphForModule('mod-1')

    expect(result).toEqual({ success: false, error: 'Edge query failed' })
  })
})
