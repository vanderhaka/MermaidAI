import { describe, expect, it } from 'vitest'

import { isStagedPlanningRolloutEnabled } from '@/lib/planning-feature'

describe('isStagedPlanningRolloutEnabled', () => {
  it('defaults on in development and test', () => {
    expect(isStagedPlanningRolloutEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(isStagedPlanningRolloutEnabled({ NODE_ENV: 'test' })).toBe(true)
  })

  it('defaults off in production', () => {
    expect(isStagedPlanningRolloutEnabled({ NODE_ENV: 'production' })).toBe(false)
  })

  it('accepts explicit on and off values in every environment', () => {
    expect(
      isStagedPlanningRolloutEnabled({
        NODE_ENV: 'production',
        STAGED_PLANNING_ENABLED: 'true',
      }),
    ).toBe(true)
    expect(
      isStagedPlanningRolloutEnabled({
        NODE_ENV: 'development',
        STAGED_PLANNING_ENABLED: 'off',
      }),
    ).toBe(false)
  })

  it('uses the safe environment default for an unknown value', () => {
    expect(
      isStagedPlanningRolloutEnabled({
        NODE_ENV: 'production',
        STAGED_PLANNING_ENABLED: 'maybe',
      }),
    ).toBe(false)
  })
})
