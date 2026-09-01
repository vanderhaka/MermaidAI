/**
 * Vocabulary shared by every chat turn: how a running tool is announced, how an
 * unfinished answer is marked, and where the per-project chat preference lives.
 */

import type { ChatMessage, ChatRole } from '@/types/chat'

const TOOL_LABELS: Record<string, string> = {
  capture_scope_flow: 'Building scope',
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
