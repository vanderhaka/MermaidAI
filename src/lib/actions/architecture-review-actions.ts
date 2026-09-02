'use server'

import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import { getUserWithDevAuth } from '@/lib/auth/dev-auth'
import { getActivePlanningArtifactVersion } from '@/lib/services/planning-artifact-service'
import { applyArchitectureCommand } from '@/lib/services/planning-command-service'
import {
  listPlanningDecisions,
  supersedePlanningDecision,
  transitionPlanningDecision,
} from '@/lib/services/planning-decision-service'
import { getPlanningState, setPlanningAutoDecide } from '@/lib/services/planning-state-service'
import { getProjectById } from '@/lib/services/project-service'
import { createClient } from '@/lib/supabase/server'
import type { ArchitectureSnapshotContent } from '@/types/planning'

const uuidSchema = z.uuid()
const requestBaseSchema = z
  .object({
    projectId: uuidSchema,
    architectureVersionId: uuidSchema,
    expectedRevision: z.number().int().nonnegative(),
    requestId: uuidSchema,
  })
  .strict()

const decisionActionSchema = requestBaseSchema
  .extend({
    action: z.enum(['accept', 'reject', 'edit', 'supersede']),
    decisionId: uuidSchema,
    reason: z.string().trim().min(1).max(2_000),
    statement: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const needsStatement = input.action === 'edit' || input.action === 'supersede'
    if (needsStatement && input.statement === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['statement'],
        message: `${input.action} requires a replacement statement.`,
      })
    }
    if (!needsStatement && input.statement !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['statement'],
        message: `${input.action} cannot include a replacement statement.`,
      })
    }
  })

const manualModuleSchema = requestBaseSchema
  .extend({ name: z.string().trim().min(1).max(100) })
  .strict()
