import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import {
  architectureCommandSchema,
  getArchitectureOperationClassification,
  type ArchitectureCommand,
} from '@/lib/schemas/planning-command'
import { getPlanningContentHash } from '@/lib/services/planning-artifact-service'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'

const uuidSchema = z.uuid()

const committedOperationSchema = z
  .object({
    operationId: uuidSchema,
    sequence: z.number().int().nonnegative(),
    type: z.string().trim().min(1),
    semantic: z.boolean(),
    before: z.unknown(),
    after: z.unknown(),
  })
  .strict()

const planningInputLinkSchema = z
  .object({
    id: uuidSchema,
    artifactVersionId: uuidSchema.nullable(),
  })
  .strict()

export const architectureCommandReceiptSchema = z
  .object({
    changeSetId: uuidSchema,
    projectId: uuidSchema,
    expectedRevision: z.number().int().nonnegative(),
    committedRevision: z.number().int().positive(),
    semantic: z.boolean(),
    previousArchitectureVersionId: uuidSchema.nullable(),
    architectureVersionId: uuidSchema.nullable(),
    operations: z.array(committedOperationSchema),
    summary: z.record(z.string(), z.unknown()),
    planningInputLinksBefore: z
      .object({
        decisions: z.array(planningInputLinkSchema),
        questions: z.array(planningInputLinkSchema),
      })
      .strict()
      .optional(),
    replayed: z.boolean(),
  })
  .strict()

export type ArchitectureCommandReceipt = z.infer<typeof architectureCommandReceiptSchema>

export type PlanningCommandServiceResult<T> =
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
  if (typeof value === 'string') return value.normalize('NFC')
  return value
}

function hashCanonicalValue(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')
}

export function getArchitectureCommandRequestHash(input: unknown): string {
  return hashCanonicalValue(architectureCommandSchema.parse(input))
}

function validateReceiptMatchesCommand(
  command: ArchitectureCommand,
  receipt: ArchitectureCommandReceipt,
): string | null {
  if (
    receipt.projectId !== command.projectId ||
    receipt.changeSetId !== command.changeSetId ||
    receipt.expectedRevision !== command.expectedRevision ||
    receipt.committedRevision !== command.expectedRevision + 1
  ) {
    return 'Committed Architecture receipt does not match the requested revision identity.'
  }

  const hasSemanticOperation = command.operations.some(
    (operation) => getArchitectureOperationClassification(operation.type) === 'semantic',
  )
  if (
    receipt.semantic !== hasSemanticOperation ||
    (hasSemanticOperation && receipt.architectureVersionId === null) ||
    (!hasSemanticOperation &&
      receipt.architectureVersionId !== receipt.previousArchitectureVersionId)
  ) {
    return 'Committed Architecture receipt has an invalid semantic version result.'
  }

  if (receipt.operations.length !== command.operations.length) {
    return 'Committed Architecture receipt is missing operation results.'
  }
  for (const [index, operation] of command.operations.entries()) {
    const committed = receipt.operations[index]
    if (
      committed?.sequence !== index ||
      committed.operationId !== operation.operationId ||
      committed.type !== operation.type ||
      committed.semantic !== (getArchitectureOperationClassification(operation.type) === 'semantic')
    ) {
      return 'Committed Architecture receipt operation identity does not match the request.'
    }
  }

  return null
}

export async function applyArchitectureCommand(
  input: unknown,
): Promise<PlanningCommandServiceResult<ArchitectureCommandReceipt>> {
  const commandResult = architectureCommandSchema.safeParse(input)
  if (!commandResult.success) {
    return {
      success: false,
      error: `Invalid Architecture command: ${commandResult.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  const command = commandResult.data
  const requestHash = hashCanonicalValue(command)
  const architectureContentHash = command.architectureContent
    ? getPlanningContentHash('architecture', command.architectureContent)
    : null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('apply_architecture_command', {
    p_project_id: command.projectId,
    p_change_set_id: command.changeSetId,
    p_turn_id: command.turnId ?? null,
    p_expected_revision: command.expectedRevision,
    p_request_hash: requestHash,
    p_operations: command.operations as unknown as Json,
    p_architecture_content: (command.architectureContent ?? null) as Json,
    p_architecture_content_hash: architectureContentHash,
  })

  if (error) return { success: false, error: error.message }

  const receiptResult = architectureCommandReceiptSchema.safeParse(data)
  if (!receiptResult.success) {
    return {
      success: false,
      error: `Invalid committed Architecture receipt: ${receiptResult.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  const mismatch = validateReceiptMatchesCommand(command, receiptResult.data)
  if (mismatch)
    return { success: false, error: `Invalid committed Architecture receipt: ${mismatch}` }

  return { success: true, data: receiptResult.data }
}
