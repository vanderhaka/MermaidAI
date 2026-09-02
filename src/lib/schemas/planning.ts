import { z } from 'zod'

import {
  PLANNING_ARTIFACT_KINDS,
  PLANNING_CHANGE_SET_STATES,
  PLANNING_DECISION_STATES,
  PLANNING_HANDOFF_STATES,
  PLANNING_READINESS_STATES,
} from '@/types/planning'

const identifierSchema = z.string().trim().min(1).max(120)
const contentTextSchema = z.string().trim().min(1).max(4_000)
const contentListSchema = z.array(contentTextSchema).min(1).max(100)

export const planningArtifactKindSchema = z.enum(PLANNING_ARTIFACT_KINDS)
export const planningReadinessStateSchema = z.enum(PLANNING_READINESS_STATES)
export const planningHandoffStateSchema = z.enum(PLANNING_HANDOFF_STATES)
export const planningDecisionStateSchema = z.enum(PLANNING_DECISION_STATES)
export const planningChangeSetStateSchema = z.enum(PLANNING_CHANGE_SET_STATES)

export const planningArtifactVersionReferenceSchema = z
  .object({
    id: identifierSchema,
    artifact_kind: planningArtifactKindSchema,
    version: z.number().int().positive(),
  })
  .strict()

export const planningAssumptionSchema = z
  .object({
    id: identifierSchema,
    statement: contentTextSchema,
  })
  .strict()

export const planningBlockerSchema = z
  .object({
    id: identifierSchema,
    statement: contentTextSchema,
  })
  .strict()

const architectureCapabilitySchema = z
  .object({
    id: identifierSchema,
    name: contentTextSchema,
    purpose: contentTextSchema,
    responsibilities: contentListSchema,
    boundaries: contentListSchema,
  })
  .strict()

const architectureConnectionSchema = z
  .object({
    from_capability_id: identifierSchema,
    to_capability_id: identifierSchema,
    description: contentTextSchema,
  })
  .strict()

const architectureFlowSchema = z
  .object({
    id: identifierSchema,
    actor: contentTextSchema,
    outcome: contentTextSchema,
    capability_ids: z.array(identifierSchema).min(1).max(50),
  })
  .strict()

export const architectureSnapshotContentSchema = z
  .object({
    objective: contentTextSchema,
    outcomes: contentListSchema,
    actors: contentListSchema,
    capabilities: z.array(architectureCapabilitySchema).min(1).max(100),
    connections: z.array(architectureConnectionSchema).max(500),
    important_flows: z.array(architectureFlowSchema).min(1).max(100),
    assumptions: z.array(planningAssumptionSchema).max(100),
    blockers: z.array(planningBlockerSchema).max(100),
  })
  .strict()
  .superRefine((content, ctx) => {
    const capabilityIds = new Set(content.capabilities.map((capability) => capability.id))

    if (capabilityIds.size !== content.capabilities.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'Capability IDs must be unique.',
      })
    }

    for (const [index, connection] of content.connections.entries()) {
      if (!capabilityIds.has(connection.from_capability_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['connections', index, 'from_capability_id'],
          message: 'Connection source must reference a capability in this Architecture snapshot.',
        })
      }
      if (!capabilityIds.has(connection.to_capability_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['connections', index, 'to_capability_id'],
          message: 'Connection target must reference a capability in this Architecture snapshot.',
        })
      }
    }

    for (const [index, flow] of content.important_flows.entries()) {
      for (const capabilityId of flow.capability_ids) {
        if (!capabilityIds.has(capabilityId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['important_flows', index, 'capability_ids'],
            message: 'Important flows must reference capabilities in this Architecture snapshot.',
          })
        }
      }
    }
  })

export const workPlanVerificationSchema = z
  .object({
    command: contentTextSchema,
    purpose: contentTextSchema.optional(),
  })
  .strict()