const autoDecideSchema = z
  .object({
    projectId: uuidSchema,
    enabled: z.boolean(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict()

export type ArchitectureReviewActionReceipt = {
  changeSetId: string
  committedRevision: number
  replayed: boolean
}

export type ArchitectureReviewActionResult =
  | { success: true; receipt: ArchitectureReviewActionReceipt }
  | { success: false; error: string; conflict: boolean }

export type PlanningAutoDecideActionResult =
  | { success: true; enabled: boolean; expectedRevision: number }
  | { success: false; error: string }

type OwnedArchitecture = {
  userId: string
  projectName: string
}

type CurrentArchitecture = {
  content: ArchitectureSnapshotContent
}

function failure(error: string, conflict = false): ArchitectureReviewActionResult {
  return { success: false, error, conflict }
}

function isConflict(error: string): boolean {
  return /stale|revision|conflict|changed|already used|reused/i.test(error)
}

export async function commitPlanningAutoDecidePreference(
  input: unknown,
): Promise<PlanningAutoDecideActionResult> {
  const parsed = autoDecideSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid Auto-Decide preference: ${parsed.error.issues[0]?.message ?? 'unknown input'}`,
    }
  }

  const request = parsed.data
  const ownership = await requireOwnedArchitecture(request.projectId)
  if (!ownership.success) {
    return ownership.result.success
      ? { success: false, error: 'Project access could not be verified.' }
      : { success: false, error: ownership.result.error }
  }

  const result = await setPlanningAutoDecide(request)
  if (!result.success) return { success: false, error: result.error }
  if (
    result.data.project_id !== request.projectId ||
    result.data.auto_decide_enabled !== request.enabled ||
    result.data.write_safety_revision !== request.expectedRevision + 1
  ) {
    return { success: false, error: 'Auto-Decide receipt did not match the requested change.' }
  }

  return {
    success: true,
    enabled: result.data.auto_decide_enabled,
    expectedRevision: result.data.write_safety_revision,
  }
}

function deterministicUuid(requestId: string, label: string): string {
  const bytes = createHash('sha256').update(`${requestId}:${label}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function requireOwnedArchitecture(
  projectId: string,
): Promise<
  | { success: true; data: OwnedArchitecture }
  | { success: false; result: ArchitectureReviewActionResult }
> {
  const supabase = await createClient()
  const authResult = await getUserWithDevAuth(supabase)
  const user = authResult.data.user
  if (!user) {
    return { success: false, result: failure('Not authenticated.') }
  }

  const projectResult = await getProjectById(projectId)
  if (
    !projectResult.success ||
    projectResult.data.user_id !== user.id ||
    projectResult.data.mode !== 'architecture'
  ) {
    return { success: false, result: failure('Project access denied.') }
  }

  return {
    success: true,
    data: { userId: user.id, projectName: projectResult.data.name },
  }
}

async function requireCurrentArchitecture(input: {
  projectId: string
  architectureVersionId: string
  expectedRevision: number
}): Promise<
  | { success: true; data: CurrentArchitecture }
  | { success: false; result: ArchitectureReviewActionResult }
> {
  const [stateResult, versionResult] = await Promise.all([
    getPlanningState(input.projectId),
    getActivePlanningArtifactVersion(input.projectId, 'architecture'),
  ])
  if (!stateResult.success || stateResult.data === null) {
    return { success: false, result: failure('Architecture planning state is unavailable.') }
  }
  if (!versionResult.success || versionResult.data === null) {
    return { success: false, result: failure('The active Architecture version is unavailable.') }
  }

  const version = versionResult.data
  if (
    stateResult.data.write_safety_revision !== input.expectedRevision ||
    stateResult.data.active_architecture_artifact_id !== version.artifact_id ||
    version.id !== input.architectureVersionId ||
    version.project_id !== input.projectId
  ) {
    return {
      success: false,
      result: failure('Architecture changed. Refresh before reviewing this decision.', true),
    }
  }
  if (version.content_state !== 'complete') {
    return {
      success: false,
      result: failure('Generate the first Architecture map before adding a manual capability.'),
    }
  }

  return { success: true, data: { content: version.content } }
}

function compactReceipt(
  requestId: string,
  expectedRevision: number,
  receipt: {
    changeSetId: string
    committedRevision: number
    replayed: boolean
  },
): ArchitectureReviewActionResult {
  if (receipt.changeSetId !== requestId || receipt.committedRevision !== expectedRevision + 1) {
    return failure('Committed Architecture receipt did not match the review request.')
  }
  return {
    success: true,
    receipt: {
      changeSetId: receipt.changeSetId,
      committedRevision: receipt.committedRevision,
      replayed: receipt.replayed,
    },
  }
}

export async function commitPlanningDecisionAction(
  input: unknown,
): Promise<ArchitectureReviewActionResult> {
  const parsed = decisionActionSchema.safeParse(input)
  if (!parsed.success) {
    return failure(`Invalid Architecture decision action: ${parsed.error.issues[0]?.message}`)
  }
  const request = parsed.data
  const ownership = await requireOwnedArchitecture(request.projectId)
  if (!ownership.success) return ownership.result
  const current = await requireCurrentArchitecture(request)
  if (!current.success) return current.result

  const decisionsResult = await listPlanningDecisions(request.projectId)
  if (!decisionsResult.success) return failure(decisionsResult.error)
  const decision = decisionsResult.data.find((candidate) => candidate.id === request.decisionId)
  if (
    !decision ||
    decision.project_id !== request.projectId ||
    decision.artifact_version_id !== request.architectureVersionId
  ) {
    return failure('Decision is not part of the current Architecture version.', true)
  }

  const operationIds = [
    deterministicUuid(request.requestId, 'decision-operation-0'),
    deterministicUuid(request.requestId, 'decision-operation-1'),
  ]
  const actor = {
    type: 'user' as const,
    userId: ownership.data.userId,
    label: 'Project owner',
  }
  const actionPastTense = {
    accept: 'accepted',
    reject: 'rejected',
    edit: 'edited',
    supersede: 'superseded',
  }[request.action]
  const evidence = [
    {
      type: 'architecture_review',
      reference: `decision:${request.decisionId}`,
      summary: `Project owner ${actionPastTense} this decision in Architecture review.`,
    },
  ]

  if (request.action === 'accept' || request.action === 'reject') {
    if (decision.state !== 'proposed') {
      return failure(`Only a proposed decision can be ${request.action}ed.`, true)
    }
    const serviceResult = await transitionPlanningDecision({
      projectId: request.projectId,
      changeSetId: request.requestId,
      turnId: null,
      expectedRevision: request.expectedRevision,
      operationIds: [operationIds[0]],
      architectureContent: current.data.content,
      decision: { id: decision.id, state: decision.state },
      targetState: request.action === 'accept' ? 'accepted' : 'rejected',
      actor,
      reason: request.reason,
      evidence,
    })
    if (!serviceResult.success) return failure(serviceResult.error, isConflict(serviceResult.error))
    return compactReceipt(request.requestId, request.expectedRevision, serviceResult.data)
  }

  const requiredState = request.action === 'edit' ? ['proposed'] : ['accepted', 'rejected']
  if (!requiredState.includes(decision.state)) {
    return failure(`The ${decision.state} decision cannot be ${request.action}ed.`, true)
  }
  if (request.statement === decision.statement) {
    return failure('The replacement decision must change the statement.')
  }

  const serviceResult = await supersedePlanningDecision({
    projectId: request.projectId,
    changeSetId: request.requestId,
    turnId: null,
    expectedRevision: request.expectedRevision,
    operationIds,
    architectureContent: current.data.content,
    decision: { id: decision.id, state: decision.state },
    replacement: {
      id: deterministicUuid(request.requestId, 'decision-replacement'),
      category: decision.category,
      statement: request.statement!,
      provenance: 'user',
      readinessImpact: decision.readiness_impact,
    },
    actor,
    reason: request.reason,
    evidence,
  })
  if (!serviceResult.success) return failure(serviceResult.error, isConflict(serviceResult.error))
  return compactReceipt(request.requestId, request.expectedRevision, serviceResult.data)
}

export async function commitManualArchitectureModule(
  input: unknown,
): Promise<ArchitectureReviewActionResult> {
  const parsed = manualModuleSchema.safeParse(input)
  if (!parsed.success) {
    return failure(`Invalid manual Architecture capability: ${parsed.error.issues[0]?.message}`)
  }
  const request = parsed.data
  const ownership = await requireOwnedArchitecture(request.projectId)
  if (!ownership.success) return ownership.result
  const current = await requireCurrentArchitecture(request)
  if (!current.success) return current.result
  if (current.data.content.capabilities.length >= 100) {
    return failure('Architecture already contains the maximum of 100 capabilities.')
  }

  const moduleId = deterministicUuid(request.requestId, 'manual-module')
  const operationId = deterministicUuid(request.requestId, 'manual-module-operation')
  const blockerId = `manual-module-${moduleId}`
  const description = `Part of ${ownership.data.projectName}`
  const architectureContent: ArchitectureSnapshotContent = {
    ...current.data.content,
    capabilities: [
      ...current.data.content.capabilities,
      {
        id: moduleId,
        name: request.name,
        purpose: 'Purpose not defined yet.',
        responsibilities: ['Responsibilities not defined yet.'],
        boundaries: ['Boundaries not defined yet.'],
      },
    ],
    blockers: [
      ...current.data.content.blockers,
      {
        id: blockerId,
        statement: `Define the purpose, responsibilities, boundaries, and connections for ${request.name}.`,
      },
    ],
  }

  const serviceResult = await applyArchitectureCommand({
    projectId: request.projectId,
    changeSetId: request.requestId,
    turnId: null,
    expectedRevision: request.expectedRevision,
    operations: [
      {
        operationId,
        type: 'module.create',
        module: {
          id: moduleId,
          name: request.name,
          domain: null,
          description,
          position: { x: 0, y: 0 },
          color: '#111827',
          entryPoints: [],
          exitPoints: [],
        },
      },
    ],
    architectureContent,
  })
  if (!serviceResult.success) return failure(serviceResult.error, isConflict(serviceResult.error))
  return compactReceipt(request.requestId, request.expectedRevision, serviceResult.data)
}
