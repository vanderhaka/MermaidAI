import 'server-only'

import { z } from 'zod'

import {
  planningDecisionActorSchema,
  planningDecisionEvidenceSchema,
  planningDecisionProvenanceSchema,
  planningReadinessImpactSchema,
} from '@/lib/schemas/planning-command'
import { architectureSnapshotContentSchema } from '@/lib/schemas/planning'
import {
  applyArchitectureCommand,
  type ArchitectureCommandReceipt,
  type PlanningCommandServiceResult,
} from '@/lib/services/planning-command-service'
import type { PlanningDecisionState } from '@/types/planning'
import { createClient } from '@/lib/supabase/server'
import type { ArchitectureReadinessDecision } from '@/lib/services/architecture-readiness'

const uuidSchema = z.uuid()
const decisionStateSchema = z.enum(['proposed', 'accepted', 'rejected', 'superseded'])
const evidenceListSchema = z
  .array(planningDecisionEvidenceSchema)
  .min(1, 'At least one evidence item is required.')
  .max(100)
const reasonSchema = z.string().trim().min(1).max(2_000)

const commandIdentitySchema = z
  .object({
    projectId: uuidSchema,
    changeSetId: uuidSchema,
    turnId: uuidSchema.nullable(),
    expectedRevision: z.number().int().nonnegative(),
    operationIds: z.array(uuidSchema).min(1).max(100),
    architectureContent: architectureSnapshotContentSchema,
  })
  .strict()

const autoDecisionInputSchema = commandIdentitySchema.extend({
  decision: z
    .object({
      id: uuidSchema,
      category: z.string().trim().min(1).max(100),
      statement: z.string().trim().min(1).max(4_000),
      readinessImpact: planningReadinessImpactSchema,
    })
    .strict(),
  reason: reasonSchema,
  evidence: evidenceListSchema,
})

const transitionInputSchema = commandIdentitySchema.extend({
  decision: z.object({ id: uuidSchema, state: decisionStateSchema }).strict(),
  targetState: decisionStateSchema,
  actor: planningDecisionActorSchema,
  reason: reasonSchema,
  evidence: evidenceListSchema,
})

const supersedeInputSchema = commandIdentitySchema.extend({
  decision: z.object({ id: uuidSchema, state: decisionStateSchema }).strict(),
  replacement: z
    .object({
      id: uuidSchema,
      category: z.string().trim().min(1).max(100),
      statement: z.string().trim().min(1).max(4_000),
      provenance: planningDecisionProvenanceSchema,
      readinessImpact: planningReadinessImpactSchema,
    })
    .strict(),
  actor: planningDecisionActorSchema,
  reason: reasonSchema,
  evidence: evidenceListSchema,
})

type AutoDecisionInput = z.input<typeof autoDecisionInputSchema>
type TransitionDecisionInput = z.input<typeof transitionInputSchema>
type SupersedeDecisionInput = z.input<typeof supersedeInputSchema>

const decisionRowSchema = z
  .object({
    id: uuidSchema,
    project_id: uuidSchema,
    artifact_version_id: uuidSchema.nullable(),
    category: z.string().trim().min(1),
    statement: z.string().trim().min(1),
    state: decisionStateSchema,
    provenance: planningDecisionProvenanceSchema,
    readiness_impact: planningReadinessImpactSchema,
    supersedes_decision_id: uuidSchema.nullable(),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
  })
  .strict()

const decisionEventRowSchema = z
  .object({
    id: uuidSchema,
    project_id: uuidSchema,
    decision_id: uuidSchema,
    architecture_version_id: uuidSchema,
    change_set_id: uuidSchema,
    sequence: z.number().int().nonnegative(),
    from_state: decisionStateSchema.nullable(),
    to_state: decisionStateSchema,
    actor_type: planningDecisionProvenanceSchema,
    actor_user_id: uuidSchema.nullable(),
    actor_label: z.string().trim().min(1),
    reason: reasonSchema,
    evidence: evidenceListSchema,
    undone_by_change_set_id: uuidSchema.nullable(),
    created_at: z.string().min(1),
  })
  .strict()

export type PlanningDecisionEvent = z.infer<typeof decisionEventRowSchema>
export type PlanningDecision = z.infer<typeof decisionRowSchema> &
  ArchitectureReadinessDecision & {
    events: PlanningDecisionEvent[]
  }

function invalidInput(error: z.ZodError): PlanningCommandServiceResult<never> {
  return {
    success: false,
    error: `Invalid planning decision: ${error.issues[0]?.message ?? 'unknown input'}`,
  }
}

function legalTransition(from: PlanningDecisionState, to: PlanningDecisionState): boolean {
  if (from === 'proposed') return ['accepted', 'rejected', 'superseded'].includes(to)
  if (from === 'accepted' || from === 'rejected') return to === 'superseded'
  return false
}

