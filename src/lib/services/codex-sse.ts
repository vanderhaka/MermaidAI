/**
 * Incremental SSE reader for the ChatGPT Codex `/responses` endpoint.
 *
 * The stream mixes keep-alives, comment lines and event types we ignore, so
 * anything unparseable is skipped rather than treated as a failure — only
 * `response.failed` and a non-2xx status mean the round is dead.
 */

export type CodexContentPart = {
  type?: string
  text?: string
}

export type CodexOutputItem = {
  type?: string
  /** Present from `response.output_item.added`; matches `item_id` on deltas. */
  id?: string
  role?: string
  /** `commentary` narrates tool calls; `final_answer` is addressed to the user. */
  phase?: string
  call_id?: string
  name?: string
  arguments?: string
  content?: CodexContentPart[]
}

export type CodexEvent = {
  type?: string
  delta?: string
  /** Set on `response.output_text.delta` — the id of the item being filled in. */
  item_id?: string
  output_index?: number
  item?: CodexOutputItem
  response?: unknown
  error?: unknown
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSseLine(line: string): CodexEvent | null {
  if (!line.startsWith('data:')) return null

  const raw = line.slice(5).trim()
  if (!raw || raw === '[DONE]') return null

  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function* readCodexEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<CodexEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // The trailing fragment may be half an event — hold it for the next chunk.
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const event = parseSseLine(line)
        if (event) yield event
      }
    }

    const trailing = parseSseLine(buffer)
    if (trailing) yield trailing
  } finally {
    reader.releaseLock()
  }
}

export function outputItemText(item: CodexOutputItem): string {
  if (!Array.isArray(item.content)) return ''

  return item.content
    .map((part) => (part?.type === 'output_text' && typeof part.text === 'string' ? part.text : ''))
    .join('')
}

/** Pulls a human-readable reason out of a `response.failed` event, if present. */
export function codexFailureMessage(event: CodexEvent): string {
  const response = isRecord(event.response) ? event.response : {}
  const error = isRecord(response.error) ? response.error : isRecord(event.error) ? event.error : {}
  const message = typeof error.message === 'string' ? error.message : ''
  return message ? `Codex response failed: ${message}` : 'Codex response failed'
}
