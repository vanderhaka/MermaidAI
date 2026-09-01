import 'server-only'

import { randomUUID } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'

import { forceRefreshCodexAuth, getCodexAuth } from '@/lib/services/codex-auth'
import type { CodexAuth } from '@/lib/services/codex-auth'
import { isRecord } from '@/lib/services/codex-sse'
import { reasoningEchoItem, readCodexRound } from '@/lib/services/codex-round'
import type { CodexReasoningEchoItem } from '@/lib/services/codex-round'
import {
  FORCED_TEXT_NUDGE,
  TOOL_BUDGET_NUDGE,
  TOOL_EVENT_DELIMITER,
  sanitizeError,
  stringifyMessageContent,
} from '@/lib/services/llm-shared'
import type { CallLLMWithToolsOptions, ToolExecutor, ToolResult } from '@/lib/services/llm-shared'

const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses'
const DEFAULT_CODEX_MODEL = 'gpt-5.6-luna'
const DEFAULT_REASONING_EFFORT = 'xhigh'
const DEFAULT_CONTINUATION_EFFORT = 'medium'
const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const MAX_CODEX_TOOL_ROUNDS = 16
const LOGIN_EXPIRED = 'Codex login expired. Run: codex login'

/**
 * Appended to the caller's system prompt because `parallel_tool_calls` is on:
 * the model may now emit several calls per round and needs the dependency rule
 * spelled out, or it invents ids for records it has not created yet.
 */
const BATCHING_INSTRUCTIONS = [
  "Batch tool calls together in one response ONLY when none of them needs an ID returned by another call's result.",
  "When a call needs an ID from a prior call's result, wait for that result before making it.",
  'Never guess or invent IDs.',
].join(' ')

type CodexInputItem =
  | {
      type: 'message'
      role: 'user' | 'assistant'
      content: Array<{ type: 'input_text' | 'output_text'; text: string }>
    }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }
  | CodexReasoningEchoItem

type CodexTool = {
  type: 'function'
  name: string
  description?: string
  strict: false
  parameters: Record<string, unknown>
}

function userItem(text: string): CodexInputItem {
  return { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
}

function assistantItem(text: string): CodexInputItem {
  return { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }
}

function toCodexInput(messages: Anthropic.MessageParam[]): CodexInputItem[] {
  return messages.map((message) => {
    const text = stringifyMessageContent(message.content)
    return message.role === 'assistant' ? assistantItem(text) : userItem(text)
  })
}

function toCodexTool(tool: Anthropic.Tool): CodexTool {
  const schema: unknown = tool.input_schema
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    // Strict mode rejects the optional-heavy schemas this app ships.
    strict: false,
    parameters: isRecord(schema) ? schema : { type: 'object', properties: {} },
  }
}

function resolveReasoningEffort(configured: string | undefined, fallback: string): string {
  const trimmed = configured?.trim()
  return trimmed && REASONING_EFFORTS.includes(trimmed) ? trimmed : fallback
}

function buildRequest(
  auth: CodexAuth,
  sessionId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): RequestInit {
  return {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'chatgpt-account-id': auth.accountId,
      'OpenAI-Beta': 'responses=experimental',
      originator: 'codex_cli_rs',
      session_id: sessionId,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
  }
}