export const workPlanTargetsSchema = z
  .object({
    files: z.array(contentTextSchema).max(100),
    api: z.array(contentTextSchema).max(100),
    data: z.array(contentTextSchema).max(100),
  })
  .strict()

export const workPlanSliceSchema = z
  .object({
    id: identifierSchema,
    title: contentTextSchema,
    actor_or_trigger: contentTextSchema,
    observable_outcome: contentTextSchema,
    protected_invariant: contentTextSchema,
    dependencies: z.array(identifierSchema).max(100),
    source_capability_ids: z.array(identifierSchema).min(1).max(100),
    acceptance_criteria: contentListSchema,
    verification: z.array(workPlanVerificationSchema).min(1).max(50),
    likely_targets: workPlanTargetsSchema,
    risks: contentListSchema,
    rollback_notes: contentListSchema,
    assumption_ids: z.array(identifierSchema).max(100),
    unresolved_blocker_ids: z.array(identifierSchema).max(100),
  })
  .strict()

export const workPlanPhaseSchema = z
  .object({
    id: identifierSchema,
    title: contentTextSchema,
    objective: contentTextSchema,
    slice_ids: z.array(identifierSchema).min(1).max(100),
  })
  .strict()

function hasDependencyCycle(
  slices: readonly { id: string; dependencies: readonly string[] }[],
): boolean {
  const dependenciesBySlice = new Map(slices.map((slice) => [slice.id, slice.dependencies]))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (sliceId: string): boolean => {
    if (visiting.has(sliceId)) return true
    if (visited.has(sliceId)) return false

    visiting.add(sliceId)
    for (const dependencyId of dependenciesBySlice.get(sliceId) ?? []) {
      if (visit(dependencyId)) return true
    }
    visiting.delete(sliceId)
    visited.add(sliceId)
    return false
  }

  return slices.some((slice) => visit(slice.id))
}

export const workPlanContentSchema = z
  .object({
    source_architecture_version: planningArtifactVersionReferenceSchema,
    objective: contentTextSchema,
    non_goals: z.array(contentTextSchema).max(100),
    phases: z.array(workPlanPhaseSchema).min(1).max(100),
    slices: z.array(workPlanSliceSchema).min(1).max(500),
    assumptions: z.array(planningAssumptionSchema).max(100),
    unresolved_blockers: z.array(planningBlockerSchema).max(100),
  })
  .strict()
  .superRefine((content, ctx) => {
    if (content.source_architecture_version.artifact_kind !== 'architecture') {
      ctx.addIssue({
        code: 'custom',
        path: ['source_architecture_version', 'artifact_kind'],
        message: 'A Work Plan must name an Architecture version as its source.',
      })
    }

    const sliceIds = new Set(content.slices.map((slice) => slice.id))
    if (sliceIds.size !== content.slices.length) {
      ctx.addIssue({ code: 'custom', path: ['slices'], message: 'Slice IDs must be unique.' })
    }

    const phaseIds = new Set(content.phases.map((phase) => phase.id))
    if (phaseIds.size !== content.phases.length) {
      ctx.addIssue({ code: 'custom', path: ['phases'], message: 'Phase IDs must be unique.' })
    }

    const assumptionIds = new Set(content.assumptions.map((assumption) => assumption.id))
    const blockerIds = new Set(content.unresolved_blockers.map((blocker) => blocker.id))
    if (assumptionIds.size !== content.assumptions.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['assumptions'],
        message: 'Assumption IDs must be unique.',
      })
    }
    if (blockerIds.size !== content.unresolved_blockers.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['unresolved_blockers'],
        message: 'Blocker IDs must be unique.',
      })
    }

    for (const [index, slice] of content.slices.entries()) {
      for (const dependencyId of slice.dependencies) {
        if (dependencyId === slice.id || !sliceIds.has(dependencyId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['slices', index, 'dependencies'],
            message: 'Each dependency must reference another slice in this Work Plan.',
          })
        }
      }
      for (const assumptionId of slice.assumption_ids) {
        if (!assumptionIds.has(assumptionId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['slices', index, 'assumption_ids'],
            message: 'Each assumption reference must exist in this Work Plan.',
          })
        }
      }
      for (const blockerId of slice.unresolved_blocker_ids) {
        if (!blockerIds.has(blockerId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['slices', index, 'unresolved_blocker_ids'],
            message: 'Each blocker reference must exist in this Work Plan.',
          })
        }
      }
    }

    if (hasDependencyCycle(content.slices)) {
      ctx.addIssue({
        code: 'custom',
        path: ['slices'],
        message: 'Work Plan dependencies must be acyclic.',
      })
    }

    const phaseSliceIds = content.phases.flatMap((phase) => phase.slice_ids)
    const accountedSliceIds = new Set(phaseSliceIds)
    if (
      accountedSliceIds.size !== content.slices.length ||
      phaseSliceIds.length !== content.slices.length ||
      [...accountedSliceIds].some((sliceId) => !sliceIds.has(sliceId))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['phases'],
        message: 'Each Work Plan slice must appear exactly once in a phase.',
      })
    }
  })

