// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeLayout, computeModuleMapLayout } from './layout'
import type { FlowNode, FlowEdge, Module, ModuleConnection } from '@/types/graph'

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

function makeModule(overrides: Partial<Module> & { id: string }): Module {
  const { id, ...rest } = overrides
  return {
    id,
    project_id: 'proj-1',
    domain: null,
    name: 'Module',
    description: 'Description',
    prd_content: '',
    position: { x: 0, y: 0 },
    color: '#000',
    entry_points: ['input'],
    exit_points: ['output'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...rest,
  }
}

function makeConnection(
  overrides: Partial<ModuleConnection> & {
    id: string
    source_module_id: string
    target_module_id: string
  },
): ModuleConnection {
  const { id, source_module_id, target_module_id, ...rest } = overrides
  return {
    id,
    project_id: 'proj-1',
    source_module_id,
    target_module_id,
    source_exit_point: 'output',
    target_entry_point: 'input',
    created_at: '2026-01-01T00:00:00Z',
    ...rest,
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

describe('computeModuleMapLayout', () => {
  it('returns empty layout for empty input', async () => {
    await expect(computeModuleMapLayout([], [])).resolves.toEqual({ nodes: [], edges: [] })
  })

  it('falls back to a grid when there are no connections', async () => {
    const result = await computeModuleMapLayout(
      [makeModule({ id: 'm1' }), makeModule({ id: 'm2' })],
      [],
    )

    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toEqual([])
    expect(result.nodes[0].position.x).toBe(0)
    expect(result.nodes[0].position.y).toBe(0)
    expect(result.nodes[1].position.x).toBeGreaterThan(result.nodes[0].position.x)
  })

  it('lays out a simple chain from top to bottom with routed sections', async () => {
    const modules = [
      makeModule({ id: 'checkout', name: 'Checkout' }),
      makeModule({ id: 'payment', name: 'Payment' }),
      makeModule({ id: 'receipt', name: 'Receipt' }),
    ]
    const connections = [
      makeConnection({
        id: 'checkout-payment',
        source_module_id: 'checkout',
        target_module_id: 'payment',
      }),
      makeConnection({
        id: 'payment-receipt',
        source_module_id: 'payment',
        target_module_id: 'receipt',
      }),
    ]

    const result = await computeModuleMapLayout(modules, connections)
    const checkout = result.nodes.find((node) => node.id === 'checkout')!
    const payment = result.nodes.find((node) => node.id === 'payment')!
    const receipt = result.nodes.find((node) => node.id === 'receipt')!

    expect(checkout.position.y).toBeLessThan(payment.position.y)
    expect(payment.position.y).toBeLessThan(receipt.position.y)
    expect(result.edges).toHaveLength(2)
    expect(result.edges[0].sections.length).toBeGreaterThan(0)
  })

  it('returns port layout metadata for entries and exits used by the canvas node', async () => {
    const modules = [
      makeModule({
        id: 'webhook',
        entry_points: ['payment_succeeded', 'settlement_event'],
        exit_points: ['notify_order'],
      }),
      makeModule({
        id: 'notifications',
        entry_points: ['notify_order'],
        exit_points: [],
      }),
    ]
    const connections = [
      makeConnection({
        id: 'notify-order',
        source_module_id: 'webhook',
        target_module_id: 'notifications',
        source_exit_point: 'notify_order',
        target_entry_point: 'notify_order',
      }),
    ]

    const result = await computeModuleMapLayout(modules, connections)
    const webhook = result.nodes.find((node) => node.id === 'webhook')!

    expect(webhook.portLayout['entry-payment_succeeded']?.side).toBe('top')
    expect(webhook.portLayout['entry-settlement_event']?.side).toBe('top')
    expect(webhook.portLayout['exit-notify_order']?.side).toBe('bottom')
    expect(webhook.portLayout['entry-payment_succeeded']?.position).toBeGreaterThan(0)
    expect(webhook.portLayout['exit-notify_order']?.position).toBeGreaterThan(0)
  })

  it('includes handles that only exist in saved connections', async () => {
    const modules = [
      makeModule({
        id: 'payment',
        entry_points: ['checkout_data'],
        exit_points: [],
      }),
    ]
    const connections = [
      makeConnection({
        id: 'saved-handle',
        source_module_id: 'payment',
        target_module_id: 'payment',
        source_exit_point: 'payment_result',
        target_entry_point: 'payment_result',
      }),
    ]

    const result = await computeModuleMapLayout(modules, connections)
    const payment = result.nodes.find((node) => node.id === 'payment')!

    expect(payment.portLayout['entry-payment_result']?.side).toBe('top')
    expect(payment.portLayout['exit-payment_result']?.side).toBe('bottom')
  })
})
