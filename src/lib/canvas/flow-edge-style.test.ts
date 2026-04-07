// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getModuleFlowEdgeStyle, inferDecisionSourceHandle } from '@/lib/canvas/flow-edge-style'

describe('getModuleFlowEdgeStyle', () => {
  it('uses green for primary / yes paths', () => {
    const s = getModuleFlowEdgeStyle({
      label: 'yes',
      condition: null,
      sourceHandle: 'yes',
    })
    expect(s.stroke).toBe('#22c55e')
    expect(s.isErrorPath).toBe(false)
  })

  it('uses orange for no branch', () => {
    const s = getModuleFlowEdgeStyle({
      label: 'no',
      condition: null,
      sourceHandle: 'no',
    })
    expect(s.stroke).toBe('#f97316')
    expect(s.isErrorPath).toBe(true)
  })

  it('uses orange when label matches error keywords', () => {
    const s = getModuleFlowEdgeStyle({
      label: 'rollback',
      condition: null,
      sourceHandle: null,
    })
    expect(s.stroke).toBe('#f97316')
    expect(s.isErrorPath).toBe(true)
  })
})

describe('inferDecisionSourceHandle', () => {
  it('maps yes/no labels to handles', () => {
    expect(inferDecisionSourceHandle('Yes')).toBe('yes')
    expect(inferDecisionSourceHandle('no')).toBe('no')
    expect(inferDecisionSourceHandle('maybe')).toBeUndefined()
  })

  it('infers from condition when label is not yes/no', () => {
    expect(inferDecisionSourceHandle(null, 'Guest')).toBe('no')
    expect(inferDecisionSourceHandle(null, 'Logged in')).toBe('yes')
  })
})