export async function listPlanningDecisions(
  projectId: string,
): Promise<PlanningCommandServiceResult<PlanningDecision[]>> {
  if (!uuidSchema.safeParse(projectId).success) {
    return { success: false, error: 'Invalid project ID' }
  }

  const supabase = await createClient()
  const [decisionsResult, eventsResult] = await Promise.all([
    supabase
      .from('planning_decisions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    supabase
      .from('planning_decision_events')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
  ])
  if (decisionsResult.error) return { success: false, error: decisionsResult.error.message }
  if (eventsResult.error) return { success: false, error: eventsResult.error.message }

  const parsedDecisions = z.array(decisionRowSchema).safeParse(decisionsResult.data)
  if (!parsedDecisions.success) {
    return {
      success: false,
      error: `Invalid planning decision rows: ${parsedDecisions.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }
  const parsedEvents = z.array(decisionEventRowSchema).safeParse(eventsResult.data)
  if (!parsedEvents.success) {
    return {
      success: false,
      error: `Invalid planning decision events: ${parsedEvents.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  const eventsByDecision = new Map<string, PlanningDecisionEvent[]>()
  for (const event of parsedEvents.data) {
    if (event.undone_by_change_set_id !== null) continue
    const existing = eventsByDecision.get(event.decision_id) ?? []
    existing.push(event)
    eventsByDecision.set(event.decision_id, existing)
  }

  return {
    success: true,
    data: parsedDecisions.data.map((decision) => {
      const events = eventsByDecision.get(decision.id) ?? []
      const latest = events.at(-1) ?? null
      return {
        ...decision,
        events,
        latest_event:
          latest === null
            ? null
            : {
                actor_type: latest.actor_type,
                actor_label: latest.actor_label,
                reason: latest.reason,
                evidence: latest.evidence,
              },
      }
    }),
  }
}

export async function proposeAutoDecision(
  input: AutoDecisionInput,
): Promise<PlanningCommandServiceResult<ArchitectureCommandReceipt>> {
  const parsed = autoDecisionInputSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const value = parsed.data

  return applyArchitectureCommand({
    projectId: value.projectId,
    changeSetId: value.changeSetId,
    turnId: value.turnId,
    expectedRevision: value.expectedRevision,
    operations: [
      {
        operationId: value.operationIds[0],
        type: 'decision.create',
        decision: {
          ...value.decision,
          state: 'proposed',
          provenance: 'assistant',
          supersedesDecisionId: null,
          actor: { type: 'assistant', label: 'MermaidAI assistant' },
          reason: value.reason,
          evidence: value.evidence,
        },
      },
    ],
    architectureContent: value.architectureContent,
  })
}

export async function transitionPlanningDecision(
  input: TransitionDecisionInput,
): Promise<PlanningCommandServiceResult<ArchitectureCommandReceipt>> {
  const parsed = transitionInputSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const value = parsed.data
  if (!legalTransition(value.decision.state, value.targetState)) {
    return {
      success: false,
      error: `Invalid planning decision transition: ${value.decision.state} -> ${value.targetState}`,
    }
  }

  return applyArchitectureCommand({
    projectId: value.projectId,
    changeSetId: value.changeSetId,
    turnId: value.turnId,
    expectedRevision: value.expectedRevision,
    operations: [
      {
        operationId: value.operationIds[0],
        type: 'decision.update',
        decisionId: value.decision.id,
        changes: {
          state: value.targetState,
          actor: value.actor,
          reason: value.reason,
          evidence: value.evidence,
        },
      },
    ],
    architectureContent: value.architectureContent,
  })
}

export async function supersedePlanningDecision(
  input: SupersedeDecisionInput,
): Promise<PlanningCommandServiceResult<ArchitectureCommandReceipt>> {
  const parsed = supersedeInputSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error)
  const value = parsed.data
  if (!legalTransition(value.decision.state, 'superseded')) {
    return {
      success: false,
      error: `Invalid planning decision transition: ${value.decision.state} -> superseded`,
    }
  }
  if (value.operationIds.length < 2) {
    return { success: false, error: 'Invalid planning decision: Two operation IDs are required.' }
  }
  if (value.decision.id === value.replacement.id) {
    return { success: false, error: 'Invalid planning decision: Replacement ID must be new.' }
  }

  return applyArchitectureCommand({
    projectId: value.projectId,
    changeSetId: value.changeSetId,
    turnId: value.turnId,
    expectedRevision: value.expectedRevision,
    operations: [
      {
        operationId: value.operationIds[0],
        type: 'decision.update',
        decisionId: value.decision.id,
        changes: {
          state: 'superseded',
          actor: value.actor,
          reason: value.reason,
          evidence: value.evidence,
        },
      },
      {
        operationId: value.operationIds[1],
        type: 'decision.create',
        decision: {
          ...value.replacement,
          state: 'proposed',
          supersedesDecisionId: value.decision.id,
          actor: value.actor,
          reason: value.reason,
          evidence: value.evidence,
        },
      },
    ],
    architectureContent: value.architectureContent,
  })
}
