// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getNodeColor } from '@/lib/canvas/colors'
import type { FlowNodeType } from '@/types/graph'

describe('getNodeColor', () => {
  it('returns amber for decision nodes', () => {
    expect(getNodeColor('decision')).toBe('amber')
  })

  it('returns blue for process nodes', () => {
    expect(getNodeColor('process')).toBe('blue')
  })

  it('returns green for entry nodes', () => {
    expect(getNodeColor('entry')).toBe('green')
  })

  it('returns red for exit nodes', () => {
    expect(getNodeColor('exit')).toBe('red')
  })

  it('returns gray for start nodes', () => {
    expect(getNodeColor('start')).toBe('gray')
  })

  it('returns gray for end nodes', () => {
    expect(getNodeColor('end')).toBe('gray')
  })

  it('returns a default color for unknown node types', () => {
    const result = getNodeColor('unknown' as FlowNodeType)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
