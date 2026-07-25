// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { renderFlowMermaid, renderFlowMermaidBlock } from '@/lib/services/prd-mermaid'
import type { FlowEdge, FlowNode } from '@/types/graph'

const timestamp = '2026-07-25T00:00:00Z'

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'node-1',
    module_id: 'module-1',
    node_type: 'process',
    label: 'Charge card',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '#2563eb',
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

function makeEdge(overrides: Partial<FlowEdge> = {}): FlowEdge {
  return {
    id: 'edge-1',
    module_id: 'module-1',
    source_node_id: 'a',
    target_node_id: 'b',
    label: null,
    condition: null,
    created_at: timestamp,
    ...overrides,
  }
}

const NODES = [
  makeNode({ id: 'start', node_type: 'start', label: 'Start' }),
  makeNode({ id: 'decision', node_type: 'decision', label: 'Payment authorised?' }),
  makeNode({ id: 'confirm', label: 'Show order confirmation' }),
  makeNode({ id: 'decline', label: 'Show decline message' }),
]

const EDGES = [
  makeEdge({ id: 'e0', source_node_id: 'start', target_node_id: 'decision' }),
  makeEdge({ id: 'e1', source_node_id: 'decision', target_node_id: 'confirm', condition: 'Yes' }),
  makeEdge({ id: 'e2', source_node_id: 'decision', target_node_id: 'decline', condition: 'No' }),
]

describe('renderFlowMermaid', () => {
  it('emits a top-down graph', () => {
    expect(renderFlowMermaid(NODES, EDGES).split('\n')[0]).toBe('graph TD')
  })

  it('renders a decision as a diamond with two labelled arrows', () => {
    const diagram = renderFlowMermaid(NODES, EDGES)

    expect(diagram).toContain('ndecision{"Payment authorised?"}')
    expect(diagram).toContain('ndecision -->|"Yes"| nconfirm')
    expect(diagram).toContain('ndecision -->|"No"| ndecline')
  })

  it('renders start/end as rounded and process as a box', () => {
    const diagram = renderFlowMermaid(NODES, EDGES)

    expect(diagram).toContain('nstart(["Start"])')
    expect(diagram).toContain('nconfirm["Show order confirmation"]')
  })

  it('renders an unlabelled edge as a plain arrow', () => {
    expect(renderFlowMermaid(NODES, EDGES)).toContain('nstart --> ndecision')
  })

  it('excludes question, screen, role and data nodes from the diagram', () => {
    const diagram = renderFlowMermaid(
      [
        ...NODES,
        makeNode({ id: 'q', node_type: 'question', label: 'Do we retry?' }),
        makeNode({ id: 's', node_type: 'screen', label: 'Checkout page' }),
        makeNode({ id: 'r', node_type: 'role', label: 'Guest' }),
        makeNode({ id: 'd', node_type: 'data', label: 'Order' }),
      ],
      [...EDGES, makeEdge({ id: 'eq', source_node_id: 'decision', target_node_id: 'q' })],
    )

    expect(diagram).not.toContain('Do we retry?')
    expect(diagram).not.toContain('Checkout page')
    expect(diagram).not.toContain('Guest')
    expect(diagram).not.toContain('Order')
  })

  it('drops edges pointing at an excluded node rather than dangling', () => {
    const diagram = renderFlowMermaid(
      [...NODES, makeNode({ id: 'q', node_type: 'question', label: 'Do we retry?' })],
      [...EDGES, makeEdge({ id: 'eq', source_node_id: 'decision', target_node_id: 'q' })],
    )

    expect(diagram).not.toContain('nq')
  })

  it('escapes quotes so a label cannot break the diagram', () => {
    const diagram = renderFlowMermaid(
      [makeNode({ id: 'n', label: 'Show "sorry" [error] {state}' })],
      [],
    )

    expect(diagram).toContain('#quot;sorry#quot;')
    expect(diagram).not.toMatch(/\["Show "sorry"/)
  })

  it('returns empty string when there is no flow to draw', () => {
    expect(renderFlowMermaid([], [])).toBe('')
    expect(renderFlowMermaid([makeNode({ node_type: 'screen' })], [])).toBe('')
  })
})

describe('renderFlowMermaidBlock', () => {
  it('wraps the diagram in a mermaid fence so it renders where markdown is read', () => {
    const block = renderFlowMermaidBlock(NODES, EDGES)

    expect(block.startsWith('```mermaid\n')).toBe(true)
    expect(block.endsWith('\n```')).toBe(true)
    expect(block).toContain('graph TD')
  })

  it('emits nothing when there is no flow', () => {
    expect(renderFlowMermaidBlock([], [])).toBe('')
  })
})
