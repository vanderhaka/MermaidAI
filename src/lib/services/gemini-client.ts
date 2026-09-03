import 'server-only'

import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type Part,
} from '@google/genai'
import type Anthropic from '@anthropic-ai/sdk'

import {
  FORCED_TEXT_NUDGE,
  TOOL_BUDGET_NUDGE,
  TOOL_EVENT_DELIMITER,
  sanitizeError,
  successfulToolTerminalText,
  stringifyMessageContent,
} from '@/lib/services/llm-shared'
import type { CallLLMWithToolsOptions, ToolExecutor } from '@/lib/services/llm-shared'

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
const DEFAULT_GEMINI_THINKING_LEVEL = ThinkingLevel.MEDIUM
const MAX_GEMINI_TOOL_ROUNDS = 16
const MAX_OUTPUT_TOKENS = 4096

let client: GoogleGenAI | null = null

function getClient(apiKey: string): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey })
  }
  return client
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveThinkingLevel(value: string | undefined): ThinkingLevel {
  switch (value?.trim().toLowerCase()) {
    case 'low':
      return ThinkingLevel.LOW
    case 'high':
      return ThinkingLevel.HIGH
    case 'medium':
      return ThinkingLevel.MEDIUM
    default:
      return DEFAULT_GEMINI_THINKING_LEVEL
  }
}

function resolveRequestTimeoutMs(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function toGeminiTool(tool: Anthropic.Tool): FunctionDeclaration {
  return {
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    parametersJsonSchema: tool.input_schema ?? { type: 'object', properties: {} },
  }
}

function toGeminiContents(messages: Anthropic.MessageParam[]): Content[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: stringifyMessageContent(message.content) }],
  }))
}

function buildGenerationConfig(
  systemPrompt: string,
  functionDeclarations: FunctionDeclaration[],
  options: CallLLMWithToolsOptions,
  thinkingLevel: ThinkingLevel,
  forcedTextRound: boolean,
): GenerateContentConfig {
  const requestTimeoutMs = resolveRequestTimeoutMs(options.requestTimeoutMs)
  const config: GenerateContentConfig = {
    systemInstruction: systemPrompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    thinkingConfig: { thinkingLevel },
    ...(options.signal ? { abortSignal: options.signal } : {}),
    ...(requestTimeoutMs ? { httpOptions: { timeout: requestTimeoutMs } } : {}),
  }

  if (functionDeclarations.length === 0) return config

  config.tools = [{ functionDeclarations }]
  config.toolConfig = {
    functionCallingConfig: {
      mode: forcedTextRound
        ? FunctionCallingConfigMode.NONE
        : options.requiredToolName
          ? FunctionCallingConfigMode.ANY
          : FunctionCallingConfigMode.AUTO,
      ...(!forcedTextRound && options.requiredToolName
        ? { allowedFunctionNames: [options.requiredToolName] }
        : {}),
    },
  }

  return config
}

/**
 * Calls Gemini with the app's existing tool contract. The exact model content
 * is retained between rounds because Gemini requires thought signatures from a
 * tool-call response to be echoed unchanged with its function responses.
 */
export async function callGeminiWithTools(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[],
  executeTool: ToolExecutor,
  options: CallLLMWithToolsOptions = {},
): Promise<ReadableStream<string>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
  const thinkingLevel = resolveThinkingLevel(process.env.GEMINI_THINKING_LEVEL)
  const functionDeclarations = tools.map(toGeminiTool)
  const gemini = getClient(apiKey)

  return new ReadableStream<string>({
    async start(controller) {
      const currentContents = toGeminiContents(messages)
      let streamedAnyText = false
      let forcedTextRound = false

      try {
        for (let round = 0; round <= MAX_GEMINI_TOOL_ROUNDS; round++) {
          if (options.signal?.aborted) break

          if (round === MAX_GEMINI_TOOL_ROUNDS && !forcedTextRound) {
            currentContents.push({ role: 'user', parts: [{ text: TOOL_BUDGET_NUDGE }] })
            forcedTextRound = true
          }

          const response = await gemini.models.generateContent({
            model,
            contents: currentContents,
            config: buildGenerationConfig(
              systemPrompt,
              functionDeclarations,
              options,
              thinkingLevel,
              forcedTextRound,
            ),
          })
          const functionCalls = response.functionCalls ?? []
          const responseContent = response.candidates?.[0]?.content

          if (functionCalls.length === 0) {
            const text = response.text ?? ''
            if (text) {
              controller.enqueue(text)
              streamedAnyText ||= Boolean(text.trim())
            }

            if (!streamedAnyText && !forcedTextRound) {
              if (responseContent) currentContents.push(responseContent)
              currentContents.push({ role: 'user', parts: [{ text: FORCED_TEXT_NUDGE }] })
              forcedTextRound = true
              continue
            }

            controller.close()
            return
          }

          if (!responseContent) {
            throw new Error('Gemini API returned function calls without candidate content')
          }

          // Keep this content verbatim rather than rebuilding it from the
          // function calls. That preserves Gemini thought signatures.
          currentContents.push(responseContent)
          const functionResponses: Part[] = []

          for (const functionCall of functionCalls) {
            if (options.signal?.aborted) break

            if (!functionCall.name) {
              throw new Error('Gemini API returned a function call without a name')
            }

            const toolName = functionCall.name
            const toolInput = isRecord(functionCall.args) ? functionCall.args : {}

            controller.enqueue(
              `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool: toolName, status: 'start' })}\n`,
            )

            const result = await executeTool(toolName, toolInput)
            options.onToolResult?.(toolName, toolInput, result)

            if (result.data) {
              controller.enqueue(
                `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool: toolName, data: result.data })}\n`,
              )
            }

            const terminalText = options.signal?.aborted ? null : successfulToolTerminalText(result)
            if (terminalText) {
              controller.enqueue(terminalText)
              controller.close()
              return
            }

            functionResponses.push({
              functionResponse: {
                ...(functionCall.id ? { id: functionCall.id } : {}),
                name: toolName,
                response: result.isError ? { error: result.content } : { output: result.content },
              },
            })
          }

          if (functionResponses.length > 0 && !options.signal?.aborted) {
            currentContents.push({ role: 'user', parts: functionResponses })
          }
        }

        controller.close()
      } catch (err) {
        // The SDK confirms that an AbortSignal cannot cancel work already
        // accepted by Gemini, but it does stop this server from issuing later
        // tool rounds. Treat that user-requested stop as a clean completion.
        if (options.signal?.aborted) {
          controller.close()
          return
        }

        controller.error(new Error(sanitizeError(err)))
      }
    },
  })
}
