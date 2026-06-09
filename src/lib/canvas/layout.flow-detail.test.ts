// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  computeFlowDetailLayout,
  computeLayout,
  getFlowDetailNodeDimensions,
} from '@/lib/canvas/layout'
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

function baseEdge(overrides: Partial<FlowEdge> & { id: string }): FlowEdge {
  return {
    module_id: 'm1',
    source_node_id: '',
    target_node_id: '',
    label: null,
    condition: null,
    created_at: '',
    ...overrides,
  }
}

function flattenPoints(edge: { sections: Array<{ startPoint: { x: number; y: number }; bendPoints?: Array<{ x: number; y: number }>; endPoint: { x: number; y: number } }> }) {
  const section = edge.sections[0]
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
}

describe('computeFlowDetailLayout stub spreading', () => {
  it('lands different-kind inputs (success vs error) at different entry spots', async () => {
    const nodes: FlowNode[] = [
      baseNode({ id: 'a', node_type: 'process', label: 'Validate' }),
      baseNode({ id: 'b', node_type: 'process', label: 'Recover' }),
      baseNode({ id: 't', node_type: 'process', label: 'Notify' }),
    ]
    const edges: FlowEdge[] = [
      baseEdge({ id: 'green', source_node_id: 'a', target_node_id: 't' }),
      baseEdge({ id: 'orange', source_node_id: 'b', target_node_id: 't', label: 'error' }),
    ]

    const layout = await computeFlowDetailLayout(nodes, edges)
    const greenEnd = flattenPoints(layout.edges.find((e) => e.id === 'green')!).at(-1)!
    const orangeEnd = flattenPoints(layout.edges.find((e) => e.id === 'orange')!).at(-1)!

    expect(greenEnd.y).toBe(orangeEnd.y)
    expect(Math.abs(greenEnd.x - orangeEnd.x)).toBeGreaterThanOrEqual(24)
  })

  it('converges same-kind inputs on a single entry spot', async () => {
    const nodes: FlowNode[] = [
      baseNode({ id: 'a', node_type: 'process', label: 'Path A' }),
      baseNode({ id: 'b', node_type: 'process', label: 'Path B' }),
      baseNode({ id: 't', node_type: 'process', label: 'Join' }),
    ]
    const edges: FlowEdge[] = [
      baseEdge({ id: 'e1', source_node_id: 'a', target_node_id: 't' }),
      baseEdge({ id: 'e2', source_node_id: 'b', target_node_id: 't' }),
    ]

    const layout = await computeFlowDetailLayout(nodes, edges)
    const end1 = flattenPoints(layout.edges.find((e) => e.id === 'e1')!).at(-1)!
    const end2 = flattenPoints(layout.edges.find((e) => e.id === 'e2')!).at(-1)!

    expect(end1).toEqual(end2)
  })

  it('spreads sibling outputs from one source port apart', async () => {
    const nodes: FlowNode[] = [
      baseNode({ id: 's', node_type: 'process', label: 'Fan out' }),
      baseNode({ id: 't1', node_type: 'process', label: 'Left' }),
      baseNode({ id: 't2', node_type: 'process', label: 'Right' }),
    ]
    const edges: FlowEdge[] = [
      baseEdge({ id: 'e1', source_node_id: 's', target_node_id: 't1' }),
      baseEdge({ id: 'e2', source_node_id: 's', target_node_id: 't2' }),
    ]

    const layout = await computeFlowDetailLayout(nodes, edges)
    const start1 = flattenPoints(layout.edges.find((e) => e.id === 'e1')!)[0]
    const start2 = flattenPoints(layout.edges.find((e) => e.id === 'e2')!)[0]

    expect(start1.y).toBe(start2.y)
    expect(Math.abs(start1.x - start2.x)).toBeGreaterThanOrEqual(24)
  })
})
