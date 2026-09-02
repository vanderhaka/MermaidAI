import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import { workPlanContentSchema } from '@/lib/schemas/planning'
import { workPlanEditCommandSchema } from '@/lib/services/planning-tools'
import {
  decodePlanningArtifactVersion,
  getPlanningContentHash,
  type CompletePlanningArtifactVersion,
} from '@/lib/services/planning-artifact-service'
import { createClient } from '@/lib/supabase/server'
import type { ChatMessage } from '@/types/chat'
import type { Json, Tables } from '@/types/database'

const uuidSchema = z.uuid()

const requestInputSchema = z
  .object({
    projectId: uuidSchema,
    expectedWorkPlanVersionId: uuidSchema,
    sourceArchitectureVersionId: uuidSchema,
    changeSetId: uuidSchema,
    turnId: uuidSchema,
    userMessageKey: uuidSchema,
    assistantMessageKey: uuidSchema,
    message: z.string().trim().min(1).max(20_000),
  })
  .strict()

// Hashing deliberately projects generated commit fields away. The public request
// boundary remains strict, while retries depend only on stable user-owned identity.
const requestHashInputSchema = z.object(requestInputSchema.shape)

const commitInputSchema = requestInputSchema.extend({
  content: workPlanContentSchema,
  assistantContent: z.string().trim().min(1).max(4_000),
  summary: z.string().trim().min(1).max(500),
  commands: z.array(workPlanEditCommandSchema).min(1).max(32),
})

const commitResultSchema = z
  .object({
    version: z.unknown(),
    assistant_message: z.unknown(),
    receipt: z.record(z.string(), z.unknown()),
  })
  .strict()

export type WorkPlanRevisionRequest = z.infer<typeof requestInputSchema>
export type CommitWorkPlanRevisionInput = z.infer<typeof commitInputSchema>

export type WorkPlanRevisionReceipt = {
  kind: 'work_plan_revision'
  changeSetId: string
  turnId: string
  projectId: string
  previousWorkPlanVersionId: string
  workPlanVersionId: string
  previousVersion: number
  committedVersion: number
  summary: string
  commands: unknown[]
  replayed: boolean
}

export type CommittedWorkPlanRevision = {
  version: CompletePlanningArtifactVersion<'work_plan'>
  assistantMessage: ChatMessage
  receipt: WorkPlanRevisionReceipt
}

export type WorkPlanRevisionServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    )
  }
  return typeof value === 'string' ? value.normalize('NFC') : value
}

function hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')
}

function requestPayload(request: WorkPlanRevisionRequest): Record<string, unknown> {
  return {
    projectId: request.projectId,
    expectedWorkPlanVersionId: request.expectedWorkPlanVersionId,
    sourceArchitectureVersionId: request.sourceArchitectureVersionId,
    changeSetId: request.changeSetId,
    turnId: request.turnId,
    userMessageKey: request.userMessageKey,
    assistantMessageKey: request.assistantMessageKey,
    message: request.message,
  }
}

export function getWorkPlanRevisionRequestHash(input: unknown): string {
  const request = requestHashInputSchema.parse(input)
  return hash(requestPayload(request))
}

const receiptSchema = z
  .object({
    kind: z.literal('work_plan_revision'),
    changeSetId: uuidSchema,
    turnId: uuidSchema,
    projectId: uuidSchema,
    previousWorkPlanVersionId: uuidSchema,
    workPlanVersionId: uuidSchema,
    previousVersion: z.number().int().positive(),
    committedVersion: z.number().int().positive(),
    summary: z.string().trim().min(1),
    commands: z.array(z.unknown()),
    replayed: z.boolean(),
  })
  .strict()

