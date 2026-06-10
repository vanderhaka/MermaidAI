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

async function readStreamToString(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let result = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    result += value
  }
  return result
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

  it('redacts Cerebras API keys (csk-...)', async () => {
    const { sanitizeError } = await import('@/lib/services/llm-client')
    const result = sanitizeError(new Error('Auth failed for csk-secret-key'))
    expect(result).not.toContain('csk-')
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
    vi.unstubAllGlobals()
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

  describe('callLLMWithTools provider routing', () => {
    it('uses Cerebras Chat Completions by default', async () => {
      process.env.CEREBRAS_API_KEY = 'csk-test-key'
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Built the flow.', tool_calls: null } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      const { callLLMWithTools } = await import('@/lib/services/llm-client')
      const stream = await callLLMWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a checkout flow' }],
        [],
        vi.fn(),
      )

      await expect(readStreamToString(stream)).resolves.toBe('Built the flow.')
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.cerebras.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer csk-test-key',
            'Content-Type': 'application/json',
          }),
        }),
      )
      const [, init] = fetchMock.mock.calls[0]
      const body = JSON.parse(String(init.body))
      expect(body).toEqual(
        expect.objectContaining({
          model: 'gpt-oss-120b',
          tool_choice: 'auto',
          parallel_tool_calls: false,
          reasoning_effort: 'medium',
          max_completion_tokens: 2048,
        }),
      )
      expect(body.messages).toEqual([
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Create a checkout flow' },
      ])
    })

    it('allows Cerebras max completion tokens to be overridden by env', async () => {
      process.env.CEREBRAS_API_KEY = 'csk-test-key'
      process.env.CEREBRAS_MAX_COMPLETION_TOKENS = '2400'
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Built the flow.', tool_calls: null } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      const { callLLMWithTools } = await import('@/lib/services/llm-client')
      const stream = await callLLMWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a checkout flow' }],
        [],
        vi.fn(),
      )

      await readStreamToString(stream)
      const [, init] = fetchMock.mock.calls[0]
      const body = JSON.parse(String(init.body))
      expect(body.max_completion_tokens).toBe(2400)
    })

    it('uses the existing Anthropic stream when explicitly selected', async () => {
      mockStreamInstance.finalMessage.mockResolvedValue({
        stop_reason: 'end_turn',
        content: [],
      })

      const { callLLMWithTools } = await import('@/lib/services/llm-client')
      const stream = await callLLMWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a checkout flow' }],
        [],
        vi.fn(),
        { provider: 'anthropic' },
      )

      await readStreamToString(stream)
      expect(mockStreamFn).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
          system: 'System prompt',
          tool_choice: { type: 'auto', disable_parallel_tool_use: true },
        }),
      )
    })

    it('parses Cerebras tool calls, executes them, and continues with tool results', async () => {
      process.env.CEREBRAS_API_KEY = 'csk-test-key'
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: null,
                    reasoning: 'Need a node.',
                    tool_calls: [
                      {
                        id: 'call-1',
                        type: 'function',
                        function: {
                          name: 'create_node',
                          arguments:
                            '{"moduleId":"mod-1","label":"Collect order","nodeType":"process"}',
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                { message: { content: 'Created the order intake node.', tool_calls: null } },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      vi.stubGlobal('fetch', fetchMock)
      const executeTool = vi.fn().mockResolvedValue({
        content: 'Created node "Collect order"',
        isError: false,
        data: { node: { id: 'node-1', label: 'Collect order' } },
      })

      const { TOOL_EVENT_DELIMITER, callLLMWithTools } = await import('@/lib/services/llm-client')
      const stream = await callLLMWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create an order intake node' }],
        [
          {
            name: 'create_node',
            description: 'Create a node',
            input_schema: {
              type: 'object',
              properties: {
                moduleId: { type: 'string' },
                label: { type: 'string' },
                nodeType: { type: 'string' },
              },
              required: ['moduleId', 'label', 'nodeType'],
            },
          },
        ],
        executeTool,
      )

      const text = await readStreamToString(stream)

      expect(executeTool).toHaveBeenCalledWith('create_node', {
        moduleId: 'mod-1',
        label: 'Collect order',
        nodeType: 'process',
      })
      expect(text).toContain(`${TOOL_EVENT_DELIMITER}`)
      expect(text).toContain('Created the order intake node.')

      const [, secondInit] = fetchMock.mock.calls[1]
      const secondBody = JSON.parse(String(secondInit.body))
      expect(secondBody.messages).toContainEqual(
        expect.objectContaining({
          role: 'assistant',
          reasoning: 'Need a node.',
          tool_calls: [
            expect.objectContaining({
              id: 'call-1',
              function: expect.objectContaining({ name: 'create_node' }),
            }),
          ],
        }),
      )
      expect(secondBody.messages).toContainEqual({
        role: 'tool',
        tool_call_id: 'call-1',
        content: 'Created node "Collect order"',
      })
    })

    it('falls back to Anthropic when a follow-up Cerebras tool round is rate limited', async () => {
      process.env.CEREBRAS_API_KEY = 'csk-test-key'
      mockStreamInstance.finalMessage.mockImplementation(async () => {
        mockStreamInstance.emit('text', 'Finished the flow with Claude.')
        return {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Finished the flow with Claude.' }],
        }
      })
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: 'call-1',
                        type: 'function',
                        function: {
                          name: 'create_node',
                          arguments: '{"moduleId":"mod-1","label":"Collect order"}',
                        },
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { message: 'Too Many Requests' } }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'retry-after': '2',
              'x-ratelimit-remaining-tokens-minute': '0',
            },
          }),
        )
      vi.stubGlobal('fetch', fetchMock)
      const executeTool = vi.fn().mockResolvedValue({
        content: 'Created node "Collect order"',
        isError: false,
        data: { node: { id: 'node-1', label: 'Collect order' } },
      })

      const { TOOL_EVENT_DELIMITER, callLLMWithTools } = await import('@/lib/services/llm-client')
      const stream = await callLLMWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create an order intake node' }],
        [
          {
            name: 'create_node',
            description: 'Create a node',
            input_schema: {
              type: 'object',
              properties: {
                moduleId: { type: 'string' },
                label: { type: 'string' },
              },
              required: ['moduleId', 'label'],
            },
          },
        ],
        executeTool,
      )

      const text = await readStreamToString(stream)

      expect(executeTool).toHaveBeenCalledWith('create_node', {
        moduleId: 'mod-1',
        label: 'Collect order',
      })
      expect(text).toContain(`${TOOL_EVENT_DELIMITER}`)
      expect(text).not.toContain('OSS is temporarily rate limited by Cerebras')
      expect(text).toContain('Finished the flow with Claude.')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(mockStreamFn).toHaveBeenCalledTimes(1)

      const anthropicRequest = (
        mockStreamFn.mock.calls as unknown as Array<[{ messages: unknown[] }]>
      )[0]?.[0]
      const anthropicMessages = anthropicRequest?.messages
      expect(anthropicMessages).toContainEqual(
        expect.objectContaining({
          role: 'assistant',
          content: [
            expect.objectContaining({
              type: 'tool_use',
              id: 'call-1',
              name: 'create_node',
              input: {
                moduleId: 'mod-1',
                label: 'Collect order',
              },
            }),
          ],
        }),
      )
      expect(anthropicMessages).toContainEqual({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-1',
            content: 'Created node "Collect order"',
            is_error: undefined,
          },
        ],
      })
    })

    it('adapts tool JSON schema for Cerebras strict mode', async () => {
      const { adaptSchemaForCerebras } = await import('@/lib/services/llm-client')

      const adapted = adaptSchemaForCerebras({
        type: 'object',
        properties: {
          title: { type: ['string', 'null'], maxLength: 80, pattern: '.*' },
          tags: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', minLength: 1 },
              },
              required: ['label'],
            },
          },
        },
        required: ['title'],
      })

      expect(adapted).toEqual({
        type: 'object',
        properties: {
          title: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
          tags: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
              },
              required: ['label'],
              additionalProperties: false,
            },
          },
        },
        required: ['title'],
        additionalProperties: false,
      })
    })

    it('preserves non-nullable union types as anyOf for Cerebras', async () => {
      const { adaptSchemaForCerebras } = await import('@/lib/services/llm-client')

      const adapted = adaptSchemaForCerebras({
        type: 'object',
        properties: {
          value: { type: ['string', 'number'] },
          single: { type: ['string'] },
        },
        required: ['value'],
      })

      expect(adapted).toEqual({
        type: 'object',
        properties: {
          value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
          single: { type: 'string' },
        },
        required: ['value'],
        additionalProperties: false,
      })
    })
  })
})

