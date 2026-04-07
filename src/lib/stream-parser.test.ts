// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createStreamParser } from '@/lib/stream-parser'
import { TOOL_EVENT_DELIMITER } from '@/lib/services/llm-client'

describe('createStreamParser', () => {
  it('passes through a chunk with no delimiter as text', () => {
    const parser = createStreamParser()
    const result = parser.push('Hello world')
    expect(result.text).toBe('Hello world')
    expect(result.events).toEqual([])
  })

  it('parses a complete delimiter and tool event in a single chunk', () => {
    const event = { tool: 'create_module', data: { name: 'Auth' } }
    const chunk = `Some text${TOOL_EVENT_DELIMITER}${JSON.stringify(event)}\n`
    const parser = createStreamParser()
    const result = parser.push(chunk)
    expect(result.text).toBe('Some text')
    expect(result.events).toEqual([event])
  })

  it('handles multiple complete delimiters in one chunk', () => {
    const event1 = { tool: 'create_module', data: { name: 'Auth' } }
    const event2 = { tool: 'create_module', data: { name: 'Payments' } }
    const chunk = `Hello${TOOL_EVENT_DELIMITER}${JSON.stringify(event1)}\n${TOOL_EVENT_DELIMITER}${JSON.stringify(event2)}\n`
    const parser = createStreamParser()
    const result = parser.push(chunk)
    expect(result.text).toBe('Hello')
    expect(result.events).toEqual([event1, event2])
  })

  it('reassembles a delimiter split across two chunks', () => {
    const event = { tool: 'create_module', data: { name: 'Auth' } }
    const fullDelimiter = TOOL_EVENT_DELIMITER
    // Split the delimiter in the middle
    const splitPoint = Math.floor(fullDelimiter.length / 2)
    const chunk1 = `Hello${fullDelimiter.slice(0, splitPoint)}`
    const chunk2 = `${fullDelimiter.slice(splitPoint)}${JSON.stringify(event)}\n`

    const parser = createStreamParser()
    const result1 = parser.push(chunk1)
    const result2 = parser.push(chunk2)

    // First chunk should emit only partial text (no raw delimiter chars in display)
    // Second chunk completes the delimiter and parses the event
    const combinedText = result1.text + result2.text
    const combinedEvents = [...result1.events, ...result2.events]

    expect(combinedText).toBe('Hello')
    expect(combinedEvents).toEqual([event])
  })

  it('buffers a partial delimiter at end of chunk', () => {
    const fullDelimiter = TOOL_EVENT_DELIMITER
    // Send just the first character of the delimiter
    const chunk = `Text${fullDelimiter[0]}`
    const parser = createStreamParser()
    const result = parser.push(chunk)

    // The partial delimiter character should NOT appear in text yet
    // (it's buffered waiting for more data)
    expect(result.text).toBe('Text')
    expect(result.events).toEqual([])
  })

  it('flushes remaining buffer as text when stream ends', () => {
    const fullDelimiter = TOOL_EVENT_DELIMITER
    // Send a partial delimiter that will never complete
    const chunk = `Text${fullDelimiter.slice(0, 3)}`
    const parser = createStreamParser()
    parser.push(chunk)
    const flushed = parser.flush()

    // The partial delimiter chars should be emitted as text on flush
    expect(flushed.text).toBe(fullDelimiter.slice(0, 3))
    expect(flushed.events).toEqual([])
  })

  it('does not emit raw JSON in display text for valid events', () => {
    const event = { tool: 'create_module', data: { name: 'Auth' } }
    const json = JSON.stringify(event)
    const chunk = `Before${TOOL_EVENT_DELIMITER}${json}\nAfter`

    const parser = createStreamParser()
    const result = parser.push(chunk)

    expect(result.text).not.toContain(json)
    expect(result.text).not.toContain('"tool"')
    expect(result.events).toEqual([event])
  })

  it('handles text after a tool event in the same chunk', () => {
    const event = { tool: 'create_module', data: { name: 'Auth' } }
    const chunk = `Before${TOOL_EVENT_DELIMITER}${JSON.stringify(event)}\nAfter`

    const parser = createStreamParser()
    const result = parser.push(chunk)

    expect(result.text).toBe('BeforeAfter')
    expect(result.events).toEqual([event])
  })

  it('handles an empty chunk', () => {
    const parser = createStreamParser()
    const result = parser.push('')
    expect(result.text).toBe('')
    expect(result.events).toEqual([])
  })

  it('handles flush with no prior data', () => {
    const parser = createStreamParser()
    const result = parser.flush()
    expect(result.text).toBe('')
    expect(result.events).toEqual([])
  })
})
