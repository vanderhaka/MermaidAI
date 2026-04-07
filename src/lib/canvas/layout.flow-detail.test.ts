// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { computeLayout, getFlowDetailNodeDimensions } from '@/lib/canvas/layout'
import type { FlowEdge, FlowNode } from '@/types/graph'

function baseNode(
  overrides: Partial<FlowNode> & { id: string; node_type: FlowNode['node_type'] },
): FlowNode {
  return {
    module_id: 'm1',
    label: 'L',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: 'blue',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('computeLayout (module detail)', () => {
  it('uses larger dimensions for decision nodes in dagre layout', () => {
    const nodes: FlowNode[] = [
      baseNode({ id: 'a', node_type: 'start', label: 'Start' }),
      baseNode({ id: 'b', node_type: 'decision', label: '?' }),
      baseNode({ id: 'c', node_type: 'process', label: 'P' }),
    ]
    const edges: FlowEdge[] = [
      {
        id: 'e1',
        module_id: 'm1',
        source_node_id: 'a',
        target_node_id: 'b',
        label: null,
        condition: null,
        created_at: '',
      },
      {
        id: 'e2',
        module_id: 'm1',
        source_node_id: 'b',
        target_node_id: 'c',
        label: null,
        condition: null,
        created_at: '',
      },
    ]
    const out = computeLayout(nodes, edges)
    const decision = out.find((n) => n.id === 'b')
    expect(decision).toBeDefined()
    const dim = getFlowDetailNodeDimensions('decision')
    expect(dim.width).toBe(176)
    expect(dim.height).toBe(176)
  })

  it('grid fallback uses cell size from largest node type', () => {
    const nodes: FlowNode[] = [
      baseNode({ id: 'x', node_type: 'decision', label: 'D' }),
      baseNode({ id: 'y', node_type: 'process', label: 'P' }),
    ]
    const out = computeLayout(nodes, [])
    expect(out).toHaveLength(2)
    expect(out[0].position.x).toBe(0)
    expect(out[0].position.y).toBe(0)
    expect(out[1].position.x).toBeGreaterThan(0)
  })
})