const executionHandoffSliceSchema = z
  .object({
    id: identifierSchema,
    title: contentTextSchema,
    dependencies: z.array(identifierSchema).max(100),
    acceptance_criteria: contentListSchema,
    verification: z.array(workPlanVerificationSchema).min(1).max(50),
    risks: contentListSchema,
    rollback_notes: contentListSchema,
  })
  .strict()

const executionHandoffAuthorizationNotice =
  'This packet is for review, copy, or download only. It does not authorize or start implementation.' as const

export const executionHandoffContentSchema = z
  .object({
    source_architecture_version: planningArtifactVersionReferenceSchema,
    source_work_plan_version: planningArtifactVersionReferenceSchema,
    objective: contentTextSchema,
    non_goals: z.array(contentTextSchema).max(100),
    dependency_order: z.array(identifierSchema).min(1).max(500),
    slices: z.array(executionHandoffSliceSchema).min(1).max(500),
    assumptions: z.array(planningAssumptionSchema).max(100),
    unresolved_blockers: z.array(planningBlockerSchema).max(100),
    out_of_scope: z.array(contentTextSchema).max(100),
    authorization_notice: z.literal(executionHandoffAuthorizationNotice),
  })
  .strict()
  .superRefine((content, ctx) => {
    if (content.source_architecture_version.artifact_kind !== 'architecture') {
      ctx.addIssue({
        code: 'custom',
        path: ['source_architecture_version', 'artifact_kind'],
        message: 'An Execution Handoff must name an Architecture version.',
      })
    }
    if (content.source_work_plan_version.artifact_kind !== 'work_plan') {
      ctx.addIssue({
        code: 'custom',
        path: ['source_work_plan_version', 'artifact_kind'],
        message: 'An Execution Handoff must name a Work Plan version.',
      })
    }

    const sliceIds = new Set(content.slices.map((slice) => slice.id))
    const dependencyOrderIds = new Set(content.dependency_order)
    if (
      dependencyOrderIds.size !== content.dependency_order.length ||
      dependencyOrderIds.size !== sliceIds.size ||
      [...dependencyOrderIds].some((sliceId) => !sliceIds.has(sliceId))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['dependency_order'],
        message: 'Dependency order must name each included handoff slice exactly once.',
      })
    }

    const orderBySliceId = new Map(
      content.dependency_order.map((sliceId, index) => [sliceId, index]),
    )
    for (const [index, slice] of content.slices.entries()) {
      for (const dependencyId of slice.dependencies) {
        const dependencyOrder = orderBySliceId.get(dependencyId)
        const sliceOrder = orderBySliceId.get(slice.id)
        if (
          dependencyOrder === undefined ||
          sliceOrder === undefined ||
          dependencyOrder >= sliceOrder
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['slices', index, 'dependencies'],
            message: 'Dependencies must be included earlier in the handoff dependency order.',
          })
        }
      }
    }
  })
