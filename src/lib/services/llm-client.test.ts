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

describe('sanitizeError', () => {
  it('redacts Anthropic API keys (sk-ant-...)', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError(new Error('Auth failed for sk-ant-api03-secret-key'))
    expect(result).not.toContain('sk-ant')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts Supabase/Postgres connection strings', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError(
      new Error('Connection failed: postgresql://user:pass@db.supabase.co:5432/postgres'),
    )
    expect(result).not.toContain('postgresql://')
    expect(result).not.toContain('supabase.co')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts absolute file paths (/Users/...)', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError(
      new Error('File not found: /Users/james/projects/secret/config.ts'),
    )
    expect(result).not.toContain('/Users/')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts absolute file paths (/home/...)', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError(new Error('ENOENT: /home/deploy/.env.local'))
    expect(result).not.toContain('/home/')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts Stripe live keys (sk_live_...)', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError(new Error('Stripe error with key sk_live_abc123def456'))
    expect(result).not.toContain('sk_live_')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts Stripe test keys (sk_test_...)', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError(new Error('Invalid key sk_test_xyz789'))
    expect(result).not.toContain('sk_test_')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts internal hostnames', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError(new Error('Cannot connect to api.internal.company.io:8080'))
    expect(result).not.toContain('api.internal.company.io')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts IPv4 addresses', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError(new Error('Connection refused at 192.168.1.100:5432'))
    expect(result).not.toContain('192.168.1.100')
    expect(result).toContain('[REDACTED]')
  })

  it('handles non-Error inputs gracefully', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError('string error with sk-ant-api03-key')
    expect(result).not.toContain('sk-ant')
    expect(result).toContain('LLM request failed')
  })

  it('redacts multiple sensitive items in a single message', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError(
      new Error('Failed at /Users/dev/app: postgresql://u:p@10.0.0.5:5432/db key=sk_live_abc'),
    )
    expect(result).not.toContain('/Users/')
    expect(result).not.toContain('postgresql://')
    expect(result).not.toContain('10.0.0.5')
    expect(result).not.toContain('sk_live_')
  })
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

    it('uses claude-haiku-4-5 as default model', async () => {
      const { callLLM } = await import('@/lib/services/llm-client')

      await callLLM('System prompt', [{ role: 'user', content: 'Hi' }])

      expect(mockStreamFn).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
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
      const messages = [
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
