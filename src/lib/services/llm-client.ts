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

export async function callLLM(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
): Promise<ReadableStream<string>> {
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL

  let stream: ReturnType<Anthropic['messages']['stream']>

  try {
    stream = getClient().messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: messages as Anthropic.MessageParam[],
    })
  } catch (error) {
    throw new Error(sanitizeError(error))
  }

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

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // Strip anything that looks like an API key
  const sanitized = message.replace(/sk-ant[^\s]*/gi, '[REDACTED]')
  return `LLM request failed: ${sanitized}`
}
