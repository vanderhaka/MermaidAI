import 'server-only'

import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import type {
  ArchitectureSnapshotContent,
  PlanningDecisionState,
  PlanningReadinessState,
} from '@/types/planning'
import type { OpenQuestionReadinessImpact, PlanningProvenance } from '@/types/graph'

export const ARCHITECTURE_READINESS_CHECK_KEYS = [
  'outcome',
  'capability_map',
  'connections',
  'actor_flows',
  'business_boundaries',
  'narrative_consistency',
  'coverage_decisions',
  'blockers',
] as const

export type ArchitectureReadinessCheckKey = (typeof ARCHITECTURE_READINESS_CHECK_KEYS)[number]
export type ArchitectureReadinessCheckStatus = 'pass' | 'warning' | 'fail'
export type ArchitectureReadinessFreshness = 'current' | 'stale'

export type PlanningDecisionEvidence = {
  type: string
  reference: string
  summary: string
}

export type PlanningDecisionEventEvidence = {
  actor_type: PlanningProvenance
  actor_label: string
  reason: string
  evidence: PlanningDecisionEvidence[]
}

export type ArchitectureReadinessDecision = {
  id: string
  artifact_version_id: string | null
  category: string
  statement: string
  state: PlanningDecisionState
  provenance: PlanningProvenance
  readiness_impact: OpenQuestionReadinessImpact
  supersedes_decision_id: string | null
  latest_event: PlanningDecisionEventEvidence | null
}

export type ArchitectureReadinessQuestion = {
  id: string
  artifact_version_id: string | null
  question: string
  status: 'open' | 'resolved'
  readiness_impact: OpenQuestionReadinessImpact | null
}

export type ArchitectureReadinessInput = {
  projectId: string
  architectureVersion: {
    id: string
    version: number
    contentHash: string
  }
  activeArchitectureVersionId: string | null
  evaluatedRevision: number
  architecture: ArchitectureSnapshotContent | null
  decisions: ArchitectureReadinessDecision[]
  openQuestions: ArchitectureReadinessQuestion[]
}

export type ArchitectureReadinessCheck = {
  key: ArchitectureReadinessCheckKey
  status: ArchitectureReadinessCheckStatus
  explanation: string
  affectedIds: string[]
}

export type ArchitectureReadinessReport = {
  schemaVersion: 2
  projectId: string
  architectureVersionId: string
  architectureVersion: number
  architectureContentHash: string
  evaluatedRevision: number
  state: PlanningReadinessState
  freshness: ArchitectureReadinessFreshness
  handoffEligible: boolean
  checks: ArchitectureReadinessCheck[]
  reasons: string[]
  blockingQuestionIds: string[]
  nonBlockingQuestionIds: string[]
  deferredQuestionIds: string[]
  proposedDecisionIds: string[]
  acceptedDecisionIds: string[]
  supersededDecisionIds: string[]
  invalidInputIds: string[]
  staleInputIds: string[]
}

export type ArchitectureReadinessServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const uuidSchema = z.uuid()
const readinessStateSchema = z.enum(['draft', 'needs_input', 'ready_with_assumptions', 'ready'])
const readinessCheckSchema = z
  .object({
    key: z.enum(ARCHITECTURE_READINESS_CHECK_KEYS),
    status: z.enum(['pass', 'warning', 'fail']),
    explanation: z.string(),
    affectedIds: z.array(z.string()),
  })
  .strict()

export const architectureReadinessReportSchema = z
  .object({
    schemaVersion: z.literal(2),
    projectId: uuidSchema,
    architectureVersionId: uuidSchema,
    architectureVersion: z.number().int().positive(),
    architectureContentHash: z.string().trim().min(1),
    evaluatedRevision: z.number().int().nonnegative(),
    state: readinessStateSchema,
    freshness: z.enum(['current', 'stale']),
    handoffEligible: z.boolean(),
    checks: z.array(readinessCheckSchema).length(ARCHITECTURE_READINESS_CHECK_KEYS.length),
    reasons: z.array(z.string()),
    blockingQuestionIds: z.array(z.string()),
    nonBlockingQuestionIds: z.array(z.string()),
    deferredQuestionIds: z.array(z.string()),
    proposedDecisionIds: z.array(z.string()),
    acceptedDecisionIds: z.array(z.string()),
    supersededDecisionIds: z.array(z.string()),
    invalidInputIds: z.array(z.string()),
    staleInputIds: z.array(z.string()),
  })
  .strict()

