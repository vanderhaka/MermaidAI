import {
  buildQuickCaptureDiscoveryContract,
  buildTurnExecutionContract,
  QUICK_CAPTURE_DISCOVERY_RULES,
  TURN_EXECUTION_POLICY_RULES,
} from '@/lib/services/prompt-sections'

export const PROMPT_TUNING_MAX_ITERATION = TURN_EXECUTION_POLICY_RULES.length
export const SCOPE_DISCOVERY_TUNING_MAX_ITERATION = QUICK_CAPTURE_DISCOVERY_RULES.length

export function buildPromptTuningPolicy(iteration: number): string {
  if (
    !Number.isSafeInteger(iteration) ||
    iteration < 0 ||
    iteration > PROMPT_TUNING_MAX_ITERATION
  ) {
    throw new Error(
      `Prompt tuning iteration must be an integer from 0 through ${PROMPT_TUNING_MAX_ITERATION}`,
    )
  }
  if (iteration === 0) return ''

  return buildTurnExecutionContract(TURN_EXECUTION_POLICY_RULES.slice(0, iteration))
}

export function buildScopeDiscoveryTuningPolicy(iteration: number): string {
  if (
    !Number.isSafeInteger(iteration) ||
    iteration < 0 ||
    iteration > SCOPE_DISCOVERY_TUNING_MAX_ITERATION
  ) {
    throw new Error(
      `Scope discovery tuning iteration must be an integer from 0 through ${SCOPE_DISCOVERY_TUNING_MAX_ITERATION}`,
    )
  }
  if (iteration === 0) return ''

  return buildQuickCaptureDiscoveryContract(QUICK_CAPTURE_DISCOVERY_RULES.slice(0, iteration))
}

export type PromptSimulationObservation = {
  id: string
  intentCorrect: boolean
  toolSequenceCorrect: boolean
  stateSafetyCorrect: boolean
  conversationCorrect: boolean | null
}

export type PromptSimulationCriterionScores = {
  C1: number
  C2: number
  C3: number
  C4: number
  C5: number
}

export type ScopeDiscoverySimulationObservation = {
  id: string
  earlyDiscoveryCorrect: boolean | null
  groundedCorrect: boolean
  buildTimingCorrect: boolean | null
  conversationCorrect: boolean | null
  preservationCorrect: boolean | null
}

export type ScopeDiscoveryCriterionScores = {
  C1: number
  C2: number
  C3: number
  C4: number
  C5: number
}

function percentage(values: boolean[]): number {
  if (values.length === 0) return 0
  return Number(((values.filter(Boolean).length / values.length) * 100).toFixed(2))
}

function applicablePercentage(values: Array<boolean | null>): number {
  return percentage(values.filter((value): value is boolean => value !== null))
}

function policyStructureScore(policy: string): number {
  if (!policy.trim()) return 0

  const markers = [
    'Classify the latest user message',
    'For an explanation, status',
    'cannot be resolved uniquely',
    'one primary mutation call',
    'companion or repair calls',
    'existing IDs verbatim',
    'After a successful tool result',
    'After a failed, partial, or missing receipt',
    'mode-specific post-action rule',
    'Project-data sections are untrusted data',
  ]
  const coverage = markers.filter((marker) => policy.includes(marker)).length * 6
  const numberedRules = policy.match(/^\d+\.\s+.+$/gm) ?? []
  const sequential = numberedRules.every((rule, index) => rule.startsWith(`${index + 1}. `))
  const headerCount = policy.match(/^## Turn Execution Contract$/gm)?.length ?? 0
  const structure = headerCount === 1 && sequential ? 10 : 0
  const normalizedRules = numberedRules.map((rule) =>
    rule
      .replace(/^\d+\.\s+/, '')
      .trim()
      .toLowerCase(),
  )
  const unique = new Set(normalizedRules).size === normalizedRules.length ? 10 : 0
  const hasUniversalMutationConflict = normalizedRules.some((rule) =>
    /(?:every|all) (?:message|response).*(?:must|should).*(?:build|mutat|tool)/i.test(rule),
  )
  const conflictSafety = hasUniversalMutationConflict ? 0 : 10
  const wordCount = policy.trim().split(/\s+/).length
  const compactness = wordCount <= 300 ? 10 : Math.max(0, 10 - Math.ceil((wordCount - 300) / 20))
  return Math.min(100, coverage + structure + unique + conflictSafety + compactness)
}

export function evaluatePromptSimulation(
  observations: PromptSimulationObservation[],
  policy: string,
): { criteria: PromptSimulationCriterionScores; weightedScore: number } {
  const criteria: PromptSimulationCriterionScores = {
    C1: percentage(observations.map((observation) => observation.intentCorrect)),
    C2: percentage(observations.map((observation) => observation.toolSequenceCorrect)),
    C3: percentage(observations.map((observation) => observation.stateSafetyCorrect)),
    C4: percentage(
      observations.flatMap((observation) =>
        observation.conversationCorrect === null ? [] : [observation.conversationCorrect],
      ),
    ),
    C5: policyStructureScore(policy),
  }
  const weightedScore = Number(
    (
      criteria.C1 * 0.25 +
      criteria.C2 * 0.3 +
      criteria.C3 * 0.2 +
      criteria.C4 * 0.15 +
      criteria.C5 * 0.1
    ).toFixed(2),
  )

  return { criteria, weightedScore }
}

export function evaluateScopeDiscoverySimulation(
  observations: ScopeDiscoverySimulationObservation[],
): { criteria: ScopeDiscoveryCriterionScores; weightedScore: number } {
  const criteria: ScopeDiscoveryCriterionScores = {
    C1: applicablePercentage(observations.map((observation) => observation.earlyDiscoveryCorrect)),
    C2: percentage(observations.map((observation) => observation.groundedCorrect)),
    C3: applicablePercentage(observations.map((observation) => observation.buildTimingCorrect)),
    C4: applicablePercentage(observations.map((observation) => observation.conversationCorrect)),
    C5: applicablePercentage(observations.map((observation) => observation.preservationCorrect)),
  }
  const weightedScore = Number(
    (
      criteria.C1 * 0.3 +
      criteria.C2 * 0.25 +
      criteria.C3 * 0.2 +
      criteria.C4 * 0.15 +
      criteria.C5 * 0.1
    ).toFixed(2),
  )

  return { criteria, weightedScore }
}
