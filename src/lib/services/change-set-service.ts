'use server'

import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import {
  decodePlanningArtifactVersion,
  type CompletePlanningArtifactVersion,
} from '@/lib/services/planning-artifact-service'
import {
  readArchitectureChangeSummary,
  summarizeArchitectureOperations,
} from '@/lib/planning/architecture-change-summary'
import { createClient } from '@/lib/supabase/server'
import type { ArchitectureChangeSummary } from '@/types/chat'
import type { ChatMessage } from '@/types/chat'
import type { Tables } from '@/types/database'

const uuidSchema = z.uuid()
const CHAT_CHANGE_SET_RECOVERY_AGE_MS = 5 * 60 * 1000

const undoArchitectureChangeSetInputSchema = z
  .object({
    projectId: uuidSchema,
    targetChangeSetId: uuidSchema,
    undoChangeSetId: uuidSchema,
  })
  .strict()
  .refine((input) => input.targetChangeSetId !== input.undoChangeSetId, {
    path: ['undoChangeSetId'],
    message: 'Undo change set ID must be different from its target.',
  })

const architectureUndoReceiptSchema = z
  .object({
    changeSetId: uuidSchema,
    targetChangeSetId: uuidSchema,
    projectId: uuidSchema,
    expectedRevision: z.number().int().nonnegative(),
    committedRevision: z.number().int().positive(),
    restoredArchitectureVersionId: uuidSchema.nullable(),
    restoredOperations: z.number().int().nonnegative(),
    replayed: z.boolean(),
  })
  .strict()

export type ArchitectureUndoReceipt = z.infer<typeof architectureUndoReceiptSchema>