const readinessReportRowSchema = z
  .object({
    id: uuidSchema,
    project_id: uuidSchema,
    architecture_version_id: uuidSchema,
    schema_version: z.number().int().positive(),
    evaluated_revision: z.number().int().nonnegative(),
    state: readinessStateSchema,
    report: architectureReadinessReportSchema,
    report_hash: z.string().trim().min(1),
    created_at: z.string().min(1),
  })
  .strict()

export type PersistedArchitectureReadinessReport = z.infer<typeof readinessReportRowSchema>

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validDecisionEvidence(event: PlanningDecisionEventEvidence | null): boolean {
  return (
    event !== null &&
    ['user', 'assistant', 'system'].includes(event.actor_type) &&
    hasText(event.actor_label) &&
    hasText(event.reason) &&
    event.evidence.length > 0 &&
    event.evidence.every(
      (entry) => hasText(entry.type) && hasText(entry.reference) && hasText(entry.summary),
    )
  )
}

function hasConnectedCapabilityMap(content: ArchitectureSnapshotContent | null): boolean {
  if (!content || content.capabilities.length === 0) return false
  if (content.capabilities.length === 1) return true

  const capabilityIds = new Set(content.capabilities.map((capability) => capability.id))
  const neighbours = new Map([...capabilityIds].map((id) => [id, new Set<string>()]))
  for (const connection of content.connections) {
    if (
      !capabilityIds.has(connection.from_capability_id) ||
      !capabilityIds.has(connection.to_capability_id) ||
      connection.from_capability_id === connection.to_capability_id
    ) {
      continue
    }
    neighbours.get(connection.from_capability_id)?.add(connection.to_capability_id)
    neighbours.get(connection.to_capability_id)?.add(connection.from_capability_id)
  }

  const firstId = content.capabilities[0]?.id
  if (!firstId) return false
  const visited = new Set<string>([firstId])
  const pending = [firstId]
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) continue
    for (const neighbour of neighbours.get(current) ?? []) {
      if (visited.has(neighbour)) continue
      visited.add(neighbour)
      pending.push(neighbour)
    }
  }
  return visited.size === content.capabilities.length
}

function checkActorFlows(content: ArchitectureSnapshotContent | null): boolean {
  if (!content || content.actors.length === 0 || content.outcomes.length === 0) return false
  const capabilityIds = new Set(content.capabilities.map((capability) => capability.id))
  const actorsWithValidFlow = new Set(
    content.important_flows
      .filter(
        (flow) =>
          hasText(flow.outcome) &&
          flow.capability_ids.length > 0 &&
          flow.capability_ids.every((id) => capabilityIds.has(id)),
      )
      .map((flow) => flow.actor.trim().toLocaleLowerCase()),
  )
  return content.actors.every((actor) => actorsWithValidFlow.has(actor.trim().toLocaleLowerCase()))
}

const NARRATIVE_PLACEHOLDER_PATTERNS = [
  /\b(?:open|unanswered|unresolved)\s+(?:scope|questions?|decisions?|choices?|details?|points?)\b/i,
  /\b(?:scope|questions?|decisions?|choices?|details?|points?)\s+(?:is|are|remains?|still)\s+(?:open|unanswered|unresolved|undecided)\b/i,
  /\b(?:to be|needs? to be)\s+(?:confirmed|decided|determined|clarified)\b/i,
  /\bsubject to (?:the )?(?:captured )?(?:open|unanswered|unresolved)\b/i,
  /\bTBD\b/i,
]

function containsNarrativePlaceholder(value: string): boolean {
  return NARRATIVE_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))
}

function findNarrativePlaceholderIds(content: ArchitectureSnapshotContent | null): string[] {
  if (!content) return []

  const affectedIds: string[] = []
  if (containsNarrativePlaceholder(content.objective)) affectedIds.push('objective')
  content.outcomes.forEach((outcome, index) => {
    if (containsNarrativePlaceholder(outcome)) affectedIds.push(`outcome:${index + 1}`)
  })
  for (const capability of content.capabilities) {
    if (
      [capability.purpose, ...capability.responsibilities, ...capability.boundaries].some(
        containsNarrativePlaceholder,
      )
    ) {
      affectedIds.push(capability.id)
    }
  }
  for (const connection of content.connections) {
    if (containsNarrativePlaceholder(connection.description)) {
      affectedIds.push(`connection:${connection.from_capability_id}:${connection.to_capability_id}`)
    }
  }
  for (const flow of content.important_flows) {
    if (containsNarrativePlaceholder(flow.outcome)) affectedIds.push(flow.id)
  }
  return sorted(affectedIds)
}

