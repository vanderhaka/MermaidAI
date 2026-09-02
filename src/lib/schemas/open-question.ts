import { z } from 'zod'

export const OPEN_QUESTION_STATUSES = ['open', 'resolved'] as const
export const OPEN_QUESTION_READINESS_IMPACTS = ['blocking', 'non_blocking', 'deferred'] as const
export const PLANNING_PROVENANCE_VALUES = ['user', 'assistant', 'system'] as const

export const openQuestionReadinessImpactSchema = z.enum(OPEN_QUESTION_READINESS_IMPACTS)
export const planningProvenanceSchema = z.enum(PLANNING_PROVENANCE_VALUES)

export const createOpenQuestionSchema = z
  .object({
    project_id: z.uuid(),
    node_id: z.uuid(),
    section: z.string().trim().min(1).max(100),
    question: z.string().trim().min(1).max(500),
    status: z.enum(OPEN_QUESTION_STATUSES).default('open'),
    resolution: z.string().nullable().default(null),
    artifact_version_id: z.uuid().nullable().default(null),
    planning_decision_id: z.uuid().nullable().default(null),
    // Older callers did not classify questions. Treating them as blocking is the safe default.
    readiness_impact: openQuestionReadinessImpactSchema.default('blocking'),
    provenance: planningProvenanceSchema.default('assistant'),
  })
  .strip()

export const resolveOpenQuestionSchema = z.object({
  resolution: z.string().trim().min(1).max(1000),
})
