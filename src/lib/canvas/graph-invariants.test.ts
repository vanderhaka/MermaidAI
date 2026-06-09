import { describe, expect, it } from 'vitest'

import { validateFlowGraph } from '@/lib/canvas/graph-invariants'
import type { FlowEdge, FlowNode, FlowNodeType } from '@/types/graph'

function node(id: string, label: string, nodeType: FlowNodeType = 'process'): FlowNode {
  return {
    id,
    module_id: 'mod-1',
    node_type: nodeType,
    label,
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  overrides: Partial<Pick<FlowEdge, 'label' | 'condition'>> = {},
): FlowEdge {
  return {
    id,
    module_id: 'mod-1',
    source_node_id: source,
    target_node_id: target,
    label: null,
    condition: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('validateFlowGraph', () => {
  it('passes a connected happy path with clear decision branches', () => {
    const issues = validateFlowGraph({
      nodes: [
        node('start', 'Start', 'start'),
        node('cart', 'View Cart'),
        node('empty', 'Cart Empty?', 'decision'),
        node('ship', 'Shipping'),
        node('end', 'End', 'end'),
      ],
      edges: [
        edge('e1', 'start', 'cart'),
        edge('e2', 'cart', 'empty'),
        edge('e3', 'empty', 'end', { condition: 'Yes' }),
        edge('e4', 'empty', 'ship', { condition: 'No' }),
        edge('e5', 'ship', 'end'),
      ],
    })

    expect(issues).toEqual([])
  })

  it('reports the disconnected checkout graph produced by island insertions and contradictory failure exits', () => {
    const issues = validateFlowGraph({
      nodes: [
        node('start', 'Start', 'start'),
        node('cart', 'View Cart'),
        node('empty', 'Cart Empty?', 'decision'),
        node('shipping', 'Enter Shipping Info'),
        node('payment', 'Enter Payment Info'),
        node('process', 'Process Payment'),
        node('success', 'Payment Successful?', 'decision'),
        node('confirmed', 'Order Confirmed'),
        node('end', 'End', 'end'),
        node('discount', 'Enter Discount Code'),
        node('coupon', 'Coupon Valid?', 'decision'),
        node('coupon-error', 'Show Error'),
        node('payment-error', 'Show Payment Error'),
      ],
      edges: [
        edge('e1', 'start', 'cart'),
        edge('e2', 'cart', 'empty'),
        edge('e3', 'empty', 'end', { condition: 'Yes (empty)' }),
        edge('e4', 'shipping', 'payment'),
        edge('e5', 'payment', 'process'),
        edge('e6', 'process', 'success'),
        edge('e7', 'success', 'confirmed', { condition: 'Yes' }),
        edge('e8', 'success', 'end', { condition: 'No' }),
        edge('e9', 'confirmed', 'end'),
        edge('e10', 'discount', 'coupon'),
        edge('e11', 'coupon', 'shipping', { condition: 'Valid' }),
        edge('e12', 'coupon', 'coupon-error', { condition: 'Invalid' }),
        edge('e13', 'coupon-error', 'discount', { label: 'Retry' }),
        edge('e14', 'coupon-error', 'shipping', { label: 'Skip' }),
        edge('e15', 'success', 'payment-error', { condition: 'fail' }),
        edge('e16', 'payment-error', 'payment', { label: 'Retry' }),
      ],
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_decision_branch',
          nodeId: 'empty',
        }),
        expect.objectContaining({
          code: 'unreachable_node',
          nodeId: 'discount',
        }),
        expect.objectContaining({
          code: 'contradictory_terminal_recovery',
          nodeId: 'success',
        }),
      ]),
    )
  })

  it('ignores open-question annotation nodes when checking process connectivity', () => {
    const issues = validateFlowGraph({
      nodes: [
        node('start', 'Start', 'start'),
        node('process', 'Do work'),
        node('end', 'End', 'end'),
        node('question', 'Question', 'question'),
      ],
      edges: [edge('e1', 'start', 'process'), edge('e2', 'process', 'end')],
    })

    expect(issues).toEqual([])
  })
})
