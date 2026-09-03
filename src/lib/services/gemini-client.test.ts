// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

vi.mock('server-only', () => ({}))

const mockGenerateContent = vi.fn()
const mockClientConstructor = vi.fn()

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mockGenerateContent }

    constructor(options: unknown) {
      mockClientConstructor(options)
    }
  }

  return {
    GoogleGenAI: MockGoogleGenAI,
    FunctionCallingConfigMode: { AUTO: 'AUTO', ANY: 'ANY', NONE: 'NONE' },
    ThinkingLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
  }
})

const CREATE_NODE_TOOL: Anthropic.Tool = {
  name: 'create_node',
  description: 'Create a node in a module.',
  input_schema: {
    type: 'object',
    properties: {
      moduleId: { type: 'string' },
      label: { type: 'string' },
    },
    required: ['moduleId', 'label'],
  },
}

async function readStreamToString(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let text = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) return text
    text += value
  }
}

function textResponse(text: string) {
  return {
    text,
    functionCalls: [],
    candidates: [{ content: { role: 'model', parts: [{ text }] } }],
  }
}

describe('gemini-client', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    mockGenerateContent.mockReset()
    mockClientConstructor.mockReset()
    process.env = { ...originalEnv, GEMINI_API_KEY: 'test-gemini-key' }
    delete process.env.GEMINI_MODEL
    delete process.env.GEMINI_THINKING_LEVEL
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('requires a Gemini API key before creating a client', async () => {
    delete process.env.GEMINI_API_KEY
    const { callGeminiWithTools } = await import('@/lib/services/gemini-client')

    await expect(
      callGeminiWithTools('System prompt', [{ role: 'user', content: 'Hello' }], [], vi.fn()),
    ).rejects.toThrow('GEMINI_API_KEY is not configured')

    expect(mockClientConstructor).not.toHaveBeenCalled()
  })

  it('uses Gemini 3.8 Flash with medium thinking by default', async () => {
    mockGenerateContent.mockResolvedValue(textResponse('Built the flow.'))
    const { callGeminiWithTools } = await import('@/lib/services/gemini-client')

    const stream = await callGeminiWithTools(
      'System prompt',
      [{ role: 'user', content: 'Create a checkout flow' }],
      [CREATE_NODE_TOOL],
      vi.fn(),
    )

    await expect(readStreamToString(stream)).resolves.toBe('Built the flow.')
    expect(mockClientConstructor).toHaveBeenCalledWith({ apiKey: 'test-gemini-key' })
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: 'Create a checkout flow' }] }],
      config: {
        systemInstruction: 'System prompt',
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: 'MEDIUM' },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'create_node',
                description: 'Create a node in a module.',
                parametersJsonSchema: CREATE_NODE_TOOL.input_schema,
              },
            ],
          },
        ],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      },
    })
  })

  it('allows lower Gemini thinking for a speed-focused trial', async () => {
    process.env.GEMINI_THINKING_LEVEL = 'low'
    mockGenerateContent.mockResolvedValue(textResponse('Built the flow.'))
    const { callGeminiWithTools } = await import('@/lib/services/gemini-client')

    const stream = await callGeminiWithTools(
      'System prompt',
      [{ role: 'user', content: 'Create a checkout flow' }],
      [],
      vi.fn(),
    )

    await readStreamToString(stream)
    expect(mockGenerateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
      thinkingLevel: 'LOW',
    })
  })

  it('passes an explicit provider request deadline to the Gemini SDK', async () => {
    mockGenerateContent.mockResolvedValue(textResponse('Built the flow.'))
    const { callGeminiWithTools } = await import('@/lib/services/gemini-client')

    const stream = await callGeminiWithTools(
      'System prompt',
      [{ role: 'user', content: 'Create a checkout flow' }],
      [],
      vi.fn(),
      { requestTimeoutMs: 1_234 },
    )

    await readStreamToString(stream)
    expect(mockGenerateContent.mock.calls[0][0].config.httpOptions).toEqual({ timeout: 1_234 })
  })

  it('restricts a required tool and preserves the exact Gemini response in the continuation', async () => {
    const functionCall = {
      id: 'call-123',
      name: 'create_node',
      args: { moduleId: 'module-7', label: 'Check entitlement' },
    }
    const modelContent = {
      role: 'model',
      parts: [
        {
          thought: true,
          thoughtSignature: 'opaque-thought-signature',
          functionCall,
        },
      ],
    }
    mockGenerateContent
      .mockResolvedValueOnce({
        functionCalls: [functionCall],
        candidates: [{ content: modelContent }],
      })
      .mockResolvedValueOnce(textResponse('The entitlement check is now in place.'))
    const executeTool = vi.fn().mockResolvedValue({
      content: 'Created node node-9',
      isError: false,
      data: { id: 'node-9' },
    })
    const onToolResult = vi.fn()
    const { callGeminiWithTools } = await import('@/lib/services/gemini-client')

    const stream = await callGeminiWithTools(
      'System prompt',
      [{ role: 'user', content: 'Add the entitlement check.' }],
      [CREATE_NODE_TOOL],
      executeTool,
      { requiredToolName: 'create_node', onToolResult },
    )

    const text = await readStreamToString(stream)

    expect(executeTool).toHaveBeenCalledWith('create_node', {
      moduleId: 'module-7',
      label: 'Check entitlement',
    })
    expect(onToolResult).toHaveBeenCalledWith(
      'create_node',
      { moduleId: 'module-7', label: 'Check entitlement' },
      expect.objectContaining({ content: 'Created node node-9' }),
    )
    expect(text).toContain('"tool":"create_node","status":"start"')
    expect(text).toContain('"tool":"create_node","data":{"id":"node-9"}')
    expect(text).toContain('The entitlement check is now in place.')

    expect(mockGenerateContent.mock.calls[0][0].config.toolConfig).toEqual({
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: ['create_node'],
      },
    })
    expect(mockGenerateContent.mock.calls[1][0].contents).toEqual([
      { role: 'user', parts: [{ text: 'Add the entitlement check.' }] },
      modelContent,
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'call-123',
              name: 'create_node',
              response: { output: 'Created node node-9' },
            },
          },
        ],
      },
    ])
  })

  it('does not make a continuation call after a successful terminal tool result', async () => {
    const functionCall = { id: 'call-456', name: 'create_node', args: { moduleId: 'module-7' } }
    mockGenerateContent.mockResolvedValue({
      functionCalls: [functionCall],
      candidates: [
        {
          content: { role: 'model', parts: [{ functionCall }] },
        },
      ],
    })
    const { callGeminiWithTools } = await import('@/lib/services/gemini-client')

    const stream = await callGeminiWithTools(
      'System prompt',
      [{ role: 'user', content: 'Create the node.' }],
      [CREATE_NODE_TOOL],
      vi.fn().mockResolvedValue({
        content: 'Created node node-9',
        isError: false,
        terminalText: 'Created the node.',
      }),
    )

    await expect(readStreamToString(stream)).resolves.toContain('Created the node.')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('does not issue a Gemini request when the turn was already stopped', async () => {
    const abortController = new AbortController()
    abortController.abort()
    const { callGeminiWithTools } = await import('@/lib/services/gemini-client')

    const stream = await callGeminiWithTools(
      'System prompt',
      [{ role: 'user', content: 'Create the node.' }],
      [CREATE_NODE_TOOL],
      vi.fn(),
      { signal: abortController.signal },
    )

    await expect(readStreamToString(stream)).resolves.toBe('')
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })
})
