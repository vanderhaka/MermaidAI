// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as prdRenderers from '@/lib/services/prd-renderers'
import { renderModulePrd } from '@/lib/services/prd-renderers'
import type { FlowEdge, FlowNode, Module, ModuleConnection, OpenQuestion } from '@/types/graph'

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
    target_node_id: 'charge',
    label: null,
    condition: null,
    created_at: timestamp,
    ...overrides,
  }
}

function makeConnection(overrides: Partial<ModuleConnection> = {}): ModuleConnection {
  return {
    id: 'connection-1',
    project_id: 'project-1',
    source_module_id: 'catalog-module',
    target_module_id: 'checkout-module',
    source_exit_point: 'cart_ready',
    target_entry_point: 'checkout_entry',
    created_at: timestamp,
    ...overrides,
  }
}

function makeQuestion(overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    id: 'question-1',
    project_id: 'project-1',
    module_id: 'checkout-module',
    node_id: 'decision',
    section: 'Payment',
    question: 'What happens when payment fails?',
    status: 'open',
    resolution: null,
    coverage_area: null,
    created_at: timestamp,
    resolved_at: null,
    ...overrides,
  }
}

describe('prd-renderers public API', () => {
  it('keeps only the module PRD renderer exported', () => {
    expect(Object.keys(prdRenderers).sort()).toEqual(['renderModulePrd'])
  })
})

describe('renderModulePrd', () => {
  it('preserves module markdown sections, flow branches, dependencies, and questions', () => {
    const checkoutModule = makeModule()
    const catalog = makeModule({
      id: 'catalog-module',
      domain: 'Commerce',
      name: 'Catalog',
      entry_points: ['browse'],
      exit_points: ['cart_ready'],
    })
    const order = makeModule({
      id: 'order-module',
      domain: 'Operations',
      name: 'Orders',
      entry_points: ['order_confirmed'],
      exit_points: ['receipt_sent'],
    })
    const nodes = [
      makeNode({ id: 'start', node_type: 'start', label: 'Start' }),
      makeNode({
        id: 'decision',
        node_type: 'decision',
        label: 'Payment valid?',
        pseudocode: 'if payment succeeds continue',
      }),
      makeNode({ id: 'charge', node_type: 'process', label: 'Charge card' }),
      makeNode({ id: 'end', node_type: 'end', label: 'Order complete' }),
    ]
    const edges = [
      makeEdge({ id: 'start-decision', source_node_id: 'start', target_node_id: 'decision' }),
      makeEdge({
        id: 'decision-charge',
        source_node_id: 'decision',
        target_node_id: 'charge',
        condition: 'valid',
      }),
      makeEdge({
        id: 'decision-end',
        source_node_id: 'decision',
        target_node_id: 'end',
        condition: 'invalid',
      }),
      makeEdge({ id: 'charge-end', source_node_id: 'charge', target_node_id: 'end' }),
    ]
    const connections = [
      makeConnection(),
      makeConnection({
        id: 'connection-2',
        source_module_id: 'checkout-module',
        target_module_id: 'order-module',
        source_exit_point: 'order_confirmed',
        target_entry_point: 'order_confirmed',
      }),
    ]
    const questions = [
      makeQuestion(),
      makeQuestion({
        id: 'question-2',
        status: 'resolved',
        question: 'Which receipt fields are required?',
        resolution: 'Include order ID, total, payment status, and receipt URL.',
        resolved_at: timestamp,
      }),
    ]

    const markdown = renderModulePrd(checkoutModule, nodes, edges, connections, questions, [
      catalog,
      checkoutModule,
      order,
    ])

    expect(markdown).toContain('# Checkout')
    expect(markdown).toContain('> **Domain**: Commerce')
    expect(markdown).toContain('Checkout description.')
    expect(markdown).toContain('## Interface')
    expect(markdown).toContain('**In:** checkout_entry')
    expect(markdown).toContain('**Out:** order_confirmed')
    expect(markdown).toContain('## Dependencies')
    expect(markdown).toContain('- \u2190 Catalog (cart_ready \u2192 checkout_entry)')
    expect(markdown).toContain('- \u2192 Orders (order_confirmed \u2192 order_confirmed)')
    expect(markdown).toContain('## Flow')
    expect(markdown).toContain('1. **Payment valid?** *(decision)*')
    expect(markdown).toContain('   > if payment succeeds continue')
    expect(markdown).toContain('   - **valid** \u2192 Charge card')
    expect(markdown).toContain('   - **invalid** \u2192 Order complete')
    expect(markdown).toContain('2. **Charge card**')
    expect(markdown).toContain('## Questions')
    expect(markdown).toContain('- [ ] **Payment** \u2014 What happens when payment fails?')
    expect(markdown).toContain('- [x] **Payment** \u2014 Which receipt fields are required?')
    expect(markdown).toContain('  - Include order ID, total, payment status, and receipt URL.')
  })

  it('can render without the module header for combined PRD exports', () => {
    const markdown = renderModulePrd(makeModule(), [makeNode()], [], [], [], [makeModule()], {
      skipHeader: true,
    })

    expect(markdown).not.toContain('# Checkout')
    expect(markdown).toContain('## Interface')
    expect(markdown).toContain('## Flow')
  })
})