function decodeAssistantMessage(input: unknown): ChatMessage {
  const row = input as Tables<'chat_messages'>
  if (
    !row ||
    typeof row.id !== 'string' ||
    row.role !== 'assistant' ||
    typeof row.content !== 'string' ||
    typeof row.created_at !== 'string'
  ) {
    throw new Error('Invalid Work Plan assistant receipt returned by database')
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

function decodeCommittedResult(input: unknown): CommittedWorkPlanRevision {
  const parsed = commitResultSchema.parse(input)
  const version = decodePlanningArtifactVersion('work_plan', parsed.version)
  if (version.content_state !== 'complete') {
    throw new Error('Committed Work Plan revision cannot be a draft')
  }
  const receipt = receiptSchema.parse(parsed.receipt)
  const assistantMessage = decodeAssistantMessage(parsed.assistant_message)
  if (
    receipt.workPlanVersionId !== version.id ||
    assistantMessage.artifactVersionId !== version.id ||
    assistantMessage.changeSetId !== receipt.changeSetId
  ) {
    throw new Error('Work Plan revision receipt does not match the committed version')
  }
  return { version, assistantMessage, receipt }
}

export async function getCommittedWorkPlanRevision(
  input: unknown,
): Promise<WorkPlanRevisionServiceResult<CommittedWorkPlanRevision | null>> {
  const parsed = requestInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid Work Plan replay request: ${parsed.error.issues[0]?.message ?? 'unknown input'}`,
    }
  }
  const request = parsed.data
  const supabase = await createClient()
  const { data: artifact, error: artifactError } = await supabase
    .from('planning_artifacts')
    .select('id')
    .eq('project_id', request.projectId)
    .eq('kind', 'work_plan')
    .maybeSingle()
  if (artifactError) return { success: false, error: artifactError.message }
  if (!artifact) return { success: true, data: null }

  const { data: versionRow, error: versionError } = await supabase
    .from('planning_artifact_versions')
    .select('*')
    .eq('artifact_id', artifact.id)
    .eq('request_key', request.changeSetId)
    .maybeSingle()
  if (versionError) return { success: false, error: versionError.message }
  if (!versionRow) return { success: true, data: null }
  if (versionRow.request_hash !== getWorkPlanRevisionRequestHash(request)) {
    return { success: false, error: 'Work Plan change-set ID was reused with different input.' }
  }

  const { data: assistantRow, error: assistantError } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('project_id', request.projectId)
    .eq('change_set_id', request.changeSetId)
    .eq('message_key', request.assistantMessageKey)
    .eq('role', 'assistant')
    .maybeSingle()
  if (assistantError) return { success: false, error: assistantError.message }
  if (!assistantRow) {
    return { success: false, error: 'Committed Work Plan receipt is incomplete.' }
  }

  try {
    const metadata = assistantRow.metadata
    const receiptValue =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>).work_plan_receipt
        : null
    return {
      success: true,
      data: decodeCommittedResult({
        version: versionRow,
        assistant_message: assistantRow,
        receipt: receiptValue,
      }),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid committed Work Plan revision',
    }
  }
}

export async function commitWorkPlanRevision(
  input: unknown,
): Promise<WorkPlanRevisionServiceResult<CommittedWorkPlanRevision>> {
  const parsed = commitInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid Work Plan revision: ${parsed.error.issues[0]?.message ?? 'unknown input'}`,
    }
  }
  const value = parsed.data
  const request = requestInputSchema.parse(requestPayload(value))
  const requestHash = getWorkPlanRevisionRequestHash(request)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('commit_work_plan_revision', {
    p_project_id: value.projectId,
    p_expected_work_plan_version_id: value.expectedWorkPlanVersionId,
    p_source_architecture_version_id: value.sourceArchitectureVersionId,
    p_change_set_id: value.changeSetId,
    p_turn_id: value.turnId,
    p_request_hash: requestHash,
    p_request_payload: requestPayload(request) as Json,
    p_content: value.content as unknown as Json,
    p_content_hash: getPlanningContentHash('work_plan', value.content),
    p_assistant_message_key: value.assistantMessageKey,
    p_assistant_content: value.assistantContent,
    p_summary: value.summary,
    p_commands: value.commands as unknown as Json,
  })
  if (error) return { success: false, error: error.message }

  try {
    return { success: true, data: decodeCommittedResult(data) }
  } catch (decodeError) {
    return {
      success: false,
      error:
        decodeError instanceof Error
          ? decodeError.message
          : 'Invalid Work Plan revision returned by database',
    }
  }
}
