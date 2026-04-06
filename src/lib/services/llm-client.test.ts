// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function createMockStream() {
  const callbacks: Record<string, ((...args: unknown[]) => void)[]> = {}
  return {
    on(event: string, cb: (...args: unknown[]) => void) {
      if (!callbacks[event]) callbacks[event] = []
      callbacks[event].push(cb)
      return this
    },
    emit(event: string, ...args: unknown[]) {
      callbacks[event]?.forEach((cb) => cb(...args))
    },
    finalMessage: vi.fn(),
  }
}

let mockStreamInstance = createMockStream()
const mockStreamFn = vi.fn(() => mockStreamInstance)
let constructorCallCount = 0

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { stream: mockStreamFn }
    constructor() {
      constructorCallCount++
    }
  }
  return { default: MockAnthropic }
})

describe('llm-client', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    mockStreamInstance = createMockStream()
    mockStreamFn.mockReturnValue(mockStreamInstance)
    constructorCallCount = 0
    process.env = {
      ...originalEnv,
      ANTHROPIC_API_KEY: 'test-api-key',
    }
  })

  afterEach(() => {
    process.env = originalEnv
    mockStreamFn.mockClear()
  })

  describe('callLLM', () => {
    it('returns a ReadableStream of text chunks', async () => {
      const { callLLM } = await import('@/lib/services/llm-client')

      const stream = await callLLM('You are helpful.', [{ role: 'user', content: 'Hello' }])

      expect(stream).toBeInstanceOf(ReadableStream)
    })

    it('uses claude-sonnet-4-6 as default model', async () => {
      const { callLLM } = await import('@/lib/services/llm-client')

      await callLLM('System prompt', [{ role: 'user', content: 'Hi' }])

      expect(mockStreamFn).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
        }),
      )
    })

    it('allows model override via AI_MODEL env var', async () => {
      process.env.AI_MODEL = 'claude-haiku-4-5-20251001'

      const { callLLM } = await import('@/lib/services/llm-client')

      await callLLM('System prompt', [{ role: 'user', content: 'Hi' }])

      expect(mockStreamFn).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
        }),
      )
    })

    it('passes system prompt and messages to the API', async () => {
      const { callLLM } = await import('@/lib/services/llm-client')

      const systemPrompt = 'You are an expert flowchart designer.'
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: 'Create a login flow' },
        { role: 'assistant', content: 'Sure, here is a login flow.' },
        { role: 'user', content: 'Add error handling' },
      ]

      await callLLM(systemPrompt, messages)

      expect(mockStreamFn).toHaveBeenCalledWith(
        expect.objectContaining({
          system: systemPrompt,
          messages,
          max_tokens: expect.any(Number),
        }),
      )
    })

    it('streams text chunks through the ReadableStream', async () => {
      const { callLLM } = await import('@/lib/services/llm-client')
      const stream = await callLLM('System', [{ role: 'user', content: 'Hi' }])

      // Simulate text deltas then close
      mockStreamInstance.emit('text', 'Hello')
      mockStreamInstance.emit('text', ' world')
      mockStreamInstance.emit('end')

      const reader = stream.getReader()
      const chunks: string[] = []
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      expect(chunks).toEqual(['Hello', ' world'])
    })

    it('throws sanitized error on API failure (no keys leaked)', async () => {
      const { callLLM } = await import('@/lib/services/llm-client')
      const stream = await callLLM('System', [{ role: 'user', content: 'Hi' }])

      // Simulate an API error containing a key
      mockStreamInstance.emit(
        'error',
        new Error('Authentication failed for key sk-ant-api03-secret-key-here'),
      )

      const reader = stream.getReader()
      try {
        await reader.read()
        expect.fail('Should have thrown')
      } catch (err) {
        const message = (err as Error).message
        expect(message).not.toContain('sk-ant')
        expect(message).not.toContain('secret')
        expect(message).toContain('LLM')
      }
    })

    it('uses Anthropic SDK singleton pattern', async () => {
      const { callLLM } = await import('@/lib/services/llm-client')

      await callLLM('System', [{ role: 'user', content: 'Hi' }])
      await callLLM('System', [{ role: 'user', content: 'Hello again' }])

      // stream called twice but constructor only once (singleton)
      expect(mockStreamFn).toHaveBeenCalledTimes(2)
      expect(constructorCallCount).toBe(1)
    })
  })
})
