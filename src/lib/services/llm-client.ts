import Anthropic from '@anthropic-ai/sdk'

import { callCodexWithTools } from '@/lib/services/codex-client'
import {
  FORCED_TEXT_NUDGE,
  TOOL_BUDGET_NUDGE,
  TOOL_EVENT_DELIMITER,
  sanitizeError,
  stringifyMessageContent,
} from '@/lib/services/llm-shared'
import type {
  CallLLMWithToolsOptions,
  ToolEventCallback,
  ToolExecutor,
  ToolResult,
} from '@/lib/services/llm-shared'

export { TOOL_EVENT_DELIMITER, sanitizeError }
export type { ToolResult, ToolExecutor, ToolEventCallback, CallLLMWithToolsOptions }

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 4096
const DEFAULT_CEREBRAS_MODEL = 'gpt-oss-120b'
// 1200 routinely truncated multi-field tool-call JSON mid-string, leaving
// unparseable arguments in history (and breaking the Anthropic fallback).
const DEFAULT_CEREBRAS_MAX_COMPLETION_TOKENS = 2048
const CEREBRAS_CHAT_COMPLETIONS_URL = 'https://api.cerebras.ai/v1/chat/completions'
const MAX_CEREBRAS_TOOL_ROUNDS = 16

const CEREBRAS_UNSUPPORTED_SCHEMA_KEYS = new Set([
  'maxItems',
  'minItems',
  'maxLength',
  'minLength',
  'maximum',
  'minimum',
  'pattern',
])

const CEREBRAS_DIAGNOSTIC_HEADER_NAMES = [
  'retry-after',
  'x-request-id',
  'x-ratelimit-limit-requests-minute',
  'x-ratelimit-limit-requests-hour',
  'x-ratelimit-limit-requests-day',
  'x-ratelimit-limit-tokens-minute',
  'x-ratelimit-remaining-requests-minute',
  'x-ratelimit-remaining-requests-hour',
  'x-ratelimit-remaining-requests-day',
  'x-ratelimit-remaining-tokens-minute',
  'x-ratelimit-reset-requests-minute',
  'x-ratelimit-reset-requests-hour',
  'x-ratelimit-reset-requests-day',
  'x-ratelimit-reset-tokens-minute',
]

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic()
  }
  return _client
}