describe('cerebras quota tracking', () => {
  const NOW = 1_000_000_000

  async function loadQuotaApi() {
    vi.resetModules()
    const mod = await import('@/lib/services/llm-client')
    mod.resetCerebrasQuotaForTests()
    return mod
  }

  it('blocks a turn when remaining requests-minute cannot cover a tool loop', async () => {
    const { updateCerebrasQuotaFromHeaders, isCerebrasQuotaExhausted } = await loadQuotaApi()
    updateCerebrasQuotaFromHeaders(
      new Headers({
        'x-ratelimit-remaining-requests-minute': '2',
        'x-ratelimit-remaining-tokens-minute': '30000',
        'x-ratelimit-remaining-tokens-day': '500000',
      }),
      NOW,
    )
    expect(isCerebrasQuotaExhausted(NOW + 1_000)).toBe(true)
  })

  it('blocks a turn when remaining tokens-minute is below the turn floor', async () => {
    const { updateCerebrasQuotaFromHeaders, isCerebrasQuotaExhausted } = await loadQuotaApi()
    updateCerebrasQuotaFromHeaders(
      new Headers({
        'x-ratelimit-remaining-requests-minute': '5',
        'x-ratelimit-remaining-tokens-minute': '4000',
        'x-ratelimit-remaining-tokens-day': '500000',
      }),
      NOW,
    )
    expect(isCerebrasQuotaExhausted(NOW + 1_000)).toBe(true)
  })

  it('allows turns when all buckets have headroom', async () => {
    const { updateCerebrasQuotaFromHeaders, isCerebrasQuotaExhausted } = await loadQuotaApi()
    updateCerebrasQuotaFromHeaders(
      new Headers({
        'x-ratelimit-remaining-requests-minute': '5',
        'x-ratelimit-remaining-tokens-minute': '30000',
        'x-ratelimit-remaining-tokens-day': '500000',
      }),
      NOW,
    )
    expect(isCerebrasQuotaExhausted(NOW + 1_000)).toBe(false)
  })

  it('ignores stale minute snapshots once the window has replenished', async () => {
    const { updateCerebrasQuotaFromHeaders, isCerebrasQuotaExhausted } = await loadQuotaApi()
    updateCerebrasQuotaFromHeaders(
      new Headers({
        'x-ratelimit-remaining-requests-minute': '0',
        'x-ratelimit-remaining-tokens-minute': '0',
        'x-ratelimit-remaining-tokens-day': '500000',
      }),
      NOW,
    )
    expect(isCerebrasQuotaExhausted(NOW + 80_000)).toBe(false)
  })

  it('treats day-bucket exhaustion as lasting beyond the minute window', async () => {
    const { updateCerebrasQuotaFromHeaders, isCerebrasQuotaExhausted } = await loadQuotaApi()
    updateCerebrasQuotaFromHeaders(
      new Headers({
        'x-ratelimit-remaining-requests-minute': '5',
        'x-ratelimit-remaining-tokens-minute': '30000',
        'x-ratelimit-remaining-tokens-day': '1000',
      }),
      NOW,
    )
    expect(isCerebrasQuotaExhausted(NOW + 5 * 60_000)).toBe(true)
    expect(isCerebrasQuotaExhausted(NOW + 11 * 60_000)).toBe(false)
  })

  it('markCerebrasRateLimited blocks turns even without headers', async () => {
    const { markCerebrasRateLimited, isCerebrasQuotaExhausted } = await loadQuotaApi()
    markCerebrasRateLimited(NOW)
    expect(isCerebrasQuotaExhausted(NOW + 1_000)).toBe(true)
    expect(isCerebrasQuotaExhausted(NOW + 80_000)).toBe(false)
  })

  it('never blocks without any quota information', async () => {
    const { isCerebrasQuotaExhausted } = await loadQuotaApi()
    expect(isCerebrasQuotaExhausted(NOW)).toBe(false)
  })
})

