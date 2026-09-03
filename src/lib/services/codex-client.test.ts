// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

// Mock server-only (it throws at import time in non-server contexts)
vi.mock('server-only', () => ({}))

const mockGetCodexAuth = vi.fn()
const mockForceRefreshCodexAuth = vi.fn()

vi.mock('@/lib/services/codex-auth', () => ({
  getCodexAuth: () => mockGetCodexAuth(),
  forceRefreshCodexAuth: () => mockForceRefreshCodexAuth(),
}))

// --- SSE fixtures ---

function sseResponse(events: Array<Record<string, unknown>>): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function messageItem(phase: string, text: string, id?: string): Record<string, unknown> {
  return {
    type: 'response.output_item.done',
    item: {
      ...(id ? { id } : {}),
      type: 'message',
      role: 'assistant',
      phase,
      content: [{ type: 'output_text', text }],
    },
  }
}

/** The skeleton the backend emits before any text for the item arrives. */
function messageAdded(id: string, phase: string): Record<string, unknown> {
  return {
    type: 'response.output_item.added',
    item: { id, type: 'message', role: 'assistant', phase, content: [] },
  }
}

function itemDelta(itemId: string, delta: string): Record<string, unknown> {
  return { type: 'response.output_text.delta', item_id: itemId, output_index: 0, delta }
}

/** A delta with no `item_id`, exercising the buffered fallback path. */
function textDelta(delta: string): Record<string, unknown> {
  return { type: 'response.output_text.delta', delta }
}

function functionCallItem(callId: string, name: string, args: string): Record<string, unknown> {
  return {
    type: 'response.output_item.done',
    item: { type: 'function_call', call_id: callId, name, arguments: args, status: 'completed' },
  }
}

const REASONING_ITEM = {
  type: 'response.output_item.done',
  item: { type: 'reasoning', encrypted_content: 'gAAAAA-opaque' },
}

const COMPLETED = { type: 'response.completed' }

// --- Helpers ---

async function readStreamChunks(stream: ReadableStream<string>): Promise<string[]> {
  const reader = stream.getReader()
  const chunks: string[] = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks
}

async function readStreamToString(stream: ReadableStream<string>): Promise<string> {
  return (await readStreamChunks(stream)).join('')
}

const CREATE_NODE_TOOL: Anthropic.Tool = {
  name: 'create_node',
  description: 'Create a node',
  input_schema: {
    type: 'object',
    properties: { moduleId: { type: 'string' }, label: { type: 'string' } },
    required: ['moduleId', 'label'],
  },
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, callIndex: number) {
  const [, init] = fetchMock.mock.calls[callIndex]
  return JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>
}

