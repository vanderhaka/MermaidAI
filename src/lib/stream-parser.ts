import { TOOL_EVENT_DELIMITER } from '@/lib/services/llm-client'

export interface ToolEvent {
  tool: string
  data: Record<string, unknown>
}

export interface ParseResult {
  text: string
  events: ToolEvent[]
}

export interface StreamParser {
  push(chunk: string): ParseResult
  flush(): ParseResult
}

/**
 * Creates a stateful stream parser that correctly handles TOOL_EVENT_DELIMITER
 * being split across chunk boundaries.
 */
export function createStreamParser(): StreamParser {
  let buffer = ''

  function parse(input: string, isFlushing: boolean): ParseResult {
    buffer += input
    let text = ''
    const events: ToolEvent[] = []

    while (true) {
      const delimIdx = buffer.indexOf(TOOL_EVENT_DELIMITER)

      if (delimIdx === -1) {
        if (isFlushing) {
          // No more data coming — emit everything as text
          text += buffer
          buffer = ''
        } else {
          // Check if the end of the buffer could be the start of a delimiter
          // Keep the longest suffix that matches a prefix of the delimiter
          let overlap = 0
          for (let len = 1; len < TOOL_EVENT_DELIMITER.length && len <= buffer.length; len++) {
            const suffix = buffer.slice(buffer.length - len)
            const prefix = TOOL_EVENT_DELIMITER.slice(0, len)
            if (suffix === prefix) {
              overlap = len
            }
          }
          // Emit everything except the potential partial delimiter
          text += buffer.slice(0, buffer.length - overlap)
          buffer = buffer.slice(buffer.length - overlap)
        }
        break
      }

      // Emit text before the delimiter
      text += buffer.slice(0, delimIdx)

      // Skip past the delimiter
      const afterDelim = buffer.slice(delimIdx + TOOL_EVENT_DELIMITER.length)

      // Find the end of the JSON payload (terminated by newline)
      const newlineIdx = afterDelim.indexOf('\n')
      if (newlineIdx === -1) {
        // JSON payload may be incomplete — keep in buffer
        buffer = buffer.slice(delimIdx)
        if (isFlushing) {
          // Stream ended mid-event — discard the delimiter, emit rest as text
          text += buffer.slice(TOOL_EVENT_DELIMITER.length)
          buffer = ''
        }
        break
      }

      const jsonStr = afterDelim.slice(0, newlineIdx).trim()
      buffer = afterDelim.slice(newlineIdx + 1)

      if (jsonStr) {
        try {
          const event = JSON.parse(jsonStr) as ToolEvent
          events.push(event)
        } catch {
          // Invalid JSON — treat as text
          text += jsonStr
        }
      }
    }

    return { text, events }
  }

  return {
    push(chunk: string): ParseResult {
      return parse(chunk, false)
    },
    flush(): ParseResult {
      return parse('', true)
    },
  }
}