type CerebrasToolCall = {
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

type CerebrasMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  reasoning?: string | null
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

type NormalizedCerebrasToolCall = NonNullable<CerebrasMessage['tool_calls']>[number]

type CerebrasTool = {
  type: 'function'
  function: {
    name: string
    description?: string
    strict: true
    parameters: Record<string, unknown>
  }
}

class CerebrasAPIError extends Error {
  status: number
  diagnostics: Record<string, string>

  constructor(status: number, message: string, diagnostics: Record<string, string>) {
    super(`Cerebras API error: ${message}`)
    this.name = 'CerebrasAPIError'
    this.status = status
    this.diagnostics = diagnostics
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getCerebrasMaxCompletionTokens(): number {
  const raw = process.env.CEREBRAS_MAX_COMPLETION_TOKENS?.trim()
  if (!raw) return DEFAULT_CEREBRAS_MAX_COMPLETION_TOKENS

  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CEREBRAS_MAX_COMPLETION_TOKENS
}

function collectCerebrasDiagnostics(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    CEREBRAS_DIAGNOSTIC_HEADER_NAMES.flatMap((name) => {
      const value = headers.get(name)
      return value ? [[name, value]] : []
    }),
  )
}

// ---------------------------------------------------------------------------
// Cerebras quota tracking
//
// The free tier allows only 5 requests/minute and 30K tokens/minute, while a
// single tool-loop turn fires several requests — so a turn that starts with
// the bucket nearly empty is guaranteed to 429 partway through. We snapshot
// the x-ratelimit-remaining-* headers from every response and route whole
// turns to the Anthropic fallback when the bucket can't cover one.
// ---------------------------------------------------------------------------

type CerebrasQuotaSnapshot = {
  remainingRequestsMinute: number | null
  remainingTokensMinute: number | null
  remainingTokensDay: number | null
  updatedAtMs: number
}

let cerebrasQuotaSnapshot: CerebrasQuotaSnapshot | null = null

/** Minute buckets replenish continuously — a snapshot older than one window says nothing. */
const QUOTA_MINUTE_STALE_MS = 70_000
/** The day bucket refills at ~700 tokens/min on the free tier, so exhaustion persists. */
const QUOTA_DAY_STALE_MS = 10 * 60_000
/** A tool-loop turn realistically needs at least this many requests. */
const MIN_REQUESTS_FOR_TURN = 3
/** Rough floor for one turn: a few rounds of (prompt + history + completion budget). */
const MIN_TOKENS_FOR_TURN = 12_000

function parseHeaderInt(headers: Headers, name: string): number | null {
  const raw = headers.get(name)
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function updateCerebrasQuotaFromHeaders(headers: Headers, nowMs = Date.now()): void {
  const snapshot: CerebrasQuotaSnapshot = {
    remainingRequestsMinute: parseHeaderInt(headers, 'x-ratelimit-remaining-requests-minute'),
    remainingTokensMinute: parseHeaderInt(headers, 'x-ratelimit-remaining-tokens-minute'),
    remainingTokensDay: parseHeaderInt(headers, 'x-ratelimit-remaining-tokens-day'),
    updatedAtMs: nowMs,
  }

  if (
    snapshot.remainingRequestsMinute === null &&
    snapshot.remainingTokensMinute === null &&
    snapshot.remainingTokensDay === null
  ) {
    return
  }

  cerebrasQuotaSnapshot = snapshot
}

/**
 * True when the latest quota snapshot says a tool-loop turn cannot complete on
 * Cerebras. Errs toward attempting Cerebras: stale or missing data never blocks.
 */
export function isCerebrasQuotaExhausted(nowMs = Date.now()): boolean {
  if (nowMs < cerebrasBlockedUntilMs) return true

  const snapshot = cerebrasQuotaSnapshot
  if (!snapshot) return false

  const age = nowMs - snapshot.updatedAtMs

  if (age <= QUOTA_MINUTE_STALE_MS) {
    if (
      snapshot.remainingRequestsMinute !== null &&
      snapshot.remainingRequestsMinute < MIN_REQUESTS_FOR_TURN
    ) {
      return true
    }
    if (
      snapshot.remainingTokensMinute !== null &&
      snapshot.remainingTokensMinute < MIN_TOKENS_FOR_TURN
    ) {
      return true
    }
  }

  if (age <= QUOTA_DAY_STALE_MS) {
    if (snapshot.remainingTokensDay !== null && snapshot.remainingTokensDay < MIN_TOKENS_FOR_TURN) {
      return true
    }
  }

  return false
}

let cerebrasBlockedUntilMs = 0

/**
 * Cap how long a retry-after blocks Cerebras. Daily-budget 429s advertise
 * 86400s, but limits lift immediately if the account is upgraded mid-day —
 * re-probing every 15 minutes costs one request and keeps that path open.
 */
const MAX_RETRY_AFTER_BLOCK_MS = 15 * 60_000

/**
 * A 429 proves the bucket is empty even though Cerebras omits the
 * remaining-* headers on 429 responses — record that directly so the next
 * turns skip Cerebras instead of failing the same way. Honors retry-after
 * (capped) so a drained daily budget doesn't get re-probed every minute.
 */
export function markCerebrasRateLimited(nowMs = Date.now(), retryAfterSeconds?: number): void {
  cerebrasQuotaSnapshot = {
    remainingRequestsMinute: 0,
    remainingTokensMinute: cerebrasQuotaSnapshot?.remainingTokensMinute ?? null,
    remainingTokensDay: cerebrasQuotaSnapshot?.remainingTokensDay ?? null,
    updatedAtMs: nowMs,
  }

  if (retryAfterSeconds && retryAfterSeconds > 0) {
    cerebrasBlockedUntilMs = nowMs + Math.min(retryAfterSeconds * 1000, MAX_RETRY_AFTER_BLOCK_MS)
  }
}

export function resetCerebrasQuotaForTests(): void {
  cerebrasQuotaSnapshot = null
  cerebrasBlockedUntilMs = 0
}

function adaptNullableTypeArray(types: unknown[]): Record<string, unknown> | null {
  if (!types.includes('null')) return null

  return {
    anyOf: types.map((type) => ({ type })),
  }
}

export function adaptSchemaForCerebras(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => adaptSchemaForCerebras(item))
  }

  if (!isPlainObject(schema)) {
    return schema
  }

  const adapted: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(schema)) {
    if (CEREBRAS_UNSUPPORTED_SCHEMA_KEYS.has(key)) continue

    if (key === 'type' && Array.isArray(value)) {
      const nullable = adaptNullableTypeArray(value)
      if (nullable) {
        Object.assign(adapted, nullable)
        continue
      }
      // Non-nullable unions (e.g. ['string', 'number']) must still be preserved —
      // express them as anyOf so the type constraint isn't lost in strict mode.
      if (value.length > 1) {
        adapted.anyOf = value.map((entry) => ({ type: entry }))
      } else if (value.length === 1) {
        adapted.type = value[0]
      }
      continue
    }

    if (key === 'properties' && isPlainObject(value)) {
      adapted.properties = Object.fromEntries(
        Object.entries(value).map(([propertyName, propertySchema]) => [
          propertyName,
          adaptSchemaForCerebras(propertySchema),
        ]),
      )
      continue
    }

    if (key === 'items' || key === 'anyOf') {
      adapted[key] = adaptSchemaForCerebras(value)
      continue
    }

    adapted[key] = adaptSchemaForCerebras(value)
  }

  if (adapted.type === 'object' && !('additionalProperties' in adapted)) {
    adapted.additionalProperties = false
  }

  return adapted
}

