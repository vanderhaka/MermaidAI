const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off'])

type PlanningFeatureEnvironment = {
  NODE_ENV?: string
  STAGED_PLANNING_ENABLED?: string
}

/**
 * New planning projects are opt-in in production. Development and test use the
 * staged workflow by default so the complete journey is continuously exercised.
 * Once a project has opted in, its persisted planning state remains authoritative.
 */
export function isStagedPlanningRolloutEnabled(
  environment: PlanningFeatureEnvironment = process.env,
): boolean {
  const configuredValue = environment.STAGED_PLANNING_ENABLED?.trim().toLowerCase()

  if (configuredValue && ENABLED_VALUES.has(configuredValue)) return true
  if (configuredValue && DISABLED_VALUES.has(configuredValue)) return false

  return environment.NODE_ENV !== 'production'
}
