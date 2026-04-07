// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockGetUser = vi.fn()
const mockSupabase = { auth: { getUser: mockGetUser } }
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

const mockCallLLMWithTools = vi.fn()
vi.mock('@/lib/services/llm-client', () => ({
  callLLMWithTools: (...args: unknown[]) => mockCallLLMWithTools(...args),
  TOOL_EVENT_DELIMITER: '\x1ETOOL_EVENT:',
}))

const mockBuildSystemPrompt = vi.fn()
vi.mock('@/lib/services/prompt-builder', () => ({
  buildSystemPrompt: (...args: unknown[]) => mockBuildSystemPrompt(...args),
}))

const mockGetToolsForMode = vi.fn()
const mockCreateToolExecutor = vi.fn()
vi.mock('@/lib/services/llm-tools', () => ({
  getToolsForMode: (...args: unknown[]) => mockGetToolsForMode(...args),
  createToolExecutor: (...args: unknown[]) => mockCreateToolExecutor(...args),
}))

const mockAddChatMessage = vi.fn()
vi.mock('@/lib/services/chat-message-service', () => ({
  addChatMessage: (...args: unknown[]) => mockAddChatMessage(...args),
}))

const mockListModulesByProject = vi.fn()
const mockGetModuleById = vi.fn()
vi.mock('@/lib/services/module-service', () => ({
  listModulesByProject: (...args: unknown[]) => mockListModulesByProject(...args),
  getModuleById: (...args: unknown[]) => mockGetModuleById(...args),
  createModule: vi.fn(),
  updateModule: vi.fn(),
  deleteModule: vi.fn(),
}))

const mockListConnectionsByProject = vi.fn()
vi.mock('@/lib/services/module-connection-service', () => ({
  listConnectionsByProject: (...args: unknown[]) => mockListConnectionsByProject(...args),
  connectModules: vi.fn(),
}))

const mockGetGraphForModule = vi.fn()
vi.mock('@/lib/services/graph-service', () => ({
  getGraphForModule: (...args: unknown[]) => mockGetGraphForModule(...args),
  addNode: vi.fn(),
  updateNode: vi.fn(),
  removeNode: vi.fn(),
  addEdge: vi.fn(),
  removeEdge: vi.fn(),
}))

const mockLoadModuleNotesForChat = vi.fn()
vi.mock('@/lib/module-notes/load-for-prompt', () => ({
  loadModuleNotesForChat: (...args: unknown[]) => mockLoadModuleNotesForChat(...args),
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
  const mockExecutor = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Default: authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    })

    // Default: prompt builder returns a system prompt
    mockBuildSystemPrompt.mockReturnValue('You are a helpful assistant.')

    // Default: tools for mode
    mockGetToolsForMode.mockReturnValue([
      { name: 'create_module', description: 'Create a module', input_schema: {} },
    ])

    // Default: tool executor factory
    mockCreateToolExecutor.mockReturnValue(mockExecutor)

    // Default: LLM returns a simple stream (tool loop handled internally)
    mockCallLLMWithTools.mockResolvedValue(makeStream(['Hello', ' world']))

    // Default: module/graph lookups return empty
    mockListModulesByProject.mockResolvedValue({ success: true, data: [] })
    mockGetModuleById.mockResolvedValue({ success: false, error: 'Not found' })
    mockGetGraphForModule.mockResolvedValue({ success: true, data: { nodes: [], edges: [] } })

    // Default: connections return empty
    mockListConnectionsByProject.mockResolvedValue({ success: true, data: [] })

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

    mockLoadModuleNotesForChat.mockResolvedValue({ source: 'none' as const, markdown: null })
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

  it('streams text from the LLM tool loop', async () => {
    mockCallLLMWithTools.mockResolvedValue(makeStream(['chunk1', 'chunk2', 'chunk3']))

    const { POST } = await import('@/app/api/chat/route')
    const response = await POST(makeRequest(validBody()))
    const text = await readStreamToString(response)

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

  it('loads module notes when activeModuleId is set and module resolves', async () => {
    mockGetModuleById.mockResolvedValue({
      success: true,
      data: {
        id: 'mod-cart',
        project_id: 'proj-1',
        domain: null,
        name: 'Shopping Cart',
        description: 'Test',
        position: { x: 0, y: 0 },
        color: '#111',
        entry_points: [],
        exit_points: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    })

    const { POST } = await import('@/app/api/chat/route')
    const base = validBody()
    const body = {
      ...base,
      mode: 'module_detail',
      context: {
        ...base.context,
        mode: 'module_detail' as const,
        activeModuleId: 'mod-cart',
      },
    }

    await POST(makeRequest(body))

    expect(mockLoadModuleNotesForChat).toHaveBeenCalledWith('Shopping Cart')
    expect(mockBuildSystemPrompt).toHaveBeenCalledWith(
      'module_detail',
      expect.objectContaining({
        moduleNotes: { source: 'none', markdown: null },
      }),
    )
  })

  // --- Tool wiring ---

  it('passes tools for the current mode to callLLMWithTools', async () => {
    const tools = [{ name: 'create_module', description: 'test', input_schema: {} }]
    mockGetToolsForMode.mockReturnValue(tools)

    const { POST } = await import('@/app/api/chat/route')
    await POST(makeRequest(validBody()))

    expect(mockGetToolsForMode).toHaveBeenCalledWith('discovery')
    expect(mockCallLLMWithTools).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      tools,
      mockExecutor,
    )
  })

  it('creates a tool executor with the project ID', async () => {
    const { POST } = await import('@/app/api/chat/route')
    await POST(makeRequest(validBody()))

    expect(mockCreateToolExecutor).toHaveBeenCalledWith('proj-1')
  })

  it('calls callLLMWithTools with system prompt and message history', async () => {
    mockBuildSystemPrompt.mockReturnValue('System prompt here')

    const { POST } = await import('@/app/api/chat/route')
    await POST(makeRequest(validBody()))

    expect(mockCallLLMWithTools).toHaveBeenCalledWith(
      'System prompt here',
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'Hello' }),
        expect.objectContaining({ role: 'user', content: 'Create an auth module' }),
      ]),
      expect.any(Array),
      expect.any(Function),
    )
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
    mockCallLLMWithTools.mockResolvedValue(makeStream(['AI ', 'reply']))

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
    mockCallLLMWithTools.mockRejectedValue(new Error('LLM request failed: service down'))

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
