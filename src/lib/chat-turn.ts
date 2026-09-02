/**
 * Vocabulary shared by every chat turn: how a running tool is announced, how an
 * unfinished answer is marked, and where the per-project chat preference lives.
 */

import {
  CHAT_TOOL_RECEIPT_KEY,
  type ChatMessage,
  type ChatRole,
  type ChatToolReceipt,
} from '@/types/chat'

const TOOL_LABELS: Record<string, string> = {
  capture_scope_flow: 'Building scope',
  refine_architecture_map: 'Updating Architecture',
  refine_architecture_flow: 'Updating flow',
  create_node: 'Creating node',
  update_node: 'Updating node',
  delete_node: 'Removing node',
  create_edge: 'Connecting nodes',
  update_edge: 'Updating connection',
  delete_edge: 'Removing connection',
  insert_node_between: 'Inserting step',
  create_module: 'Creating module',
  update_module: 'Updating module',
  delete_module: 'Removing module',
  connect_modules: 'Connecting modules',
  add_open_questions: 'Flagging questions',
  resolve_open_question: 'Resolving question',
  lookup_docs: 'Looking up docs',
  write_prd: 'Writing PRD',
  promote_project: 'Switching to Full Design',
}

/** Tacked onto whatever the assistant had said when the turn broke. */
export const INTERRUPTED_MARKER = '⚠ Response interrupted'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Reads the receipt seam shared by today's compatibility tools and the atomic
 * command tools added in the next slice. Only an explicit committed status may
 * advance the client revision.
 */
export function readChatToolReceipt(data: Record<string, unknown>): ChatToolReceipt | null {
  const candidate = data[CHAT_TOOL_RECEIPT_KEY]
  if (!isRecord(candidate)) return null

  const status = candidate.status
  if (status !== 'committed' && status !== 'failed' && status !== 'legacy_direct') return null
  if (
    typeof candidate.turnId !== 'string' ||
    !UUID_REGEX.test(candidate.turnId) ||
    typeof candidate.changeSetId !== 'string' ||
    !UUID_REGEX.test(candidate.changeSetId) ||
    typeof candidate.operationId !== 'string' ||
    !UUID_REGEX.test(candidate.operationId) ||
    typeof candidate.sequence !== 'number' ||
    !Number.isInteger(candidate.sequence) ||
    candidate.sequence < 0 ||
    typeof candidate.expectedRevision !== 'number' ||
    !Number.isInteger(candidate.expectedRevision) ||
    candidate.expectedRevision < 0
  ) {
    return null
  }

  const base: ChatToolReceipt = {
    turnId: candidate.turnId,
    changeSetId: candidate.changeSetId,
    operationId: candidate.operationId,
    sequence: candidate.sequence,
    status,
    expectedRevision: candidate.expectedRevision,
  }

  if (status !== 'committed') return { ...base, committedRevision: undefined }
  if (
    typeof candidate.committedRevision !== 'number' ||
    !Number.isInteger(candidate.committedRevision) ||
    candidate.committedRevision !== candidate.expectedRevision + 1
  ) {
    return null
  }
  if (
    candidate.artifactVersionId !== undefined &&
    candidate.artifactVersionId !== null &&
    (typeof candidate.artifactVersionId !== 'string' ||
      !UUID_REGEX.test(candidate.artifactVersionId))
  ) {
    return null
  }

  return {
    ...base,
    committedRevision: candidate.committedRevision,
    ...(candidate.artifactVersionId !== undefined
      ? { artifactVersionId: candidate.artifactVersionId as string | null }
      : {}),
  }
}

/** "Auto-decide" preference, remembered per project. */
const AUTO_DECIDE_STORAGE_PREFIX = 'mermaid:auto-decide:'

export function formatToolName(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ')
}

/** Null when this project has no stored preference yet. */
export function readAutoDecidePreference(projectId: string): boolean | null {
  const stored = window.localStorage.getItem(`${AUTO_DECIDE_STORAGE_PREFIX}${projectId}`)
  return stored === null ? null : stored === '1'
}

export function writeAutoDecidePreference(projectId: string, enabled: boolean): void {
  window.localStorage.setItem(`${AUTO_DECIDE_STORAGE_PREFIX}${projectId}`, enabled ? '1' : '0')
}

/**
 * A message this browser session made up — an optimistic bubble or an answer
 * committed before the server echoed it back. Its id marks it as ours so a
 * later refresh can tell it apart from persisted history.
 */
export function makeLocalMessage(
  role: Extract<ChatRole, 'user' | 'assistant'>,
  content: string,
  toolCalls?: string[],
): ChatMessage {
  return {
    id: `local-${role}-${crypto.randomUUID()}`,
    role,
    content,
    operations: [],
    createdAt: new Date().toISOString(),
    ...(toolCalls ? { toolCalls } : {}),
  }
}
