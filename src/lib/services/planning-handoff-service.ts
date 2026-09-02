import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import {
  decodePlanningArtifactVersion,
  getPlanningContentHash,
  type CompletePlanningArtifactVersion,
} from '@/lib/services/planning-artifact-service'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import type { PlanningArtifactKind } from '@/types/planning'

const uuidSchema = z.uuid()
const targetKindSchema = z.enum(['work_plan', 'execution_handoff'])
const jobStateSchema = z.enum(['pending', 'running', 'complete', 'failed'])

const planningHandoffJobSchema = z
  .object({
    id: uuidSchema,
    project_id: uuidSchema,
    source_version_id: uuidSchema,
    target_artifact_id: uuidSchema,
    request_key: uuidSchema,
    request_hash: z.string().trim().min(1),
    state: jobStateSchema,
    attempt_count: z.number().int().nonnegative(),
    claimed_at: z.string().nullable(),
    claim_expires_at: z.string().nullable(),
    claim_token: uuidSchema.nullable(),
    completed_version_id: uuidSchema.nullable(),
    error_code: z.string().nullable(),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
  })
  .strict()

const beginResultSchema = z.object({ job: planningHandoffJobSchema }).strict()
const claimResultSchema = z
  .object({
    outcome: z.enum(['claimed', 'busy', 'complete']),
    job: planningHandoffJobSchema,
  })
  .strict()
const completeResultSchema = z
  .object({ job: planningHandoffJobSchema, version: z.unknown() })
  .strict()

export type PlanningHandoffJob = z.infer<typeof planningHandoffJobSchema>
export type PlanningHandoffTarget = z.infer<typeof targetKindSchema>
export type PlanningHandoffClaim = z.infer<typeof claimResultSchema>
export type PlanningHandoffServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

type BeginPlanningHandoffInput = {
  projectId: string
  sourceVersionId: string
  targetKind: PlanningHandoffTarget
  requestKey: string
}

type CompletePlanningHandoffInput<K extends PlanningHandoffTarget> = {
  projectId: string
  jobId: string
  claimToken: string
  targetKind: K
  content: unknown
  renderedMarkdown?: string | null
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function getPlanningHandoffRequestHash(input: {
  sourceVersionId: string
  targetKind: PlanningHandoffTarget
}): string {
  return stableHash({ sourceVersionId: input.sourceVersionId, targetKind: input.targetKind })
}

function invalidIdentity(...values: string[]): boolean {
  return values.some((value) => !uuidSchema.safeParse(value).success)
}

function parseJobResult(
  input: unknown,
  label: string,
): PlanningHandoffServiceResult<PlanningHandoffJob> {
  const parsed = beginResultSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: `Invalid ${label} handoff receipt` }
  }
  return { success: true, data: parsed.data.job }
}

export async function beginPlanningHandoff(
  input: BeginPlanningHandoffInput,
): Promise<PlanningHandoffServiceResult<PlanningHandoffJob>> {
  const targetKind = targetKindSchema.safeParse(input.targetKind)
  if (
    !targetKind.success ||
    invalidIdentity(input.projectId, input.sourceVersionId, input.requestKey)
  ) {
    return { success: false, error: 'Invalid planning handoff request' }
  }

  const requestHash = getPlanningHandoffRequestHash({
    sourceVersionId: input.sourceVersionId,
    targetKind: targetKind.data,
  })
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('begin_planning_handoff', {
    p_project_id: input.projectId,
    p_source_version_id: input.sourceVersionId,
    p_target_kind: targetKind.data,
    p_request_key: input.requestKey,
    p_request_hash: requestHash,
  })
  if (error) return { success: false, error: error.message }
  return parseJobResult(data, 'begin')
}

