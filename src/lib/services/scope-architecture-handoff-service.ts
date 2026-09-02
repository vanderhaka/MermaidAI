import 'server-only'

import { z } from 'zod'

import { architectureCommandSchema, type ArchitectureCommand } from '@/lib/schemas/planning-command'
import {
  decodePlanningArtifactVersion,
  getPlanningContentHash,
  type CompletePlanningArtifactVersion,
} from '@/lib/services/planning-artifact-service'
import {
  architectureCommandReceiptSchema,
  getArchitectureCommandRequestHash,
  type ArchitectureCommandReceipt,
} from '@/lib/services/planning-command-service'
import {
  scopeHandoffSnapshotSchema,
  type ScopeHandoffSnapshot,
} from '@/lib/services/scope-architecture-generator'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'

const uuidSchema = z.uuid()
const jobStateSchema = z.enum(['pending', 'running', 'complete', 'failed'])

const scopeArchitectureHandoffJobSchema = z
  .object({
    id: uuidSchema,
    project_id: uuidSchema,
    request_key: uuidSchema,
    request_hash: z.string().trim().min(1),
    source_hash: z.string().trim().min(1),
    source_snapshot: scopeHandoffSnapshotSchema,
    state: jobStateSchema,
    attempt_count: z.number().int().nonnegative(),
    claimed_at: z.string().nullable(),
    claim_expires_at: z.string().nullable(),
    claim_token: uuidSchema.nullable(),
    change_set_id: uuidSchema,
    completed_version_id: uuidSchema.nullable(),
    error_code: z.string().nullable(),
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
  })
  .strict()

const beginResultSchema = z.object({ job: scopeArchitectureHandoffJobSchema }).strict()
const claimResultSchema = z
  .object({
    outcome: z.enum(['claimed', 'busy', 'complete']),
    job: scopeArchitectureHandoffJobSchema,
  })
  .strict()
const completeResultSchema = z
  .object({
    job: scopeArchitectureHandoffJobSchema,
    version: z.unknown(),
    receipt: architectureCommandReceiptSchema,
  })
  .strict()

export type ScopeArchitectureHandoffJob = Omit<
  z.infer<typeof scopeArchitectureHandoffJobSchema>,
  'source_snapshot'
> & { source_snapshot: ScopeHandoffSnapshot }
export type ScopeArchitectureHandoffClaim = z.infer<typeof claimResultSchema>
export type ScopeArchitectureHandoffCompletion = {
  job: ScopeArchitectureHandoffJob
  version: CompletePlanningArtifactVersion<'architecture'>
  receipt: ArchitectureCommandReceipt
}
export type ScopeArchitectureHandoffServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

function invalidIdentity(...values: string[]): boolean {
  return values.some((value) => !uuidSchema.safeParse(value).success)
}

export async function beginScopeArchitectureHandoff(input: {
  projectId: string
  requestKey: string
}): Promise<ScopeArchitectureHandoffServiceResult<ScopeArchitectureHandoffJob>> {
  if (invalidIdentity(input.projectId, input.requestKey)) {
    return { success: false, error: 'Invalid Quick Capture handoff request.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('begin_scope_architecture_handoff', {
    p_project_id: input.projectId,
    p_request_key: input.requestKey,
  })
  if (error) return { success: false, error: error.message }

  const parsed = beginResultSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Invalid Quick Capture handoff receipt.' }
  return { success: true, data: parsed.data.job }
}