function toCerebrasTool(tool: Anthropic.Tool): CerebrasTool {
  const parameters = adaptSchemaForCerebras(
    tool.input_schema ?? { type: 'object', properties: {}, required: [] },
  )

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      strict: true,
      parameters: isPlainObject(parameters)
        ? parameters
        : { type: 'object', additionalProperties: false },
    },
  }
}

function toCerebrasMessages(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
): CerebrasMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map((message) => ({
      role: message.role,
      content: stringifyMessageContent(message.content),
    })),
  ]
}

function parseCerebrasToolInput(call: CerebrasToolCall): Record<string, unknown> {
  const raw = call.function?.arguments || '{}'
  const parsed = JSON.parse(raw) as unknown
  return isPlainObject(parsed) ? parsed : {}
}

function normalizeCerebrasToolCall(
  call: CerebrasToolCall,
  index: number,
): NormalizedCerebrasToolCall | null {
  const name = call.function?.name
  if (!name) return null

  return {
    id: call.id ?? `tool_call_${index + 1}`,
    type: 'function',
    function: {
      name,
      arguments: call.function?.arguments || '{}',
    },
  }
}

function isCerebrasRateLimitError(error: unknown): boolean {
  if (error instanceof CerebrasAPIError && error.status === 429) return true

  const message = error instanceof Error ? error.message : String(error)
  return /\b429\b|rate limit|too many requests/i.test(message)
}

function logCerebrasFallback(error: unknown) {
  const diagnostics = error instanceof CerebrasAPIError ? error.diagnostics : {}
  console.warn(
    `Cerebras rate limited; falling back to Anthropic ${JSON.stringify({
      error: sanitizeError(error),
      diagnostics,
    })}`,
  )
}

function toAnthropicMessagesFromCerebrasMessages(
  messages: CerebrasMessage[],
): Anthropic.MessageParam[] {
  const anthropicMessages: Anthropic.MessageParam[] = []
  let pendingToolResults: Anthropic.ToolResultBlockParam[] = []

  function flushToolResults() {
    if (pendingToolResults.length === 0) return
    anthropicMessages.push({ role: 'user', content: pendingToolResults })
    pendingToolResults = []
  }

  for (const message of messages) {
    if (message.role === 'system') continue

    if (message.role === 'tool') {
      if (!message.tool_call_id) continue

      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: message.tool_call_id,
        content: message.content ?? '',
        is_error: message.content?.startsWith('Error:') || undefined,
      })
      continue
    }

    flushToolResults()

    if (message.role === 'assistant') {
      if (!message.tool_calls?.length) {
        anthropicMessages.push({ role: 'assistant', content: message.content ?? '' })
        continue
      }

      const content: Anthropic.ContentBlockParam[] = []
      if (message.content?.trim()) {
        content.push({ type: 'text', text: message.content })
      }

      for (const toolCall of message.tool_calls) {
        // Truncated Cerebras tool calls leave invalid JSON in history — the
        // executor already tolerated them, so the fallback conversion must
        // not throw on the same arguments.
        let input: Record<string, unknown>
        try {
          input = parseCerebrasToolInput(toolCall)
        } catch {
          input = {}
        }
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input,
        })
      }

      anthropicMessages.push({ role: 'assistant', content })
      continue
    }

    anthropicMessages.push({ role: 'user', content: message.content ?? '' })
  }

  flushToolResults()
  return anthropicMessages
}

