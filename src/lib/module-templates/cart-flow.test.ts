// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildCartFlowRows } from './cart-flow'

describe('buildCartFlowRows', () => {
  it('returns a connected cart template', () => {
    const mod = '00000000-0000-4000-8000-000000000001'
    const { nodes, edges } = buildCartFlowRows(mod)
    expect(nodes.length).toBeGreaterThanOrEqual(10)
    expect(edges.length).toBeGreaterThanOrEqual(nodes.length - 1)
    for (const n of nodes) {
      expect(n.module_id).toBe(mod)
    }
    for (const e of edges) {
      expect(e.module_id).toBe(mod)
    }
  })
})
