import Anthropic from '@anthropic-ai/sdk'

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096

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

/** Delimiter used to embed tool events in the text stream */
export const TOOL_EVENT_DELIMITER = '\x1ETOOL_EVENT:'

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
  onToolResult?: ToolEventCallback,
): Promise<ReadableStream<string>> {
  const client = getClient()
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL

  return new ReadableStream<string>({
    async start(controller) {
      let currentMessages: Anthropic.MessageParam[] = [...messages]

      try {
        while (true) {
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
        }

        controller.close()
      } catch (err) {
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
