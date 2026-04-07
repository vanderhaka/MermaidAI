// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockGetUser = vi.fn()
const mockSupabase = { auth: { getUser: mockGetUser } }
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

const mockCallLLM = vi.fn()
vi.mock('@/lib/services/llm-client', () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
}))

const mockBuildSystemPrompt = vi.fn()
vi.mock('@/lib/services/prompt-builder', () => ({
  buildSystemPrompt: (...args: unknown[]) => mockBuildSystemPrompt(...args),
}))

const mockParseLLMResponse = vi.fn()
vi.mock('@/lib/services/llm-response-parser', () => ({
  parseLLMResponse: (...args: unknown[]) => mockParseLLMResponse(...args),
}))

const mockExecuteOperations = vi.fn()
vi.mock('@/lib/services/graph-operation-executor', () => ({
  executeOperations: (...args: unknown[]) => mockExecuteOperations(...args),
}))

const mockAddChatMessage = vi.fn()
vi.mock('@/lib/services/chat-message-service', () => ({
  addChatMessage: (...args: unknown[]) => mockAddChatMessage(...args),
}))

// --- Helpers ---

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
}

function validBody() {
  return {
    projectId: 'proj-1',
    message: 'Create an auth module',
    mode: 'discovery',
    context: {
      projectId: 'proj-1',
      projectName: 'Test Project',
      activeModuleId: null,
      mode: 'discovery',
      modules: [],
    },
    history: [{ role: 'user', content: 'Hello' }],
  }
}

async function readStreamToString(response: Response): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  return result
}