export async function claimPlanningHandoff(input: {
  projectId: string
  jobId: string
  leaseSeconds?: number
}): Promise<PlanningHandoffServiceResult<PlanningHandoffClaim>> {
  if (invalidIdentity(input.projectId, input.jobId)) {
    return { success: false, error: 'Invalid planning handoff identity' }
  }
  const leaseSeconds = input.leaseSeconds ?? 120
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 600) {
    return { success: false, error: 'Invalid planning handoff lease' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('claim_planning_handoff', {
    p_project_id: input.projectId,
    p_job_id: input.jobId,
    p_lease_seconds: leaseSeconds,
  })
  if (error) return { success: false, error: error.message }
  const parsed = claimResultSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Invalid claim handoff receipt' }
  if (parsed.data.outcome === 'claimed' && parsed.data.job.claim_token === null) {
    return { success: false, error: 'Claimed handoff did not return a lease token' }
  }
  return { success: true, data: parsed.data }
}

export async function completePlanningHandoff<K extends PlanningHandoffTarget>(
  input: CompletePlanningHandoffInput<K>,
): Promise<PlanningHandoffServiceResult<CompletePlanningArtifactVersion<K>>> {
  const targetKind = targetKindSchema.safeParse(input.targetKind)
  if (!targetKind.success || invalidIdentity(input.projectId, input.jobId, input.claimToken)) {
    return { success: false, error: 'Invalid planning handoff completion' }
  }

  let contentHash: string
  try {
    contentHash = getPlanningContentHash(targetKind.data, input.content)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid planning handoff output',
    }
  }
  const versionRequestHash = stableHash({
    targetKind: targetKind.data,
    contentHash,
    renderedMarkdown: input.renderedMarkdown ?? null,
  })

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('complete_planning_handoff', {
    p_project_id: input.projectId,
    p_job_id: input.jobId,
    p_claim_token: input.claimToken,
    p_content: input.content as Json,
    p_content_hash: contentHash,
    p_version_request_hash: versionRequestHash,
    p_rendered_markdown: input.renderedMarkdown ?? null,
  })
  if (error) return { success: false, error: error.message }

  const parsed = completeResultSchema.safeParse(data)
  if (!parsed.success || parsed.data.job.state !== 'complete') {
    return { success: false, error: 'Invalid complete handoff receipt' }
  }
  try {
    const version = decodePlanningArtifactVersion(targetKind.data, parsed.data.version)
    if (
      version.content_state !== 'complete' ||
      version.id !== parsed.data.job.completed_version_id ||
      version.project_id !== input.projectId ||
      version.content_hash !== contentHash
    ) {
      return { success: false, error: 'Completed handoff version did not match the request' }
    }
    return { success: true, data: version as CompletePlanningArtifactVersion<K> }
  } catch (decodeError) {
    return {
      success: false,
      error:
        decodeError instanceof Error ? decodeError.message : 'Invalid completed handoff version',
    }
  }
}

export async function failPlanningHandoff(input: {
  projectId: string
  jobId: string
  claimToken: string
  errorCode: string
}): Promise<PlanningHandoffServiceResult<PlanningHandoffJob>> {
  if (invalidIdentity(input.projectId, input.jobId, input.claimToken)) {
    return { success: false, error: 'Invalid planning handoff failure receipt' }
  }
  const errorCode = input.errorCode.trim() || 'generation_failed'
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fail_planning_handoff', {
    p_project_id: input.projectId,
    p_job_id: input.jobId,
    p_claim_token: input.claimToken,
    p_error_code: errorCode.slice(0, 120),
  })
  if (error) return { success: false, error: error.message }
  const parsed = planningHandoffJobSchema.safeParse(data)
  if (!parsed.success || parsed.data.state !== 'failed') {
    return { success: false, error: 'Invalid failed handoff receipt' }
  }
  return { success: true, data: parsed.data }
}

export function targetKindForStage(stage: PlanningArtifactKind): PlanningHandoffTarget | null {
  return stage === 'work_plan' || stage === 'execution_handoff' ? stage : null
}
