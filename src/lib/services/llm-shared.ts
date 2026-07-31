import type Anthropic from '@anthropic-ai/sdk'
import type { AIProvider } from '@/types/chat'

/**
 * Provider-agnostic pieces of the chat pipeline. These live outside
 * llm-client.ts so provider modules can reuse them without importing the
 * router that imports them back.
 */

/** Delimiter used to embed tool events in the text stream */
export const TOOL_EVENT_DELIMITER = '\x1ETOOL_EVENT:'

/**
 * Injected as a user turn when a tool-use loop ends without ever streaming
 * visible text — without it the chat goes silent and the conversation stalls.
 */
export const FORCED_TEXT_NUDGE =
  'Your reply contained no text for the user. Respond now in plain text: briefly state what you just did on the canvas, then ask exactly ONE follow-up question with a `Recommended answer:` line. Do not call any more tools.'

export const TOOL_BUDGET_NUDGE =
  'You have reached the tool budget for this turn. Stop calling tools. Reply in plain text: summarize what was captured on the canvas, mention anything still left to build, then ask exactly ONE follow-up question with a `Recommended answer:` line.'

export type ToolResult = {
  content: string
  isError: boolean
  /** Structured data for client-side store updates */
  data?: Record<string, unknown>
}

export type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<ToolResult>

export type ToolEventCallback = (
  toolName: string,
  input: Record<string, unknown>,
  result: ToolResult,
) => void

export type CallLLMWithToolsOptions = {
  provider?: AIProvider
  onToolResult?: ToolEventCallback
  /**
   * Stable cache key for the backend's prompt cache (Codex-only; other
   * providers ignore it). Pass a UUID-format string — e.g. the project id —
   * so repeated turns in the same conversation reuse the same warm cache
   * instead of a fresh one per call.
   */
  sessionKey?: string
}

export function stringifyMessageContent(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content
  return content
    .map((block) => {
      if ('text' in block && typeof block.text === 'string') return block.text
      return JSON.stringify(block)
    })
    .join('\n')
}

export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const sanitized = message
    // JWTs (Codex OAuth access/refresh/id tokens) — first so later rules
    // can't shred a token into unredacted fragments.
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[REDACTED]')
    // Anthropic API keys
    .replace(/sk-ant[^\s]*/gi, '[REDACTED]')
    // Cerebras API keys
    .replace(/csk-[^\s"'`]+/gi, '[REDACTED]')
    // Stripe keys (sk_live_, sk_test_)
    .replace(/sk_(live|test)_[^\s]*/gi, '[REDACTED]')
    // Postgres/Supabase connection strings
    .replace(/postgresql:\/\/[^\s]*/gi, '[REDACTED]')
    // Absolute file paths (Unix)
    .replace(/\/(Users|home)\/[^\s]*/g, '[REDACTED]')
    // IPv4 addresses (with optional port)
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b/g, '[REDACTED]')
    // Internal hostnames (multi-segment with .internal., .local, .io, .co with port)
    .replace(/\b[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]*\b(:\d+)/g, '[REDACTED]')
  return `LLM request failed: ${sanitized}`
}
