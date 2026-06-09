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
    node_id: 'decision',
    section: 'Payment',
    question: 'What happens when payment fails?',
    status: 'open',
    resolution: null,
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