async function postCodexRound(
  sessionId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  let response = await fetch(
    CODEX_RESPONSES_URL,
    buildRequest(await getCodexAuth(), sessionId, body, signal),
  )

  if (response.status === 401) {
    // The token can lapse between the expiry check and the request landing —
    // refresh once before declaring the login dead.
    await response.body?.cancel().catch(() => {})
    response = await fetch(
      CODEX_RESPONSES_URL,
      buildRequest(await forceRefreshCodexAuth(), sessionId, body, signal),
    )
  }

  if (response.status === 401) {
    throw new Error(LOGIN_EXPIRED)
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Codex API error ${response.status}: ${detail.slice(0, 300) || '(no body)'}`)
  }

  return response.body
}

function parseToolArguments(raw: string): { input: Record<string, unknown>; failed: boolean } {
  try {
    const parsed: unknown = JSON.parse(raw || '{}')
    return { input: isRecord(parsed) ? parsed : {}, failed: false }
  } catch {
    return { input: {}, failed: true }
  }
}

/**
 * Call the Codex backend with tool definitions and handle the tool-use loop.
 *
 * The backend labels each message item's phase: `commentary` is narration —
 * kept in model context but never shown — while `final_answer` is addressed to
 * the user and streams token by token as it arrives, even when the same round
 * goes on to call tools.
 */
export async function callCodexWithTools(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  executeTool: ToolExecutor,
  options: CallLLMWithToolsOptions = {},
): Promise<ReadableStream<string>> {
  const model = process.env.CODEX_MODEL?.trim() || DEFAULT_CODEX_MODEL
  const baseEffort = resolveReasoningEffort(
    options.reasoningEffort ?? process.env.CODEX_REASONING_EFFORT,
    DEFAULT_REASONING_EFFORT,
  )
  const continuationEffort = resolveReasoningEffort(
    options.continuationReasoningEffort ?? process.env.CODEX_CONTINUATION_EFFORT,
    DEFAULT_CONTINUATION_EFFORT,
  )
  const instructions = `${systemPrompt}\n\n${BATCHING_INSTRUCTIONS}`
  const serviceTier = process.env.CODEX_SERVICE_TIER?.trim() || 'priority'
  const codexTools = tools.map(toCodexTool)
  // The backend keys its prompt cache on session_id — a stable per-project
  // key (when supplied) keeps the cache warm across turns, not just within
  // the rounds of a single turn.
  const sessionId = options.sessionKey?.trim() || randomUUID()

  return new ReadableStream<string>({
    async start(controller) {
      const input = toCodexInput(messages)
      let streamedAnyText = false
      let forcedTextRound = false

      try {
        for (let round = 0; round <= MAX_CODEX_TOOL_ROUNDS; round++) {
          // The turn was stopped — no new round, and no wrap-up nudge either.
          if (options.signal?.aborted) break

          if (round === MAX_CODEX_TOOL_ROUNDS && !forcedTextRound) {
            // Tool budget exhausted — wrap up with a text-only round instead
            // of erroring out mid-build.
            input.push(userItem(TOOL_BUDGET_NUDGE))
            forcedTextRound = true
          }

          const body = await postCodexRound(
            sessionId,
            {
              model,
              instructions,
              input,
              tools: codexTools,
              tool_choice: forcedTextRound ? 'none' : 'auto',
              // Independent calls batch into one round; BATCHING_INSTRUCTIONS
              // keeps id-dependent ones sequential, and the loop below still
              // executes whatever arrives in emission order.
              parallel_tool_calls: true,
              // Continuation rounds inherit the echoed reasoning, so they mostly
              // emit the next call; planning (round 0) and the user-facing
              // wrap-up round keep full depth.
              reasoning: {
                effort: round === 0 || forcedTextRound ? baseEffort : continuationEffort,
              },
              service_tier: serviceTier,
              store: false,
              stream: true,
            },
            options.signal,
          )

          const result = await readCodexRound(body, {
            onFinalDelta: (delta) => controller.enqueue(delta),
          })
          const roundText = result.narrationText + result.finalText

          // Only text the backend never announced with an `output_item.added`
          // is still unsent — everything else already streamed above.
          if (result.bufferedFinalText.trim()) controller.enqueue(result.bufferedFinalText)
          if (result.finalText.trim()) streamedAnyText = true

          if (result.toolCalls.length === 0) {
            if (!streamedAnyText && !forcedTextRound) {
              // Tool-only turn ended silently — force one text-only round so
              // the user always gets a visible reply.
              if (roundText.trim()) input.push(assistantItem(roundText))
              input.push(userItem(FORCED_TEXT_NUDGE))
              forcedTextRound = true
              continue
            }

            controller.close()
            return
          }

          // Echo reasoning verbatim so the model doesn't re-reason from
          // scratch at xhigh effort — must precede the assistant text and
          // function_call echoes below.
          for (const rawReasoningItem of result.reasoningItems) {
            input.push(reasoningEchoItem(rawReasoningItem))
          }

          if (roundText.trim()) input.push(assistantItem(roundText))

          // A batched round yields several calls; run them one at a time in
          // emission order so the canvas mutations stay deterministic.
          for (const call of result.toolCalls) {
            // Stop before starting another tool. A tool already running is
            // left to finish — they are short writes, and killing one midway
            // would leave the canvas half-built. The round's remaining work is
            // abandoned; the loop exits at the top of the next iteration.
            if (options.signal?.aborted) break

            const { input: toolInput, failed } = parseToolArguments(call.arguments)

            controller.enqueue(
              `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool: call.name, status: 'start' })}\n`,
            )

            const toolResult: ToolResult = failed
              ? { content: 'Invalid tool arguments', isError: true }
              : await executeTool(call.name, toolInput)

            options.onToolResult?.(call.name, toolInput, toolResult)

            if (toolResult.data) {
              controller.enqueue(
                `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool: call.name, data: toolResult.data })}\n`,
              )
            }

            input.push({
              type: 'function_call',
              call_id: call.callId,
              name: call.name,
              arguments: call.arguments,
            })
            input.push({
              type: 'function_call_output',
              call_id: call.callId,
              output: toolResult.isError ? `Error: ${toolResult.content}` : toolResult.content,
            })
          }
        }

        // Even the forced text round produced nothing — close cleanly rather
        // than surface an error mid-conversation.
        controller.close()
      } catch (err) {
        // A round aborted in flight throws — that is the stop landing, not a
        // failure worth showing the user.
        if (options.signal?.aborted) {
          controller.close()
          return
        }
        controller.error(new Error(sanitizeError(err)))
      }
    },
  })
}