describe('resolved questions survive into the PRD', () => {
  it('renders the Resolved section for a question whose marker node is gone', () => {
    // After resolve, node_id is SET NULL and the marker is deleted. The record must
    // still reach the document via module_id — this branch was unreachable before.
    const markdown = renderModulePrd(
      makeModule(),
      [makeNode({ id: 'charge', label: 'Charge card' })],
      [],
      [],
      [
        makeQuestion({
          id: 'question-resolved',
          node_id: null,
          module_id: 'checkout-module',
          status: 'resolved',
          question: 'Do we retry a declined card?',
          resolution: 'Retry once, then show the decline message.',
        }),
      ],
      [makeModule()],
    )

    expect(markdown).toContain('### Resolved')
    expect(markdown).toContain('- [x] **Payment** — Do we retry a declined card?')
    expect(markdown).toContain('  - Retry once, then show the decline message.')
  })

  it('excludes questions belonging to a different module', () => {
    const markdown = renderModulePrd(
      makeModule(),
      [makeNode({ id: 'charge', label: 'Charge card' })],
      [],
      [],
      [
        makeQuestion({
          id: 'question-other',
          node_id: null,
          module_id: 'fulfilment-module',
          question: 'Which courier do we use?',
        }),
      ],
      [makeModule()],
    )

    expect(markdown).not.toContain('Which courier do we use?')
  })
})

describe('question markers never appear as flow steps', () => {
  const nodes = [
    makeNode({ id: 'start', node_type: 'start', label: 'Start' }),
    makeNode({ id: 'decision', node_type: 'decision', label: 'Payment authorised?' }),
    makeNode({ id: 'confirm', label: 'Show order confirmation' }),
    makeNode({ id: 'decline', label: 'Show decline message' }),
    makeNode({
      id: 'q-node',
      node_type: 'question',
      label: 'Do we retry a declined card automatically?',
    }),
  ]
  const edges = [
    makeEdge({ id: 'e0', source_node_id: 'start', target_node_id: 'decision' }),
    makeEdge({ id: 'e1', source_node_id: 'decision', target_node_id: 'confirm', condition: 'Yes' }),
    makeEdge({ id: 'e2', source_node_id: 'decision', target_node_id: 'decline', condition: 'No' }),
    // The edge add_open_questions creates: no condition, no label.
    makeEdge({ id: 'e3', source_node_id: 'decision', target_node_id: 'q-node' }),
  ]
  const questions = [
    makeQuestion({
      id: 'q-1',
      node_id: 'q-node',
      question: 'Do we retry a declined card automatically?',
    }),
  ]

  function render() {
    return renderModulePrd(makeModule(), nodes, edges, [], questions, [makeModule()])
  }

  it('does not render the question as a numbered step', () => {
    const markdown = render()
    const flow = markdown.slice(markdown.indexOf('## Flow'), markdown.indexOf('## Questions'))

    expect(flow).not.toMatch(/\d+\. \*\*Do we retry a declined card automatically\?\*\*/)
    expect(flow).not.toContain('Do we retry a declined card automatically?')
  })

  it('does not render the question as a decision branch', () => {
    const flow = render()
    const flowSection = flow.slice(flow.indexOf('## Flow'), flow.indexOf('## Questions'))

    expect(flowSection).not.toContain('Default')
    expect(flowSection).not.toContain('Otherwise')
  })

  it('still lists the question under Questions', () => {
    const markdown = render()
    const questionsSection = markdown.slice(markdown.indexOf('## Questions'))

    expect(questionsSection).toContain('Do we retry a declined card automatically?')
  })

  it('keeps the real decision branches intact', () => {
    const markdown = render()

    expect(markdown).toContain('- **Yes** → Show order confirmation')
    expect(markdown).toContain('- **No** → Show decline message')
  })

  it('labels a genuinely unlabelled branch "Otherwise", not "Default"', () => {
    const markdown = renderModulePrd(
      makeModule(),
      [
        makeNode({ id: 'start', node_type: 'start', label: 'Start' }),
        makeNode({ id: 'decision', node_type: 'decision', label: 'Retry?' }),
        makeNode({ id: 'done', label: 'Done' }),
      ],
      [
        makeEdge({ id: 'a', source_node_id: 'start', target_node_id: 'decision' }),
        makeEdge({ id: 'b', source_node_id: 'decision', target_node_id: 'done' }),
      ],
      [],
      [],
      [makeModule()],
    )

    expect(markdown).toContain('- **Otherwise** → Done')
    expect(markdown).not.toContain('**Default**')
  })
})