function makeCheck(
  key: ArchitectureReadinessCheckKey,
  status: ArchitectureReadinessCheckStatus,
  explanation: string,
  affectedIds: Iterable<string> = [],
): ArchitectureReadinessCheck {
  return { key, status, explanation, affectedIds: sorted(affectedIds) }
}

export function evaluateArchitectureReadiness(
  input: ArchitectureReadinessInput,
): ArchitectureReadinessReport {
  const content = input.architecture
  const capabilityIds = content?.capabilities.map((capability) => capability.id) ?? []
  const outcomeComplete =
    content !== null && hasText(content.objective) && content.outcomes.some(hasText)
  const capabilityMapComplete =
    content !== null &&
    content.capabilities.length > 0 &&
    content.capabilities.every(
      (capability) =>
        hasText(capability.name) &&
        hasText(capability.purpose) &&
        capability.responsibilities.some(hasText),
    )
  const connectionsComplete = hasConnectedCapabilityMap(content)
  const actorFlowsComplete = checkActorFlows(content)
  const boundariesComplete =
    content !== null &&
    content.capabilities.length > 0 &&
    content.capabilities.every((capability) => capability.boundaries.some(hasText))
  const narrativePlaceholderIds = findNarrativePlaceholderIds(content)
  const narrativeConsistent = narrativePlaceholderIds.length === 0

  const invalidInputIds = new Set<string>()
  const staleInputIds = new Set<string>()
  const blockingQuestionIds = new Set<string>()
  const nonBlockingQuestionIds = new Set<string>()
  const deferredQuestionIds = new Set<string>()

  for (const question of input.openQuestions) {
    if (question.status !== 'open') continue
    if (question.artifact_version_id !== input.architectureVersion.id) {
      if (question.artifact_version_id === null) invalidInputIds.add(question.id)
      else staleInputIds.add(question.id)
      continue
    }
    if (question.readiness_impact === 'blocking') blockingQuestionIds.add(question.id)
    else if (question.readiness_impact === 'non_blocking') nonBlockingQuestionIds.add(question.id)
    else if (question.readiness_impact === 'deferred') deferredQuestionIds.add(question.id)
    else invalidInputIds.add(question.id)
  }

  const proposedDecisionIds = new Set<string>()
  const acceptedDecisionIds = new Set<string>()
  const supersededDecisionIds = new Set<string>()
  for (const decision of input.decisions) {
    if (decision.state === 'superseded') {
      supersededDecisionIds.add(decision.id)
      continue
    }
    if (decision.state === 'rejected') continue
    if (decision.artifact_version_id !== input.architectureVersion.id) {
      if (decision.artifact_version_id === null) invalidInputIds.add(decision.id)
      else staleInputIds.add(decision.id)
      continue
    }
    if (!validDecisionEvidence(decision.latest_event)) {
      invalidInputIds.add(decision.id)
      continue
    }
    if (decision.state === 'proposed') {
      proposedDecisionIds.add(decision.id)
      if (decision.readiness_impact === 'blocking') blockingQuestionIds.add(decision.id)
    } else if (decision.state === 'accepted') {
      acceptedDecisionIds.add(decision.id)
    }
  }

  const contentBlockerIds = new Set(content?.blockers.map((blocker) => blocker.id) ?? [])
  const activeAssumptionCount = proposedDecisionIds.size + acceptedDecisionIds.size
  const invalidCount = invalidInputIds.size
  const hasExplicitBlocker = blockingQuestionIds.size > 0 || contentBlockerIds.size > 0
  const structuralChecksPass =
    outcomeComplete &&
    capabilityMapComplete &&
    connectionsComplete &&
    actorFlowsComplete &&
    boundariesComplete &&
    narrativeConsistent

  const coverageStatus: ArchitectureReadinessCheckStatus =
    invalidCount > 0 ? 'fail' : activeAssumptionCount > 0 ? 'warning' : 'pass'
  const blockerStatus: ArchitectureReadinessCheckStatus = hasExplicitBlocker ? 'fail' : 'pass'
  const checks: ArchitectureReadinessCheck[] = [
    makeCheck(
      'outcome',
      outcomeComplete ? 'pass' : 'fail',
      outcomeComplete
        ? 'The Architecture names a high-level objective and observable outcomes.'
        : 'Add a high-level objective and at least one observable outcome.',
    ),
    makeCheck(
      'capability_map',
      capabilityMapComplete ? 'pass' : 'fail',
      capabilityMapComplete
        ? 'Every capability has a high-level purpose and responsibility.'
        : 'The capability map is incomplete.',
      capabilityMapComplete ? [] : capabilityIds,
    ),
    makeCheck(
      'connections',
      connectionsComplete ? 'pass' : 'fail',
      connectionsComplete
        ? 'The high-level capability map is connected.'
        : 'Connect every capability to the high-level Architecture.',
      connectionsComplete ? [] : capabilityIds,
    ),
    makeCheck(
      'actor_flows',
      actorFlowsComplete ? 'pass' : 'fail',
      actorFlowsComplete
        ? 'Every named actor has a valid path to an outcome.'
        : 'Add a valid actor-to-outcome flow for every named actor.',
      actorFlowsComplete ? [] : (content?.actors ?? []),
    ),
    makeCheck(
      'business_boundaries',
      boundariesComplete ? 'pass' : 'fail',
      boundariesComplete
        ? 'Every capability states what it does not own.'
        : 'Add a meaningful business boundary to every capability.',
      boundariesComplete ? [] : capabilityIds,
    ),
    makeCheck(
      'narrative_consistency',
      narrativeConsistent ? 'pass' : 'fail',
      narrativeConsistent
        ? 'The Architecture narrative contains no unresolved planning placeholders.'
        : 'Replace open, unanswered, unresolved, or TBD placeholders with the current decision; keep remaining uncertainty in the review list.',
      narrativePlaceholderIds,
    ),
    makeCheck(
      'coverage_decisions',
      coverageStatus,
      invalidCount > 0
        ? `${invalidCount} planning input${invalidCount === 1 ? '' : 's'} lacks trustworthy evidence or classification.`
        : activeAssumptionCount > 0
          ? `${activeAssumptionCount} active assumption${activeAssumptionCount === 1 ? '' : 's'} ${activeAssumptionCount === 1 ? 'remains' : 'remain'} visible in the review.`
          : 'No active assumptions affect the Work Plan.',
      invalidInputIds,
    ),
    makeCheck(
      'blockers',
      blockerStatus,
      hasExplicitBlocker
        ? 'Resolve the explicitly blocking planning inputs before handoff.'
        : 'No unresolved blocking input prevents handoff.',
      [...blockingQuestionIds, ...contentBlockerIds],
    ),
  ]

  let state: PlanningReadinessState
  if (hasExplicitBlocker || invalidCount > 0) state = 'needs_input'
  else if (!structuralChecksPass) state = 'draft'
  else if (activeAssumptionCount > 0) state = 'ready_with_assumptions'
  else state = 'ready'

  const freshness: ArchitectureReadinessFreshness =
    input.activeArchitectureVersionId === input.architectureVersion.id ? 'current' : 'stale'
  const handoffEligible =
    freshness === 'current' &&
    structuralChecksPass &&
    !hasExplicitBlocker &&
    invalidCount === 0 &&
    proposedDecisionIds.size === 0

  const reasons: string[] = []
  if (!outcomeComplete) reasons.push('The high-level outcome is incomplete.')
  if (!capabilityMapComplete) reasons.push('The capability map is incomplete.')
  if (!connectionsComplete) reasons.push('The capability map is disconnected.')
  if (!actorFlowsComplete) reasons.push('Actor-to-outcome coverage is incomplete.')
  if (!boundariesComplete) reasons.push('Business boundaries are incomplete.')
  if (!narrativeConsistent) {
    reasons.push('The Architecture narrative still contains unresolved planning placeholders.')
  }
  if (hasExplicitBlocker) {
    reasons.push('At least one explicit blocker still needs input.')
  }
  if (invalidCount > 0) {
    reasons.push(
      `${invalidCount} planning input${invalidCount === 1 ? '' : 's'} needs a valid readiness classification or evidence trail.`,
    )
  }
  if (proposedDecisionIds.size > 0 && !hasExplicitBlocker && invalidCount === 0) {
    reasons.push(
      `${proposedDecisionIds.size} proposed assumption${proposedDecisionIds.size === 1 ? '' : 's'} needs explicit acceptance before handoff.`,
    )
  }
  if (freshness === 'stale') {
    reasons.push('This report is stale because the active Architecture version changed.')
  }
  if (reasons.length === 0) {
    reasons.push(
      state === 'ready'
        ? `Architecture v${input.architectureVersion.version} is ready for Work Plan generation.`
        : `Architecture v${input.architectureVersion.version} is ready with accepted assumptions.`,
    )
  }

  return architectureReadinessReportSchema.parse({
    schemaVersion: 2,
    projectId: input.projectId,
    architectureVersionId: input.architectureVersion.id,
    architectureVersion: input.architectureVersion.version,
    architectureContentHash: input.architectureVersion.contentHash,
    evaluatedRevision: input.evaluatedRevision,
    state,
    freshness,
    handoffEligible,
    checks,
    reasons,
    blockingQuestionIds: sorted(blockingQuestionIds),
    nonBlockingQuestionIds: sorted(nonBlockingQuestionIds),
    deferredQuestionIds: sorted(deferredQuestionIds),
    proposedDecisionIds: sorted(proposedDecisionIds),
    acceptedDecisionIds: sorted(acceptedDecisionIds),
    supersededDecisionIds: sorted(supersededDecisionIds),
    invalidInputIds: sorted(invalidInputIds),
    staleInputIds: sorted(staleInputIds),
  })
}