const workPlanUndoReceiptSchema = z
  .object({
    kind: z.literal('work_plan_undo'),
    changeSetId: uuidSchema,
    targetChangeSetId: uuidSchema,
    projectId: uuidSchema,
    expectedWorkPlanVersionId: uuidSchema,
    restoredWorkPlanVersionId: uuidSchema,
    expectedVersion: z.number().int().positive(),
    restoredVersion: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict()

const workPlanUndoResultSchema = z
  .object({
    version: z.unknown(),
    assistant_message: z.unknown(),
    receipt: z.unknown(),
  })
  .strict()

export type WorkPlanUndoReceipt = z.infer<typeof workPlanUndoReceiptSchema>

export type CommittedWorkPlanUndo = {
  version: CompletePlanningArtifactVersion<'work_plan'>
  assistantMessage: ChatMessage
  receipt: WorkPlanUndoReceipt
}

export type ChangeSetServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

const finalizeChatChangeSetInputSchema = z
  .object({
    projectId: uuidSchema,
    turnId: uuidSchema,
    changeSetId: uuidSchema,
    state: z.enum(['completed', 'partial']),
  })
  .strict()

const committedChatRetryInputSchema = z
  .object({
    projectId: uuidSchema,
    turnId: uuidSchema,
    changeSetId: uuidSchema,
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict()

export type CommittedChatChangeSet = {
  id: string
  committedRevision: number
  artifactVersionId: string | null
  changeSummary: ArchitectureChangeSummary | null
  completedAssistant: {
    content: string
    artifactVersionId: string | null
    metadata: unknown
  } | null
}

export async function getCommittedChatChangeSetForRetry(
  input: unknown,
): Promise<ChangeSetServiceResult<CommittedChatChangeSet | null>> {
  const inputResult = committedChatRetryInputSchema.safeParse(input)
  if (!inputResult.success) {
    return {
      success: false,
      error: `Invalid committed chat Retry lookup: ${inputResult.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  const request = inputResult.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('planning_change_sets')
    .select(
      'id, state, expected_revision, committed_revision, committed_architecture_version_id, committed_at, receipt',
    )
    .eq('id', request.changeSetId)
    .eq('project_id', request.projectId)
    .eq('turn_id', request.turnId)
    .eq('expected_revision', request.expectedRevision)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (
    !data ||
    (data.state !== 'completed' && data.state !== 'partial') ||
    data.committed_at === null ||
    data.committed_revision !== request.expectedRevision + 1
  ) {
    return { success: true, data: null }
  }

  const { data: completedAssistant, error: assistantError } = await supabase
    .from('chat_messages')
    .select('content, artifact_version_id, metadata')
    .eq('project_id', request.projectId)
    .eq('turn_id', request.turnId)
    .eq('change_set_id', request.changeSetId)
    .eq('role', 'assistant')
    .eq('metadata->>turn_status', 'completed')
    .maybeSingle()

  if (assistantError) return { success: false, error: assistantError.message }

  const matchingAssistant =
    completedAssistant &&
    completedAssistant.artifact_version_id === data.committed_architecture_version_id
      ? {
          content: completedAssistant.content,
          artifactVersionId: completedAssistant.artifact_version_id,
          metadata: completedAssistant.metadata,
        }
      : null

  return {
    success: true,
    data: {
      id: data.id,
      committedRevision: data.committed_revision,
      artifactVersionId: data.committed_architecture_version_id,
      changeSummary:
        readArchitectureChangeSummary(matchingAssistant?.metadata) ??
        summarizeArchitectureOperations(data.receipt),
      completedAssistant: matchingAssistant,
    },
  }
}

export async function finalizeChatChangeSet(
  input: unknown,
): Promise<ChangeSetServiceResult<{ id: string; state: string }>> {
  const inputResult = finalizeChatChangeSetInputSchema.safeParse(input)
  if (!inputResult.success) {
    return {
      success: false,
      error: `Invalid chat change-set finalization: ${inputResult.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  const request = inputResult.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('planning_change_sets')
    .update({ state: request.state })
    .eq('id', request.changeSetId)
    .eq('project_id', request.projectId)
    .eq('turn_id', request.turnId)
    .in('state', ['completed', 'partial'])
    .not('committed_at', 'is', null)
    .select('id, state')
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) {
    return {
      success: false,
      error: 'Committed chat change set was not found for the exact project and turn.',
    }
  }
  return { success: true, data }
}

export async function recoverAbandonedChatChangeSets(
  projectId: string,
  options: { now?: Date; safeAgeMs?: number } = {},
): Promise<ChangeSetServiceResult<{ recoveredChangeSetIds: string[] }>> {
  const projectResult = uuidSchema.safeParse(projectId)
  if (!projectResult.success) {
    return { success: false, error: 'Invalid project ID for chat change-set recovery.' }
  }

  const now = options.now ?? new Date()
  const safeAgeMs = options.safeAgeMs ?? CHAT_CHANGE_SET_RECOVERY_AGE_MS
  if (!Number.isFinite(safeAgeMs) || safeAgeMs < 0 || Number.isNaN(now.getTime())) {
    return { success: false, error: 'Invalid chat change-set recovery window.' }
  }

  const cutoff = new Date(now.getTime() - safeAgeMs).toISOString()
  const supabase = await createClient()
  const { data: candidates, error: candidateError } = await supabase
    .from('planning_change_sets')
    .select('id, turn_id, committed_at')
    .eq('project_id', projectResult.data)
    .eq('state', 'completed')
    .not('turn_id', 'is', null)
    .not('committed_at', 'is', null)
    .lt('committed_at', cutoff)
    .limit(100)

  if (candidateError) return { success: false, error: candidateError.message }

  const recoveredChangeSetIds: string[] = []
  for (const candidate of candidates ?? []) {
    if (!candidate.turn_id || !candidate.committed_at) continue

    const { data: finalizedAssistants, error: assistantError } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('project_id', projectResult.data)
      .eq('turn_id', candidate.turn_id)
      .eq('change_set_id', candidate.id)
      .eq('role', 'assistant')
      .eq('metadata->>turn_status', 'completed')
      .limit(1)

    if (assistantError) return { success: false, error: assistantError.message }
    if ((finalizedAssistants?.length ?? 0) > 0) continue

    const { data: recovered, error: recoveryError } = await supabase
      .from('planning_change_sets')
      .update({ state: 'partial' })
      .eq('id', candidate.id)
      .eq('project_id', projectResult.data)
      .eq('turn_id', candidate.turn_id)
      .eq('state', 'completed')
      .eq('committed_at', candidate.committed_at)
      .select('id')
      .maybeSingle()

    if (recoveryError) return { success: false, error: recoveryError.message }
    if (recovered) recoveredChangeSetIds.push(candidate.id)
  }

  return { success: true, data: { recoveredChangeSetIds } }
}

function hashUndoRequest(input: z.infer<typeof undoArchitectureChangeSetInputSchema>): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        projectId: input.projectId,
        targetChangeSetId: input.targetChangeSetId,
        undoChangeSetId: input.undoChangeSetId,
      }),
    )
    .digest('hex')
}

function decodeWorkPlanUndoAssistant(input: unknown): ChatMessage {
  const row = input as Tables<'chat_messages'>
  if (
    !row ||
    typeof row.id !== 'string' ||
    row.role !== 'assistant' ||
    typeof row.content !== 'string' ||
    typeof row.created_at !== 'string'
  ) {
    throw new Error('Invalid Work Plan undo assistant receipt returned by database')
  }
  return {
    id: row.id,
    role: 'assistant',
    content: row.content,
    operations: [],
    createdAt: row.created_at,
    turnId: row.turn_id,
    messageKey: row.message_key,
    planningStage: 'work_plan',
    artifactId: row.artifact_id,
    artifactVersionId: row.artifact_version_id,
    changeSetId: row.change_set_id,
    metadata: row.metadata as ChatMessage['metadata'],
  }
}

function decodeWorkPlanUndoResult(input: unknown): CommittedWorkPlanUndo {
  const parsed = workPlanUndoResultSchema.parse(input)
  const version = decodePlanningArtifactVersion('work_plan', parsed.version)
  if (version.content_state !== 'complete') {
    throw new Error('A Work Plan undo cannot restore a draft version')
  }
  const assistantMessage = decodeWorkPlanUndoAssistant(parsed.assistant_message)
  const receipt = workPlanUndoReceiptSchema.parse(parsed.receipt)
  if (
    version.id !== receipt.restoredWorkPlanVersionId ||
    version.version !== receipt.restoredVersion ||
    assistantMessage.changeSetId !== receipt.changeSetId ||
    assistantMessage.artifactVersionId !== version.id
  ) {
    throw new Error('Work Plan undo receipt does not match the restored version')
  }
  return { version, assistantMessage, receipt }
}

export async function undoLatestArchitectureChangeSet(
  input: unknown,
): Promise<ChangeSetServiceResult<ArchitectureUndoReceipt>> {
  const inputResult = undoArchitectureChangeSetInputSchema.safeParse(input)
  if (!inputResult.success) {
    return {
      success: false,
      error: `Invalid Architecture undo request: ${inputResult.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  const request = inputResult.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('undo_latest_architecture_change_set', {
    p_project_id: request.projectId,
    p_target_change_set_id: request.targetChangeSetId,
    p_undo_change_set_id: request.undoChangeSetId,
    p_request_hash: hashUndoRequest(request),
  })

  if (error) return { success: false, error: error.message }

  const receiptResult = architectureUndoReceiptSchema.safeParse(data)
  if (!receiptResult.success) {
    return {
      success: false,
      error: `Invalid Architecture undo receipt: ${receiptResult.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  const receipt = receiptResult.data
  if (
    receipt.projectId !== request.projectId ||
    receipt.changeSetId !== request.undoChangeSetId ||
    receipt.targetChangeSetId !== request.targetChangeSetId ||
    receipt.committedRevision !== receipt.expectedRevision + 1
  ) {
    return {
      success: false,
      error: 'Invalid Architecture undo receipt: request identity mismatch.',
    }
  }

  return { success: true, data: receipt }
}

export async function undoLatestWorkPlanChangeSet(
  input: unknown,
): Promise<ChangeSetServiceResult<CommittedWorkPlanUndo>> {
  const inputResult = undoArchitectureChangeSetInputSchema.safeParse(input)
  if (!inputResult.success) {
    return {
      success: false,
      error: `Invalid Work Plan undo request: ${inputResult.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  const request = inputResult.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('undo_latest_work_plan_change_set', {
    p_project_id: request.projectId,
    p_target_change_set_id: request.targetChangeSetId,
    p_undo_change_set_id: request.undoChangeSetId,
    p_request_hash: hashUndoRequest(request),
  })
  if (error) return { success: false, error: error.message }

  try {
    const decoded = decodeWorkPlanUndoResult(data)
    if (
      decoded.receipt.projectId !== request.projectId ||
      decoded.receipt.changeSetId !== request.undoChangeSetId ||
      decoded.receipt.targetChangeSetId !== request.targetChangeSetId
    ) {
      return { success: false, error: 'Invalid Work Plan undo receipt: request identity mismatch.' }
    }
    return { success: true, data: decoded }
  } catch (decodeError) {
    return {
      success: false,
      error:
        decodeError instanceof Error
          ? `Invalid Work Plan undo receipt: ${decodeError.message}`
          : 'Invalid Work Plan undo receipt returned by database.',
    }
  }
}
