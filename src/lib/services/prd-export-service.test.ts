// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generatePrdFiles, generateSinglePrd } from '@/lib/services/prd-export-service'
import type { FlowEdge, FlowNode, Module, OpenQuestion } from '@/types/graph'

const timestamp = '2026-06-08T00:00:00.000Z'

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'checkout-module',
    project_id: 'project-1',
    domain: 'Commerce',
    name: 'Checkout',
    description: 'Checkout description.',
    prd_content: '',
    position: { x: 0, y: 0 },
    color: '#2563eb',
    entry_points: ['checkout_entry'],
    exit_points: ['order_confirmed'],
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'node-1',
    module_id: 'checkout-module',
    node_type: 'process',
    label: 'Charge card',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '#22c55e',
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

function makeEdge(overrides: Partial<FlowEdge> = {}): FlowEdge {
  return {
    id: 'edge-1',
    module_id: 'checkout-module',
    source_node_id: 'start',
    target_node_id: 'node-1',
    label: null,
    condition: null,
    created_at: timestamp,
    ...overrides,
  }
}

const AUTHORED = '## Business rules\n\nGuest checkout is supported.'

const NODES = [
  makeNode({ id: 'start', node_type: 'start', label: 'Start' }),
  makeNode({ id: 'node-1', label: 'Charge card' }),
  makeNode({ id: 'node-2', label: 'Send receipt' }),
]

const EDGES = [
  makeEdge(),
  makeEdge({ id: 'edge-2', source_node_id: 'node-1', target_node_id: 'node-2' }),
]

describe('generateSinglePrd — authored content composes with the graph render', () => {
  it('keeps the flow, interface and authored prose in one document', () => {
    const markdown = generateSinglePrd({
      projectName: 'Acme Store',
      projectDescription: null,
      modules: [makeModule({ prd_content: AUTHORED })],
      nodes: NODES,
      edges: EDGES,
      connections: [],
      openQuestions: [],
    })

    // Authored prose survives
    expect(markdown).toContain('## Requirements')
    expect(markdown).toContain('Guest checkout is supported.')

    // ...and so does everything the graph contributed
    expect(markdown).toContain('## Interface')
    expect(markdown).toContain('Charge card')
    expect(markdown).toContain('Send receipt')
    expect(markdown).toContain('## Flow')
  })

  it('renders the graph unchanged when there is no authored content', () => {
    const markdown = generateSinglePrd({
      projectName: 'Acme Store',
      projectDescription: null,
      modules: [makeModule()],
      nodes: NODES,
      edges: EDGES,
      connections: [],
      openQuestions: [],
    })

    expect(markdown).not.toContain('## Requirements')
    expect(markdown).toContain('## Interface')
    expect(markdown).toContain('Charge card')
  })

  it('keeps authored prose for every module in a multi-module export', () => {
    const modules = [
      makeModule({ prd_content: AUTHORED }),
      makeModule({
        id: 'fulfilment-module',
        name: 'Fulfilment',
        prd_content: '## Business rules\n\nOrders ship within 2 days.',
        entry_points: [],
        exit_points: [],
      }),
    ]

    const markdown = generateSinglePrd({
      projectName: 'Acme Store',
      projectDescription: null,
      modules,
      nodes: NODES,
      edges: EDGES,
      connections: [],
      openQuestions: [],
    })

    expect(markdown).toContain('Guest checkout is supported.')
    expect(markdown).toContain('Orders ship within 2 days.')
    expect(markdown).toContain('Charge card')
    // Multi-module separator behaviour preserved
    expect(markdown).toContain('---')
  })
})

describe('generatePrdFiles', () => {
  it('writes authored prose and flow into each module file', () => {
    const files = generatePrdFiles({
      projectName: 'Acme Store',
      projectDescription: null,
      modules: [makeModule({ prd_content: AUTHORED })],
      nodes: NODES,
      edges: EDGES,
      connections: [],
      openQuestions: [] as OpenQuestion[],
    })

    const moduleFile = files.find((f) => f.filename === 'modules/checkout.md')
    expect(moduleFile).toBeDefined()
    expect(moduleFile!.content).toContain('Guest checkout is supported.')
    expect(moduleFile!.content).toContain('Charge card')
    expect(moduleFile!.content).toContain('## Interface')
  })
})