export function getArchitectureReadinessFreshness(
  report: ArchitectureReadinessReport,
  current: { activeArchitectureVersionId: string | null; currentRevision: number },
): {
  freshness: ArchitectureReadinessFreshness
  reasons: ('architecture_version_changed' | 'planning_revision_changed')[]
} {
  const reasons: ('architecture_version_changed' | 'planning_revision_changed')[] = []
  if (report.architectureVersionId !== current.activeArchitectureVersionId) {
    reasons.push('architecture_version_changed')
  }
  if (report.evaluatedRevision !== current.currentRevision) {
    reasons.push('planning_revision_changed')
  }
  return { freshness: reasons.length === 0 ? 'current' : 'stale', reasons }
}

export async function persistArchitectureReadinessReport(input: {
  projectId: string
  report: ArchitectureReadinessReport
}): Promise<ArchitectureReadinessServiceResult<PersistedArchitectureReadinessReport>> {
  if (!uuidSchema.safeParse(input.projectId).success) {
    return { success: false, error: 'Invalid project ID' }
  }
  const parsedReport = architectureReadinessReportSchema.safeParse(input.report)
  if (!parsedReport.success || parsedReport.data.projectId !== input.projectId) {
    return { success: false, error: 'Invalid Architecture readiness report' }
  }
  if (parsedReport.data.freshness !== 'current') {
    return { success: false, error: 'A stale Architecture readiness report cannot be persisted' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('persist_architecture_readiness_report', {
    p_project_id: input.projectId,
    p_architecture_version_id: parsedReport.data.architectureVersionId,
    p_evaluated_revision: parsedReport.data.evaluatedRevision,
    p_report: parsedReport.data as unknown as Json,
  })
  if (error) return { success: false, error: error.message }

  const parsedRow = readinessReportRowSchema.safeParse(data)
  if (!parsedRow.success) {
    return {
      success: false,
      error: `Invalid persisted readiness report: ${parsedRow.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }
  return { success: true, data: parsedRow.data }
}

export async function getLatestArchitectureReadinessReport(
  projectId: string,
  architectureVersionId: string,
): Promise<ArchitectureReadinessServiceResult<PersistedArchitectureReadinessReport | null>> {
  if (!uuidSchema.safeParse(projectId).success) {
    return { success: false, error: 'Invalid project ID' }
  }
  if (!uuidSchema.safeParse(architectureVersionId).success) {
    return { success: false, error: 'Invalid Architecture version ID' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('planning_readiness_reports')
    .select('*')
    .eq('project_id', projectId)
    .eq('architecture_version_id', architectureVersionId)
    .order('evaluated_revision', { ascending: false })
    .order('schema_version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (data === null) return { success: true, data: null }

  const parsed = readinessReportRowSchema.safeParse(data)
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid persisted readiness report: ${parsed.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }
  return { success: true, data: parsed.data }
}