describe('cerebras retry-after blocking', () => {
  const NOW = 2_000_000_000

  async function loadQuotaApi() {
    vi.resetModules()
    const mod = await import('@/lib/services/llm-client')
    mod.resetCerebrasQuotaForTests()
    return mod
  }

  it('honors retry-after beyond the minute window, capped at 15 minutes', async () => {
    const { markCerebrasRateLimited, isCerebrasQuotaExhausted } = await loadQuotaApi()
    markCerebrasRateLimited(NOW, 86_400)
    expect(isCerebrasQuotaExhausted(NOW + 5 * 60_000)).toBe(true)
    expect(isCerebrasQuotaExhausted(NOW + 14 * 60_000)).toBe(true)
    expect(isCerebrasQuotaExhausted(NOW + 16 * 60_000)).toBe(false)
  })

  it('uses short retry-after values directly', async () => {
    const { markCerebrasRateLimited, isCerebrasQuotaExhausted } = await loadQuotaApi()
    markCerebrasRateLimited(NOW, 30)
    expect(isCerebrasQuotaExhausted(NOW + 20_000)).toBe(true)
    // after retry-after lapses but within the minute window the request-bucket
    // mark still applies; past the minute window everything clears
    expect(isCerebrasQuotaExhausted(NOW + 80_000)).toBe(false)
  })
})