describe('codex-client', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env = { ...originalEnv }
    delete process.env.CODEX_MODEL
    delete process.env.CODEX_REASONING_EFFORT
    delete process.env.CODEX_CONTINUATION_EFFORT
    delete process.env.CODEX_SERVICE_TIER
    mockGetCodexAuth.mockResolvedValue({ accessToken: 'access-token', accountId: 'acct-123' })
    mockForceRefreshCodexAuth.mockResolvedValue({
      accessToken: 'refreshed-token',
      accountId: 'acct-123',
    })
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('streams the final answer from a round with no tool calls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          textDelta('Here is '),
          textDelta('the plan.'),
          REASONING_ITEM,
          messageItem('final_answer', 'Here is the plan.'),
          COMPLETED,
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const stream = await callCodexWithTools(
      'System prompt',
      [{ role: 'user', content: 'Plan the checkout flow' }],
      [CREATE_NODE_TOOL],
      vi.fn(),
    )

    await expect(readStreamToString(stream)).resolves.toBe('Here is the plan.')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/codex/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'chatgpt-account-id': 'acct-123',
          'OpenAI-Beta': 'responses=experimental',
          originator: 'codex_cli_rs',
          Accept: 'text/event-stream',
        }),
      }),
    )

    const body = requestBody(fetchMock, 0)
    expect(body).toEqual(
      expect.objectContaining({
        model: 'gpt-5.6-luna',
        instructions: expect.stringContaining('System prompt') as unknown,
        tool_choice: 'auto',
        parallel_tool_calls: true,
        reasoning: { effort: 'xhigh' },
        store: false,
        stream: true,
      }),
    )
    expect(body.input).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Plan the checkout flow' }],
      },
    ])
    expect(body.tools).toEqual([
      {
        type: 'function',
        name: 'create_node',
        description: 'Create a node',
        strict: false,
        parameters: CREATE_NODE_TOOL.input_schema,
      },
    ])
  })

  it('requires a named tool for structured artifact generation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([messageItem('final_answer', 'Work Plan ready.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create the Work Plan' }],
        [CREATE_NODE_TOOL],
        vi.fn(),
        { requiredToolName: 'create_node' },
      ),
    )

    expect(requestBody(fetchMock, 0).tool_choice).toEqual({
      type: 'function',
      name: 'create_node',
    })
  })

  it('streams final_answer deltas as they arrive without repeating them at round end', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          messageAdded('msg-1', 'final_answer'),
          itemDelta('msg-1', 'Here is '),
          itemDelta('msg-1', 'the plan.'),
          messageItem('final_answer', 'Here is the plan.', 'msg-1'),
          COMPLETED,
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const chunks = await readStreamChunks(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Plan it' }],
        [CREATE_NODE_TOOL],
        vi.fn(),
      ),
    )

    expect(chunks).toEqual(['Here is ', 'the plan.'])
  })

  it('streams final_answer deltas even when the same round calls a tool', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          messageAdded('msg-1', 'final_answer'),
          itemDelta('msg-1', 'Adding it now. '),
          messageItem('final_answer', 'Adding it now. ', 'msg-1'),
          functionCallItem('call-1', 'create_node', '{"moduleId":"mod-1"}'),
          COMPLETED,
        ]),
      )
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'Done.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const chunks = await readStreamChunks(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Add a node' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
      ),
    )

    expect(chunks[0]).toBe('Adding it now. ')
    expect(chunks.filter((chunk) => chunk === 'Adding it now. ')).toHaveLength(1)
    expect(chunks.join('')).toContain('Done.')
  })

  it('never streams commentary deltas', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          messageAdded('msg-c', 'commentary'),
          itemDelta('msg-c', 'Let me wire '),
          itemDelta('msg-c', 'this up.'),
          messageItem('commentary', 'Let me wire this up.', 'msg-c'),
          functionCallItem('call-1', 'create_node', '{"moduleId":"mod-1"}'),
          COMPLETED,
        ]),
      )
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'All done.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const text = await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a node' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
      ),
    )

    expect(text).not.toContain('Let me wire')
    expect(text).not.toContain('this up.')
    expect(text).toContain('All done.')
    // Commentary is still echoed back so the model keeps its own narration.
    expect(requestBody(fetchMock, 1).input).toContainEqual({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Let me wire this up.' }],
    })
  })

  it('appends the tool-batching guidance to the system prompt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([messageItem('final_answer', 'ok'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools('System prompt', [{ role: 'user', content: 'Hi' }], [], vi.fn()),
    )

    const body = requestBody(fetchMock, 0)
    expect(body.parallel_tool_calls).toBe(true)
    expect(String(body.instructions)).toMatch(/^System prompt\n\n/)
    expect(body.instructions).toContain('Batch tool calls together in one response ONLY')
    expect(body.instructions).toContain('Never guess or invent IDs.')
  })

  it('allows the model and reasoning effort to be overridden by env', async () => {
    process.env.CODEX_MODEL = 'gpt-5.6-other'
    process.env.CODEX_REASONING_EFFORT = 'low'
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([messageItem('final_answer', 'ok'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools('System', [{ role: 'user', content: 'Hi' }], [], vi.fn()),
    )

    const body = requestBody(fetchMock, 0)
    expect(body.model).toBe('gpt-5.6-other')
    expect(body.reasoning).toEqual({ effort: 'low' })
  })

  it('falls back to xhigh when the configured reasoning effort is invalid', async () => {
    process.env.CODEX_REASONING_EFFORT = 'turbo'
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([messageItem('final_answer', 'ok'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools('System', [{ role: 'user', content: 'Hi' }], [], vi.fn()),
    )

    expect(requestBody(fetchMock, 0).reasoning).toEqual({ effort: 'xhigh' })
  })

  function toolThenAnswer(): ReturnType<typeof vi.fn> {
    return vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([functionCallItem('call-1', 'create_node', '{"moduleId":"m"}'), COMPLETED]),
      )
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'Done.'), COMPLETED]))
  }

  async function runToolTurn(): Promise<void> {
    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a node' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
      ),
    )
  }

  it('keeps the base effort on round 0 and drops to medium on continuation rounds', async () => {
    const fetchMock = toolThenAnswer()
    vi.stubGlobal('fetch', fetchMock)

    await runToolTurn()

    expect(requestBody(fetchMock, 0).reasoning).toEqual({ effort: 'xhigh' })
    expect(requestBody(fetchMock, 1).reasoning).toEqual({ effort: 'medium' })
  })

  it('allows CODEX_CONTINUATION_EFFORT to override the continuation effort', async () => {
    process.env.CODEX_CONTINUATION_EFFORT = 'high'
    const fetchMock = toolThenAnswer()
    vi.stubGlobal('fetch', fetchMock)

    await runToolTurn()

    expect(requestBody(fetchMock, 0).reasoning).toEqual({ effort: 'xhigh' })
    expect(requestBody(fetchMock, 1).reasoning).toEqual({ effort: 'high' })
  })

  it('allows a live planning turn to lower both efforts per request', async () => {
    const fetchMock = toolThenAnswer()
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Capture this quickly' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
        { reasoningEffort: 'low', continuationReasoningEffort: 'low' },
      ),
    )

    expect(requestBody(fetchMock, 0).reasoning).toEqual({ effort: 'low' })
    expect(requestBody(fetchMock, 1).reasoning).toEqual({ effort: 'low' })
  })

  it('falls back to medium when the configured continuation effort is invalid', async () => {
    process.env.CODEX_CONTINUATION_EFFORT = 'turbo'
    const fetchMock = toolThenAnswer()
    vi.stubGlobal('fetch', fetchMock)

    await runToolTurn()

    expect(requestBody(fetchMock, 1).reasoning).toEqual({ effort: 'medium' })
  })

  it('restores the base effort for the forced text round', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([functionCallItem('call-1', 'create_node', '{"moduleId":"m"}'), COMPLETED]),
      )
      .mockResolvedValueOnce(sseResponse([COMPLETED]))
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'Node added.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    await runToolTurn()

    expect(requestBody(fetchMock, 1).reasoning).toEqual({ effort: 'medium' })
    const forcedRound = requestBody(fetchMock, 2)
    expect(forcedRound.tool_choice).toBe('none')
    expect(forcedRound.reasoning).toEqual({ effort: 'xhigh' })
  })

  it('requests the priority service tier by default', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([messageItem('final_answer', 'ok'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools('System', [{ role: 'user', content: 'Hi' }], [], vi.fn()),
    )

    expect(requestBody(fetchMock, 0).service_tier).toBe('priority')
  })

  it('allows CODEX_SERVICE_TIER to override the default service tier', async () => {
    process.env.CODEX_SERVICE_TIER = 'standard'
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([messageItem('final_answer', 'ok'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools('System', [{ role: 'user', content: 'Hi' }], [], vi.fn()),
    )

    expect(requestBody(fetchMock, 0).service_tier).toBe('standard')
  })

  it('executes tool calls and continues the turn with the tool output', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          functionCallItem('call-1', 'create_node', '{"moduleId":"mod-1","label":"Collect order"}'),
          COMPLETED,
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([messageItem('final_answer', 'Created the order intake node.'), COMPLETED]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const executeTool = vi.fn().mockResolvedValue({
      content: 'Created node "Collect order"',
      isError: false,
      data: { node: { id: 'node-1', label: 'Collect order' } },
    })
    const onToolResult = vi.fn()

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const { TOOL_EVENT_DELIMITER } = await import('@/lib/services/llm-shared')

    const text = await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create an order intake node' }],
        [CREATE_NODE_TOOL],
        executeTool,
        { onToolResult },
      ),
    )

    expect(executeTool).toHaveBeenCalledWith('create_node', {
      moduleId: 'mod-1',
      label: 'Collect order',
    })
    expect(text).toContain(
      `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool: 'create_node', status: 'start' })}`,
    )
    expect(text).toContain(
      `${TOOL_EVENT_DELIMITER}${JSON.stringify({
        tool: 'create_node',
        data: { node: { id: 'node-1', label: 'Collect order' } },
      })}`,
    )
    expect(text).toContain('Created the order intake node.')
    expect(onToolResult).toHaveBeenCalledTimes(1)

    const secondInput = requestBody(fetchMock, 1).input
    expect(secondInput).toContainEqual({
      type: 'function_call',
      call_id: 'call-1',
      name: 'create_node',
      arguments: '{"moduleId":"mod-1","label":"Collect order"}',
    })
    expect(secondInput).toContainEqual({
      type: 'function_call_output',
      call_id: 'call-1',
      output: 'Created node "Collect order"',
    })
  })

  it('ends after committed tool data when a successful tool supplies terminal text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          functionCallItem('call-1', 'capture_architecture_map', '{"objective":"Salon"}'),
          COMPLETED,
        ]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const terminalText = 'Built a provisional Architecture with 6 capabilities.'
    const executeTool = vi.fn().mockResolvedValue({
      content: 'Committed Architecture',
      isError: false,
      data: { metadata: { change_summary: { capabilitiesCreated: 6 } } },
      terminalText,
    })

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const { TOOL_EVENT_DELIMITER } = await import('@/lib/services/llm-shared')
    const chunks = await readStreamChunks(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Plan the salon' }],
        [CREATE_NODE_TOOL],
        executeTool,
      ),
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(chunks).toEqual([
      `${TOOL_EVENT_DELIMITER}${JSON.stringify({
        tool: 'capture_architecture_map',
        status: 'start',
      })}\n`,
      `${TOOL_EVENT_DELIMITER}${JSON.stringify({
        tool: 'capture_architecture_map',
        data: { metadata: { change_summary: { capabilitiesCreated: 6 } } },
      })}\n`,
      terminalText,
    ])
  })

  it('does not honor terminal text from a failed tool result', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          functionCallItem('call-1', 'capture_architecture_map', '{"objective":"Salon"}'),
          COMPLETED,
        ]),
      )
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'Please retry.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const text = await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Plan the salon' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({
          content: 'Capture failed',
          isError: true,
          terminalText: 'This must not be shown.',
        }),
      ),
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(text).toContain('Please retry.')
    expect(text).not.toContain('This must not be shown.')
  })

  it('runs two batched function calls sequentially and echoes both call/output pairs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          functionCallItem('call-1', 'create_node', '{"moduleId":"mod-1","label":"Collect order"}'),
          functionCallItem('call-2', 'create_node', '{"moduleId":"mod-1","label":"Take payment"}'),
          COMPLETED,
        ]),
      )
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'Both added.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const order: string[] = []
    const executeTool = vi.fn(async (_name: string, input: Record<string, unknown>) => {
      order.push(String(input.label))
      return { content: `Created "${String(input.label)}"`, isError: false }
    })

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Add both nodes' }],
        [CREATE_NODE_TOOL],
        executeTool,
      ),
    )

    expect(executeTool).toHaveBeenCalledTimes(2)
    expect(order).toEqual(['Collect order', 'Take payment'])

    const secondInput = requestBody(fetchMock, 1).input as Array<Record<string, unknown>>
    const echoed = secondInput
      .filter((item) => item.type === 'function_call' || item.type === 'function_call_output')
      .map((item) => [item.type, item.call_id, item.name ?? item.output])

    expect(echoed).toEqual([
      ['function_call', 'call-1', 'create_node'],
      ['function_call_output', 'call-1', 'Created "Collect order"'],
      ['function_call', 'call-2', 'create_node'],
      ['function_call_output', 'call-2', 'Created "Take payment"'],
    ])
  })

  it('echoes a reasoning item verbatim with an empty summary before the function_call echo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          REASONING_ITEM,
          functionCallItem('call-1', 'create_node', '{"moduleId":"mod-1","label":"Collect order"}'),
          COMPLETED,
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([messageItem('final_answer', 'Created the order intake node.'), COMPLETED]),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create an order intake node' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
      ),
    )

    const secondInput = requestBody(fetchMock, 1).input as Array<Record<string, unknown>>
    const reasoningIndex = secondInput.findIndex((item) => item.type === 'reasoning')
    const functionCallIndex = secondInput.findIndex((item) => item.type === 'function_call')

    expect(reasoningIndex).toBeGreaterThanOrEqual(0)
    expect(reasoningIndex).toBeLessThan(functionCallIndex)
    expect(secondInput[reasoningIndex]).toEqual({
      type: 'reasoning',
      encrypted_content: 'gAAAAA-opaque',
      summary: [],
    })
  })

  it('uses the provided sessionKey as session_id on every round', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([functionCallItem('call-1', 'create_node', '{"moduleId":"mod-1"}'), COMPLETED]),
      )
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'Node added.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a node' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
        { sessionKey: 'project-uuid-123' },
      ),
    )

    const [, firstInit] = fetchMock.mock.calls[0]
    const [, secondInit] = fetchMock.mock.calls[1]
    expect((firstInit as RequestInit).headers).toEqual(
      expect.objectContaining({ session_id: 'project-uuid-123' }),
    )
    expect((secondInit as RequestInit).headers).toEqual(
      expect.objectContaining({ session_id: 'project-uuid-123' }),
    )
  })

  it('falls back to a UUID session_id shared across every round when sessionKey is absent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([functionCallItem('call-1', 'create_node', '{"moduleId":"mod-1"}'), COMPLETED]),
      )
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'Node added.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a node' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
      ),
    )

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const [, firstInit] = fetchMock.mock.calls[0]
    const [, secondInit] = fetchMock.mock.calls[1]
    const firstSessionId = ((firstInit as RequestInit).headers as Record<string, string>).session_id
    const secondSessionId = ((secondInit as RequestInit).headers as Record<string, string>)
      .session_id

    expect(firstSessionId).toMatch(UUID_RE)
    expect(firstSessionId).toBe(secondSessionId)
  })

  it('prefixes failed tool output with Error: for the model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([functionCallItem('call-1', 'create_node', '{"moduleId":"mod-1"}'), COMPLETED]),
      )
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'That failed.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a node' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({ content: 'Module not found', isError: true }),
      ),
    )

    expect(requestBody(fetchMock, 1).input).toContainEqual({
      type: 'function_call_output',
      call_id: 'call-1',
      output: 'Error: Module not found',
    })
  })

  it('rejects malformed tool arguments without executing the tool', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([functionCallItem('call-1', 'create_node', '{"moduleId":"mod-1"'), COMPLETED]),
      )
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'Retrying.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const executeTool = vi.fn()
    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a node' }],
        [CREATE_NODE_TOOL],
        executeTool,
      ),
    )

    expect(executeTool).not.toHaveBeenCalled()
    expect(requestBody(fetchMock, 1).input).toContainEqual({
      type: 'function_call_output',
      call_id: 'call-1',
      output: 'Error: Invalid tool arguments',
    })
  })

  it('never streams commentary text but keeps it in model context', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          messageItem('commentary', 'Let me wire this up.'),
          functionCallItem('call-1', 'create_node', '{"moduleId":"mod-1","label":"Collect order"}'),
          COMPLETED,
        ]),
      )
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'All done.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const text = await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create an order intake node' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
      ),
    )

    expect(text).not.toContain('Let me wire this up.')
    expect(text).toContain('All done.')

    expect(requestBody(fetchMock, 1).input).toContainEqual({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Let me wire this up.' }],
    })
  })

  it('forces a final text round when a tool turn ends silently', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sseResponse([functionCallItem('call-1', 'create_node', '{"moduleId":"m"}'), COMPLETED]),
      )
      .mockResolvedValueOnce(sseResponse([COMPLETED]))
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'Node added.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const { FORCED_TEXT_NUDGE } = await import('@/lib/services/llm-shared')

    const text = await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a node' }],
        [CREATE_NODE_TOOL],
        vi.fn().mockResolvedValue({ content: 'ok', isError: false }),
      ),
    )

    expect(text).toContain('Node added.')
    const finalBody = requestBody(fetchMock, 2)
    expect(finalBody.tool_choice).toBe('none')
    expect(finalBody.input).toContainEqual({
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: FORCED_TEXT_NUDGE }],
    })
  })

  it('errors the stream with a sanitized message when the response fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            type: 'response.failed',
            response: { error: { message: 'upstream overloaded' } },
          },
        ]),
      ),
    )

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const stream = await callCodexWithTools(
      'System prompt',
      [{ role: 'user', content: 'Hi' }],
      [],
      vi.fn(),
    )

    await expect(readStreamToString(stream)).rejects.toThrow(
      'LLM request failed: Codex response failed: upstream overloaded',
    )
  })

  it('surfaces a non-2xx status with the response body snippet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('rate limited by upstream', { status: 429 })),
    )

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const stream = await callCodexWithTools(
      'System prompt',
      [{ role: 'user', content: 'Hi' }],
      [],
      vi.fn(),
    )

    await expect(readStreamToString(stream)).rejects.toThrow(
      'Codex API error 429: rate limited by upstream',
    )
  })

  it('refreshes the token once and retries the round on a 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(sseResponse([messageItem('final_answer', 'Recovered.'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const stream = await callCodexWithTools(
      'System prompt',
      [{ role: 'user', content: 'Hi' }],
      [],
      vi.fn(),
    )

    await expect(readStreamToString(stream)).resolves.toBe('Recovered.')
    expect(mockForceRefreshCodexAuth).toHaveBeenCalledTimes(1)

    const [, retryInit] = fetchMock.mock.calls[1]
    expect((retryInit as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer refreshed-token' }),
    )
  })

  it('reports an expired login when the retried round still 401s', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })))

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    const stream = await callCodexWithTools(
      'System prompt',
      [{ role: 'user', content: 'Hi' }],
      [],
      vi.fn(),
    )

    await expect(readStreamToString(stream)).rejects.toThrow(
      'Codex login expired. Run: codex login',
    )
  })

  // --- Stop propagation ---

  describe('stop signal', () => {
    it('makes no request at all when the turn is already stopped', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const abort = new AbortController()
      abort.abort()

      const { callCodexWithTools } = await import('@/lib/services/codex-client')
      const stream = await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a node' }],
        [CREATE_NODE_TOOL],
        vi.fn(),
        { signal: abort.signal },
      )

      await expect(readStreamToString(stream)).resolves.toBe('')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('passes the stop signal to every round request', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(sseResponse([messageItem('final_answer', 'ok'), COMPLETED]))
      vi.stubGlobal('fetch', fetchMock)
      const abort = new AbortController()

      const { callCodexWithTools } = await import('@/lib/services/codex-client')
      await readStreamToString(
        await callCodexWithTools('System', [{ role: 'user', content: 'Hi' }], [], vi.fn(), {
          signal: abort.signal,
        }),
      )

      const [, init] = fetchMock.mock.calls[0]
      expect((init as RequestInit).signal).toBe(abort.signal)
    })

    it('starts no second round once the turn is stopped', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          sseResponse([functionCallItem('call-1', 'create_node', '{"moduleId":"m"}'), COMPLETED]),
        )
        // Fresh Response per call: a regression that keeps looping must fail
        // an assertion, not choke on an already-consumed body.
        .mockImplementation(() =>
          Promise.resolve(
            sseResponse([messageItem('final_answer', 'Should never run.'), COMPLETED]),
          ),
        )
      vi.stubGlobal('fetch', fetchMock)

      const abort = new AbortController()
      // The user hits Stop while the first tool is running.
      const executeTool = vi.fn(async () => {
        abort.abort()
        return { content: 'ok', isError: false }
      })

      const { callCodexWithTools } = await import('@/lib/services/codex-client')
      const text = await readStreamToString(
        await callCodexWithTools(
          'System prompt',
          [{ role: 'user', content: 'Create a node' }],
          [CREATE_NODE_TOOL],
          executeTool,
          { signal: abort.signal },
        ),
      )

      // One LLM call, one tool, and no forced-text nudge round.
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(executeTool).toHaveBeenCalledTimes(1)
      expect(text).not.toContain('Should never run.')
    })

    it('runs no further tools once the turn is stopped mid-round', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          sseResponse([
            functionCallItem('call-1', 'create_node', '{"moduleId":"m","label":"First"}'),
            functionCallItem('call-2', 'create_node', '{"moduleId":"m","label":"Second"}'),
            COMPLETED,
          ]),
        )
        .mockImplementation(() =>
          Promise.resolve(
            sseResponse([messageItem('final_answer', 'Should never run.'), COMPLETED]),
          ),
        )
      vi.stubGlobal('fetch', fetchMock)

      const abort = new AbortController()
      const executeTool = vi.fn(async () => {
        abort.abort()
        return { content: 'ok', isError: false }
      })

      const { callCodexWithTools } = await import('@/lib/services/codex-client')
      await readStreamToString(
        await callCodexWithTools(
          'System prompt',
          [{ role: 'user', content: 'Add both nodes' }],
          [CREATE_NODE_TOOL],
          executeTool,
          { signal: abort.signal },
        ),
      )

      expect(executeTool).toHaveBeenCalledTimes(1)
      expect(executeTool).toHaveBeenCalledWith('create_node', { moduleId: 'm', label: 'First' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('closes cleanly instead of erroring when a round is aborted in flight', async () => {
      const abort = new AbortController()
      const fetchMock = vi.fn(() => {
        abort.abort()
        return Promise.reject(new DOMException('This operation was aborted', 'AbortError'))
      })
      vi.stubGlobal('fetch', fetchMock)

      const { callCodexWithTools } = await import('@/lib/services/codex-client')
      const stream = await callCodexWithTools(
        'System prompt',
        [{ role: 'user', content: 'Create a node' }],
        [CREATE_NODE_TOOL],
        vi.fn(),
        { signal: abort.signal },
      )

      await expect(readStreamToString(stream)).resolves.toBe('')
    })
  })

  it('converts assistant history into output_text items', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse([messageItem('final_answer', 'ok'), COMPLETED]))
    vi.stubGlobal('fetch', fetchMock)

    const { callCodexWithTools } = await import('@/lib/services/codex-client')
    await readStreamToString(
      await callCodexWithTools(
        'System prompt',
        [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
          { role: 'user', content: [{ type: 'text', text: 'Block form' }] },
        ],
        [],
        vi.fn(),
      ),
    )

    expect(requestBody(fetchMock, 0).input).toEqual([
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hi there' }] },
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Block form' }] },
    ])
  })
})
