import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider } from '@/types/chat'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 4096
const DEFAULT_CEREBRAS_MODEL = 'gpt-oss-120b'
const DEFAULT_CEREBRAS_MAX_COMPLETION_TOKENS = 1200
const CEREBRAS_CHAT_COMPLETIONS_URL = 'https://api.cerebras.ai/v1/chat/completions'
const MAX_CEREBRAS_TOOL_ROUNDS = 8

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
}

/** Delimiter used to embed tool events in the text stream */
export const TOOL_EVENT_DELIMITER = '\x1ETOOL_EVENT:'

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

function stringifyMessageContent(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content
  return content
    .map((block) => {
      if ('text' in block && typeof block.text === 'string') return block.text
      return JSON.stringify(block)
    })
    .join('\n')
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
        content.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: parseCerebrasToolInput(toolCall),
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
  if ((options.provider ?? 'cerebras') === 'cerebras') {
    return callCerebrasWithTools(systemPrompt, messages, tools, executeTool, options)
  }

  return callAnthropicWithTools(systemPrompt, messages, tools, executeTool, options.onToolResult)
}

async function callAnthropicWithTools(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  executeTool: ToolExecutor,
  onToolResult?: ToolEventCallback,
): Promise<ReadableStream<string>> {
  const client = getClient()
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL

  return new ReadableStream<string>({
    async start(controller) {
      let currentMessages: Anthropic.MessageParam[] = [...messages]

      try {
        while (true) {
          let streamedTextThisRound = ''

          const stream = client.messages.stream({
            model,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            tools,
            tool_choice: { type: 'auto', disable_parallel_tool_use: true },
            messages: currentMessages,
          })

          // Stream text deltas to the client in real-time
          stream.on('text', (text: string) => {
            streamedTextThisRound += text
            controller.enqueue(text)
          })

          // Wait for the full message to determine if tools were called
          const response = await stream.finalMessage()

          // If the model didn't call any tools, we're done
          if (response.stop_reason !== 'tool_use') {
            break
          }

          // Extract tool use blocks and execute each tool
          const toolUseBlocks = response.content.filter(
            (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
          )

          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const toolBlock of toolUseBlocks) {
            const toolInput = toolBlock.input as Record<string, unknown>

            // Notify client that a tool is about to execute
            controller.enqueue(
              `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool: toolBlock.name, status: 'start' })}\n`,
            )

            const result = await executeTool(toolBlock.name, toolInput)

            if (onToolResult) {
              onToolResult(toolBlock.name, toolInput, result)
            }

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

          // Append assistant turn + tool results and loop
          currentMessages = [
            ...currentMessages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ]

          if (streamedTextThisRound.trim()) {
            controller.enqueue('\n\n')
          }
        }

        controller.close()
      } catch (err) {
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

      try {
        for (let round = 0; round < MAX_CEREBRAS_TOOL_ROUNDS; round++) {
          const response = await fetch(CEREBRAS_CHAT_COMPLETIONS_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: currentMessages,
              tools: cerebrasTools,
              tool_choice: 'auto',
              // Disabled so dependent operations stay sequential (e.g. create_module
              // then create_node in that module) — mirrors the Anthropic path's
              // disable_parallel_tool_use and the architecture note above.
              parallel_tool_calls: false,
              reasoning_effort: 'medium',
              max_completion_tokens: maxCompletionTokens,
            }),
          })

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
            if (text) controller.enqueue(text)
            controller.close()
            return
          }

          if (text.trim()) {
            controller.enqueue(text)
          }

          currentMessages.push({
            role: 'assistant',
            content: text || null,
            ...(typeof message.reasoning === 'string' ? { reasoning: message.reasoning } : {}),
            tool_calls: toolCalls,
          })

          for (const toolCall of toolCalls) {
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

          if (text.trim()) {
            controller.enqueue('\n\n')
          }
        }

        throw new Error('Cerebras tool loop exceeded the maximum number of rounds')
      } catch (err) {
        if (isCerebrasRateLimitError(err)) {
          logCerebrasFallback(err)

          try {
            const fallbackMessages = toAnthropicMessagesFromCerebrasMessages(currentMessages)
            const fallbackStream = await callAnthropicWithTools(
              systemPrompt,
              fallbackMessages,
              tools,
              executeTool,
              options.onToolResult,
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

export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const sanitized = message
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
