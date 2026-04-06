import Anthropic from '@anthropic-ai/sdk'

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      maxRetries: 2,
    })
  }
  return _client
}

export async function callLLM(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
): Promise<ReadableStream<string>> {
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL

  const stream = getClient().messages.stream({
    model,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
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
    cancel() {
      stream.abort()
    },
  })
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const sanitized = message.replace(/sk-ant[^\s]*/gi, '[REDACTED]')
  return `LLM request failed: ${sanitized}`
}