async function pipeTextStream(
  stream: ReadableStream<string>,
  controller: ReadableStreamDefaultController<string>,
) {
  const reader = stream.getReader()

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      controller.enqueue(value)
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Call the LLM with tool definitions and handle the tool-use loop.
 *
 * Each turn streams text to the returned ReadableStream in real-time.
 * When the model calls a tool, the executor runs it server-side and
 * the conversation continues until the model issues an end_turn or
 * we hit the max tool rounds.
 *
 * Parallel tool use is disabled — operations are executed sequentially
 * to avoid dependent operations failing (e.g. create_module then
 * create_node in that module).
 */
export async function callLLMWithTools(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  executeTool: ToolExecutor,
  options: CallLLMWithToolsOptions = {},
): Promise<ReadableStream<string>> {
  const provider = options.provider ?? 'anthropic'

  if (provider === 'codex') {
    return callCodexWithTools(systemPrompt, messages, tools, executeTool, options)
  }

  if (provider === 'cerebras') {
    if (isCerebrasQuotaExhausted()) {
      // Starting the turn would burn requests guaranteed to 429 partway
      // through — go straight to the fallback provider instead.
      console.warn('Cerebras quota exhausted (from rate-limit headers); routing turn to Anthropic')
      return callAnthropicWithTools(systemPrompt, messages, tools, executeTool, options)
    }
    return callCerebrasWithTools(systemPrompt, messages, tools, executeTool, options)
  }

  return callAnthropicWithTools(systemPrompt, messages, tools, executeTool, options)
}

async function callAnthropicWithTools(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  executeTool: ToolExecutor,
  options: CallLLMWithToolsOptions = {},
): Promise<ReadableStream<string>> {
  const client = getClient()
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL

  return new ReadableStream<string>({
    async start(controller) {
      let currentMessages: Anthropic.MessageParam[] = [...messages]
      let totalStreamedText = ''

      try {
        while (true) {
          // The turn was stopped — no new round, and no wrap-up nudge either.
          if (options.signal?.aborted) break

          let streamedTextThisRound = ''

          const stream = client.messages.stream(
            {
              model,
              max_tokens: MAX_TOKENS,
              system: systemPrompt,
              tools,
              tool_choice: { type: 'auto', disable_parallel_tool_use: true },
              messages: currentMessages,
            },
            { signal: options.signal },
          )

          // Buffer text per round — text written alongside tool calls is
          // model narration ("let me rewire this"), not a user-facing reply,
          // so only rounds WITHOUT tool calls get shown.
          stream.on('text', (text: string) => {
            streamedTextThisRound += text
          })

          // Wait for the full message to determine if tools were called
          const response = await stream.finalMessage()

          // If the model didn't call any tools, this round's text is the reply
          if (response.stop_reason !== 'tool_use') {
            if (streamedTextThisRound.trim()) {
              totalStreamedText += streamedTextThisRound
              controller.enqueue(streamedTextThisRound)
            }
            break
          }

          // Extract tool use blocks and execute each tool
          const toolUseBlocks = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
          )

          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const toolBlock of toolUseBlocks) {
            // Stop before starting another tool. A tool already running is
            // left to finish — they are short writes, and killing one midway
            // would leave the canvas half-built. The round's remaining work is
            // abandoned; the loop exits at the top of the next iteration.
            if (options.signal?.aborted) break

            const toolInput = toolBlock.input as Record<string, unknown>

            // Notify client that a tool is about to execute
            controller.enqueue(
              `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool: toolBlock.name, status: 'start' })}\n`,
            )

            const result = await executeTool(toolBlock.name, toolInput)

            options.onToolResult?.(toolBlock.name, toolInput, result)

            // Emit tool event into stream so the client can update state in real-time
            if (result.data) {
              controller.enqueue(
                `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool: toolBlock.name, data: result.data })}\n`,
              )
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: result.content,
              is_error: result.isError || undefined,
            })
          }

          // Append assistant turn + tool results and loop. The buffered
          // round text stays in `response.content` for model context but is
          // never shown to the user.
          currentMessages = [
            ...currentMessages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ]
        }

        // The loop can end on a tool-only turn with no visible text at all,
        // which renders as a silent assistant in the chat. Force one final
        // text-only round so the conversation always keeps moving — unless the
        // turn was stopped, when another round is exactly what the user
        // asked us not to do.
        if (!options.signal?.aborted && !totalStreamedText.trim()) {
          const finalStream = client.messages.stream(
            {
              model,
              max_tokens: MAX_TOKENS,
              system: systemPrompt,
              tools,
              tool_choice: { type: 'none' },
              messages: [...currentMessages, { role: 'user', content: FORCED_TEXT_NUDGE }],
            },
            { signal: options.signal },
          )

          finalStream.on('text', (text: string) => {
            controller.enqueue(text)
          })

          await finalStream.finalMessage()
        }

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

async function callCerebrasWithTools(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  executeTool: ToolExecutor,
  options: CallLLMWithToolsOptions,
): Promise<ReadableStream<string>> {
  const apiKey = process.env.CEREBRAS_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('CEREBRAS_API_KEY is not configured')
  }

  const model = process.env.CEREBRAS_SEO_MODEL?.trim() || DEFAULT_CEREBRAS_MODEL
  const maxCompletionTokens = getCerebrasMaxCompletionTokens()
  const cerebrasTools = tools.map(toCerebrasTool)

  return new ReadableStream<string>({
    async start(controller) {
      const currentMessages = toCerebrasMessages(systemPrompt, messages)
      let streamedAnyText = false

      try {
        let forcedTextRound = false

        for (let round = 0; round <= MAX_CEREBRAS_TOOL_ROUNDS; round++) {
          // The turn was stopped — no new round, and no wrap-up nudge either.
          if (options.signal?.aborted) break

          if (round === MAX_CEREBRAS_TOOL_ROUNDS && !forcedTextRound) {
            // Tool budget exhausted — wrap up with a text-only round instead
            // of erroring out mid-build.
            currentMessages.push({ role: 'user', content: TOOL_BUDGET_NUDGE })
            forcedTextRound = true
          }

          const response = await fetch(CEREBRAS_CHAT_COMPLETIONS_URL, {
            method: 'POST',
            signal: options.signal,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: currentMessages,
              tools: cerebrasTools,
              tool_choice: forcedTextRound ? 'none' : 'auto',
              // Disabled so dependent operations stay sequential (e.g. create_module
              // then create_node in that module) — mirrors the Anthropic path's
              // disable_parallel_tool_use and the architecture note above.
              parallel_tool_calls: false,
              reasoning_effort: 'medium',
              max_completion_tokens: maxCompletionTokens,
            }),
          })

          updateCerebrasQuotaFromHeaders(response.headers)

          const payload = (await response.json().catch(() => null)) as {
            error?: { message?: string }
            choices?: Array<{
              message?: {
                content?: string | null
                reasoning?: string | null
                tool_calls?: CerebrasToolCall[] | null
              }
            }>
          } | null

          if (!response.ok) {
            const errorMessage = payload?.error?.message ?? `status ${response.status}`
            throw new CerebrasAPIError(
              response.status,
              errorMessage,
              collectCerebrasDiagnostics(response.headers),
            )
          }

          const message = payload?.choices?.[0]?.message
          if (!message) {
            throw new Error('Cerebras API returned no assistant message')
          }

          const text = message.content ?? ''
          const toolCalls = (message.tool_calls ?? [])
            .map((call, index) => normalizeCerebrasToolCall(call, index))
            .filter((call): call is NonNullable<typeof call> => call !== null)

          if (toolCalls.length === 0) {
            if (text) {
              controller.enqueue(text)
              streamedAnyText = true
            }
            if (!streamedAnyText && !forcedTextRound) {
              // Tool-only turn ended silently — force one text-only round so
              // the user always gets a visible reply.
              currentMessages.push({ role: 'assistant', content: text || null })
              currentMessages.push({ role: 'user', content: FORCED_TEXT_NUDGE })
              forcedTextRound = true
              continue
            }
            controller.close()
            return
          }

          // Text accompanying tool calls is model narration ("let me fix
          // this") — keep it in context for the model but never show it.
          currentMessages.push({
            role: 'assistant',
            content: text || null,
            ...(typeof message.reasoning === 'string' ? { reasoning: message.reasoning } : {}),
            tool_calls: toolCalls,
          })

          for (const toolCall of toolCalls) {
            // Stop before starting another tool. A tool already running is
            // left to finish — they are short writes, and killing one midway
            // would leave the canvas half-built. The round's remaining work is
            // abandoned; the loop exits at the top of the next iteration.
            if (options.signal?.aborted) break

            const toolName = toolCall.function.name
            let toolInput: Record<string, unknown>
            let parseError = false

            try {
              toolInput = parseCerebrasToolInput(toolCall)
            } catch {
              toolInput = {}
              parseError = true
            }

            controller.enqueue(
              `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool: toolName, status: 'start' })}\n`,
            )

            const result = parseError
              ? {
                  content: 'Invalid tool arguments',
                  isError: true,
                }
              : await executeTool(toolName, toolInput)

            options.onToolResult?.(toolName, toolInput, result)

            if (result.data) {
              controller.enqueue(
                `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool: toolName, data: result.data })}\n`,
              )
            }

            currentMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result.isError ? `Error: ${result.content}` : result.content,
            })
          }
        }

        // Even the forced text round produced nothing — close cleanly rather
        // than surface an error mid-conversation.
        controller.close()
        return
      } catch (err) {
        // A round aborted in flight throws — that is the stop landing, not a
        // failure worth showing the user, and not a reason to open a fallback
        // turn on Anthropic.
        if (options.signal?.aborted) {
          controller.close()
          return
        }

        if (isCerebrasRateLimitError(err)) {
          const retryAfterRaw =
            err instanceof CerebrasAPIError ? err.diagnostics['retry-after'] : undefined
          const retryAfterSeconds = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : undefined
          markCerebrasRateLimited(
            Date.now(),
            Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
          )
          logCerebrasFallback(err)

          try {
            if (streamedAnyText) {
              // Part of this reply already streamed to the user before the rate
              // limit hit. Without this note the fallback model re-answers from
              // scratch and the user sees the same content twice in one bubble.
              currentMessages.push({
                role: 'user',
                content:
                  'The assistant text above was already shown to the user before the connection dropped. Continue that SAME reply from where it stopped — do not repeat or rephrase anything already written.',
              })
            }
            const fallbackMessages = toAnthropicMessagesFromCerebrasMessages(currentMessages)
            const fallbackStream = await callAnthropicWithTools(
              systemPrompt,
              fallbackMessages,
              tools,
              executeTool,
              options,
            )
            await pipeTextStream(fallbackStream, controller)
            controller.close()
          } catch (fallbackErr) {
            controller.error(new Error(sanitizeError(fallbackErr)))
          }
          return
        }

        controller.error(new Error(sanitizeError(err)))
      }
    },
  })
}

/**
 * Simple streaming call without tools (kept for backward compatibility).
 */
export async function callLLM(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
): Promise<ReadableStream<string>> {
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL

  const stream = getClient().messages.stream({
    model,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: messages as Anthropic.MessageParam[],
  })

  return new ReadableStream<string>({
    start(controller) {
      stream.on('text', (textDelta: string) => {
        controller.enqueue(textDelta)
      })

      stream.on('error', (error: Error) => {
        controller.error(new Error(sanitizeError(error)))
      })

      stream.on('end', () => {
        controller.close()
      })
    },
  })
}
