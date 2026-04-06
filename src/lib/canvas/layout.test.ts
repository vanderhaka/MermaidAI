// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeLayout } from './layout'
import type { FlowNode, FlowEdge } from '@/types/graph'

function makeNode(overrides: Partial<FlowNode> & { id: string }): FlowNode {
  return {
    module_id: 'mod-1',
    node_type: 'process',
    label: 'Node',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '#000',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeEdge(
  overrides: Partial<FlowEdge> & { source_node_id: string; target_node_id: string },
): FlowEdge {
  return {
    id: 'edge-1',
    module_id: 'mod-1',
    label: null,
    condition: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeLayout', () => {
  it('returns empty array for empty input', () => {
    const result = computeLayout([], [])
    expect(result).toEqual([])
  })

  it('returns valid position for a single node', () => {
    const nodes = [makeNode({ id: 'n1' })]
    const result = computeLayout(nodes, [])

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('n1')
    expect(typeof result[0].position.x).toBe('number')
    expect(typeof result[0].position.y).toBe('number')
    expect(Number.isFinite(result[0].position.x)).toBe(true)
    expect(Number.isFinite(result[0].position.y)).toBe(true)
  })

  it('positions source nodes above target nodes (top-to-bottom)', () => {
    const nodes = [makeNode({ id: 'src' }), makeNode({ id: 'tgt' })]
    const edges = [makeEdge({ source_node_id: 'src', target_node_id: 'tgt' })]
    const result = computeLayout(nodes, edges)

    const srcNode = result.find((n) => n.id === 'src')!
    const tgtNode = result.find((n) => n.id === 'tgt')!

    expect(srcNode.position.y).toBeLessThan(tgtNode.position.y)
  })

  it('does not mutate the input arrays', () => {
    const nodes = [makeNode({ id: 'n1' }), makeNode({ id: 'n2' })]
    const edges = [makeEdge({ source_node_id: 'n1', target_node_id: 'n2' })]

    const nodesCopy = JSON.parse(JSON.stringify(nodes))
    const edgesCopy = JSON.parse(JSON.stringify(edges))

    computeLayout(nodes, edges)

    expect(nodes).toEqual(nodesCopy)
    expect(edges).toEqual(edgesCopy)
  })
})