export async function getResumableScopeArchitectureHandoff(
  projectId: string,
): Promise<ScopeArchitectureHandoffServiceResult<ScopeArchitectureHandoffJob | null>> {
  if (invalidIdentity(projectId)) {
    return { success: false, error: 'Invalid Quick Capture handoff project.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scope_architecture_handoff_jobs')
    .select('*')
    .eq('project_id', projectId)
    .in('state', ['pending', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { success: false, error: error.message }
  if (!data) return { success: true, data: null }

  const parsed = scopeArchitectureHandoffJobSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Invalid resumable handoff job.' }
  return { success: true, data: parsed.data }
}

export async function claimScopeArchitectureHandoff(input: {
  projectId: string
  jobId: string
  leaseSeconds?: number
}): Promise<ScopeArchitectureHandoffServiceResult<ScopeArchitectureHandoffClaim>> {
  if (invalidIdentity(input.projectId, input.jobId)) {
    return { success: false, error: 'Invalid Quick Capture handoff identity.' }
  }
  const leaseSeconds = input.leaseSeconds ?? 120
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 600) {
    return { success: false, error: 'Invalid Quick Capture handoff lease.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('claim_scope_architecture_handoff', {
    p_project_id: input.projectId,
    p_job_id: input.jobId,
    p_lease_seconds: leaseSeconds,
  })
  if (error) return { success: false, error: error.message }

  const parsed = claimResultSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: 'Invalid Quick Capture claim receipt.' }
  if (parsed.data.outcome === 'claimed' && parsed.data.job.claim_token === null) {
    return { success: false, error: 'Claimed Quick Capture handoff has no lease token.' }
  }
  return { success: true, data: parsed.data }
}

export async function completeScopeArchitectureHandoff(input: {
  projectId: string
  jobId: string
  claimToken: string
  command: ArchitectureCommand
}): Promise<ScopeArchitectureHandoffServiceResult<ScopeArchitectureHandoffCompletion>> {
  if (invalidIdentity(input.projectId, input.jobId, input.claimToken)) {
    return { success: false, error: 'Invalid Quick Capture handoff completion.' }
  }
  const command = architectureCommandSchema.safeParse(input.command)
  if (
    !command.success ||
    command.data.projectId !== input.projectId ||
    command.data.architectureContent === undefined
  ) {
    return { success: false, error: 'Invalid Quick Capture Architecture command.' }
  }

  const commandRequestHash = getArchitectureCommandRequestHash(command.data)
  const contentHash = getPlanningContentHash('architecture', command.data.architectureContent)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('complete_scope_architecture_handoff', {
    p_project_id: input.projectId,
    p_job_id: input.jobId,
    p_claim_token: input.claimToken,
    p_command_request_hash: commandRequestHash,
    p_operations: command.data.operations as unknown as Json,
    p_architecture_content: command.data.architectureContent as unknown as Json,
    p_architecture_content_hash: contentHash,
  })
  if (error) return { success: false, error: error.message }

  const parsed = completeResultSchema.safeParse(data)
  if (!parsed.success || parsed.data.job.state !== 'complete') {
    return { success: false, error: 'Invalid completed Quick Capture handoff receipt.' }
  }

  try {
    const version = decodePlanningArtifactVersion('architecture', parsed.data.version)
    if (
      version.content_state !== 'complete' ||
      version.id !== parsed.data.job.completed_version_id ||
      version.project_id !== input.projectId ||
      version.content_hash !== contentHash ||
      parsed.data.receipt.changeSetId !== command.data.changeSetId ||
      parsed.data.receipt.architectureVersionId !== version.id ||
      parsed.data.receipt.committedRevision !== command.data.expectedRevision + 1
    ) {
      return { success: false, error: 'Completed Quick Capture handoff did not match its source.' }
    }
    return {
      success: true,
      data: { job: parsed.data.job, version, receipt: parsed.data.receipt },
    }
  } catch (decodeError) {
    return {
      success: false,
      error:
        decodeError instanceof Error
          ? decodeError.message
          : 'Invalid completed Quick Capture Architecture.',
    }
  }
}

export async function failScopeArchitectureHandoff(input: {
  projectId: string
  jobId: string
  claimToken: string
  errorCode: string
}): Promise<ScopeArchitectureHandoffServiceResult<ScopeArchitectureHandoffJob>> {
  if (invalidIdentity(input.projectId, input.jobId, input.claimToken)) {
    return { success: false, error: 'Invalid Quick Capture handoff failure receipt.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fail_scope_architecture_handoff', {
    p_project_id: input.projectId,
    p_job_id: input.jobId,
    p_claim_token: input.claimToken,
    p_error_code: input.errorCode.trim().slice(0, 120) || 'generation_failed',
  })
  if (error) return { success: false, error: error.message }

  const parsed = scopeArchitectureHandoffJobSchema.safeParse(data)
  if (!parsed.success || parsed.data.state !== 'failed') {
    return { success: false, error: 'Invalid failed Quick Capture handoff receipt.' }
  }
  return { success: true, data: parsed.data }
}
