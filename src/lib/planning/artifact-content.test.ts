// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  getExecutionHandoffCapabilities,
  parseArchitectureSnapshotContent,
  parseExecutionHandoffContent,
  parseWorkPlanContent,
} from '@/lib/planning/artifact-content'

describe('planning artifact content contracts', () => {
  it('returns typed content only after the matching contract validates', () => {
    expect(() => parseArchitectureSnapshotContent({})).toThrow()
    expect(() => parseWorkPlanContent({})).toThrow()
    expect(() => parseExecutionHandoffContent({})).toThrow()
  })

  it('exposes only safe Stage 3 review capabilities', () => {
    expect(getExecutionHandoffCapabilities()).toEqual(['preview', 'copy', 'download'])
  })
})