// --- Tests ---

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    })

    // Default: prompt builder returns a system prompt
    mockBuildSystemPrompt.mockReturnValue('You are a helpful assistant.')

    // Default: LLM returns a simple stream
    mockCallLLM.mockResolvedValue(makeStream(['Hello', ' world']))

    // Default: parser returns message with no ops
    mockParseLLMResponse.mockReturnValue({
      message: 'Hello world',
      operations: [],
    })

    // Default: executor succeeds
    mockExecuteOperations.mockResolvedValue({
      success: true,
      results: [],
    })

    // Default: message persistence succeeds
    mockAddChatMessage.mockResolvedValue({
      success: true,
      data: {
        id: 'msg-1',
        project_id: 'proj-1',
        role: 'user',
        content: 'test',
        created_at: '2026-01-01T00:00:00Z',
      },
    })
  })

  // --- Input validation ---

  it('returns 400 for missing projectId', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const body = validBody()
    delete (body as Record<string, unknown>).projectId

    const response = await POST(makeRequest(body))
    expect(response.status).toBe(400)

    const json = await response.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 400 for missing message', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const body = validBody()
    delete (body as Record<string, unknown>).message

    const response = await POST(makeRequest(body))
    expect(response.status).toBe(400)

    const json = await response.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 400 for empty message', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const body = { ...validBody(), message: '   ' }

    const response = await POST(makeRequest(body))
    expect(response.status).toBe(400)

    const json = await response.json()
    expect(json).toHaveProperty('error')
  })

  it('returns 400 for invalid mode', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const body = { ...validBody(), mode: 'invalid_mode' }

    const response = await POST(makeRequest(body))
    expect(response.status).toBe(400)

    const json = await response.json()
    expect(json).toHaveProperty('error')
  })

  // --- Auth ---

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    })

    const { POST } = await import('@/app/api/chat/route')
    const response = await POST(makeRequest(validBody()))

    expect(response.status).toBe(401)
    const json = await response.json()
    expect(json).toHaveProperty('error')
  })

  // --- Streaming ---

  it('returns a streaming response on success', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const response = await POST(makeRequest(validBody()))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.body).toBeInstanceOf(ReadableStream)
  })

  it('streams text tokens from the LLM', async () => {
    mockCallLLM.mockResolvedValue(makeStream(['chunk1', 'chunk2', 'chunk3']))

    const { POST } = await import('@/app/api/chat/route')
    const response = await POST(makeRequest(validBody()))
    const text = await readStreamToString(response)

    // The stream should contain the text chunks
    expect(text).toContain('chunk1')
    expect(text).toContain('chunk2')
    expect(text).toContain('chunk3')
  })

  // --- Prompt building ---

  it('calls buildSystemPrompt with correct mode and context', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const body = validBody()

    await POST(makeRequest(body))

    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      'discovery',
      expect.objectContaining({
        projectName: 'Test Project',
      }),
    )
  })

  // --- LLM call ---

  it('calls callLLM with system prompt and message history', async () => {
    mockBuildSystemPrompt.mockReturnValue('System prompt here')

    const { POST } = await import('@/app/api/chat/route')
    const body = validBody()

    await POST(makeRequest(body))

    expect(mockCallLLM).toHaveBeenCalledWith(
      'System prompt here',
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'Hello' }),
        expect.objectContaining({ role: 'user', content: 'Create an auth module' }),
      ]),
    )
  })

  // --- Response parsing + operations ---

  it('parses the full response and executes operations after stream completes', async () => {
    const ops = [{ type: 'create_module', payload: { name: 'Auth' } }]
    mockCallLLM.mockResolvedValue(makeStream(['Some ', 'response']))
    mockParseLLMResponse.mockReturnValue({ message: 'Some response', operations: ops })
    mockExecuteOperations.mockResolvedValue({
      success: true,
      results: [{ operation: 'create_module', success: true }],
    })

    const { POST } = await import('@/app/api/chat/route')
    const response = await POST(makeRequest(validBody()))

    // Consume the entire stream to trigger post-stream processing
    await readStreamToString(response)

    // Give micro-task queue a chance to flush
    await new Promise((r) => setTimeout(r, 50))

    expect(mockParseLLMResponse).toHaveBeenCalledWith('Some response')
    expect(mockExecuteOperations).toHaveBeenCalledWith(ops, { projectId: 'proj-1' })
  })

  it('skips executeOperations when no operations are parsed', async () => {
    mockParseLLMResponse.mockReturnValue({ message: 'Just text', operations: [] })

    const { POST } = await import('@/app/api/chat/route')
    const response = await POST(makeRequest(validBody()))
    await readStreamToString(response)
    await new Promise((r) => setTimeout(r, 50))

    expect(mockExecuteOperations).not.toHaveBeenCalled()
  })

  // --- Message persistence ---

  it('persists the user message to chat_messages', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const response = await POST(makeRequest(validBody()))
    await readStreamToString(response)
    await new Promise((r) => setTimeout(r, 50))

    expect(mockAddChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'proj-1',
        role: 'user',
        content: 'Create an auth module',
      }),
    )
  })

  it('persists the assistant message to chat_messages after stream', async () => {
    mockCallLLM.mockResolvedValue(makeStream(['AI ', 'reply']))
    mockParseLLMResponse.mockReturnValue({ message: 'AI reply', operations: [] })

    const { POST } = await import('@/app/api/chat/route')
    const response = await POST(makeRequest(validBody()))
    await readStreamToString(response)
    await new Promise((r) => setTimeout(r, 50))

    expect(mockAddChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'proj-1',
        role: 'assistant',
        content: 'AI reply',
      }),
    )
  })

  // --- Error handling ---

  it('returns 500 JSON error when LLM call fails', async () => {
    mockCallLLM.mockRejectedValue(new Error('LLM request failed: service down'))

    const { POST } = await import('@/app/api/chat/route')
    const response = await POST(makeRequest(validBody()))

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json).toHaveProperty('error')
    expect(json.error).not.toContain('sk-ant')
  })

  it('returns error JSON when request body is not valid JSON', async () => {
    const { POST } = await import('@/app/api/chat/route')
    const request = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json).toHaveProperty('error')
  })
})
