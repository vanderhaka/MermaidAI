// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScopeWorkspace } from '@/components/dashboard/scope-workspace'
import { useScopeArchitectureHandoff } from '@/hooks/useScopeArchitectureHandoff'
import { TOOL_EVENT_DELIMITER } from '@/lib/services/llm-shared'
import { useGraphStore } from '@/store/graph-store'
import type { ChatMessage } from '@/types/chat'
import type { FlowEdge, Module, OpenQuestion, ProjectMode } from '@/types/graph'

const mockRefresh = vi.fn()
const mockHandoffRun = vi.fn()
const mockHandoffRetry = vi.fn()
const mockDismissHandoffError = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('@/hooks/useScopeArchitectureHandoff', () => ({
  useScopeArchitectureHandoff: vi.fn(),
}))

vi.mock('@/components/canvas/CanvasContainer', () => ({
  default: ({ showFunnelLanes }: { showFunnelLanes?: boolean }) => (
    <div data-testid="canvas-container" data-show-funnel-lanes={String(Boolean(showFunnelLanes))} />
  ),
}))

vi.mock('@/components/canvas/OpenQuestionsPanel', () => ({
  default: ({
    questions,
    onResolve,
  }: {
    questions: OpenQuestion[]
    onResolve?: (question: OpenQuestion) => void
  }) => (
    <div data-testid="open-questions-panel">
      {questions.map((question) => (
        <button key={question.id} type="button" onClick={() => onResolve?.(question)}>
          Resolve {question.question}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/dashboard/InlineProjectName', () => ({
  InlineProjectName: ({ initialName }: { initialName: string }) => <span>{initialName}</span>,
}))

vi.mock('@/components/dashboard/PrdPreviewPanel', () => ({
  default: () => <div data-testid="prd-preview-panel" />,
}))

vi.mock('@/components/dashboard/SavedIndicator', () => ({
  SavedIndicator: () => <span data-testid="saved-indicator" />,
}))

vi.mock('@/components/chat/FloatingChat', () => ({
  default: ({
    messages,
    streamingContent,
    error,
    onSend,
    onStop,
    onRetry,
    subtitle,
    examplePrompts,
    helperMode,
    onToggleHelperMode,
  }: {
    messages: ChatMessage[]
    streamingContent: string
    error: string | null
    onSend: (message: string) => Promise<boolean>
    onStop?: () => void
    onRetry?: () => void
    subtitle: string
    examplePrompts: string[]
    helperMode?: boolean
    onToggleHelperMode?: () => void
  }) => (
    <div
      data-testid="floating-chat"
      data-subtitle={subtitle}
      data-example-prompts={JSON.stringify(examplePrompts)}
      data-helper-mode={String(helperMode)}
    >
      <ul data-testid="chat-messages">
        {messages.map((entry) => (
          <li
            key={entry.id}
            data-role={entry.role}
            data-tool-calls={JSON.stringify(entry.toolCalls ?? [])}
          >
            {entry.content}
          </li>
        ))}
      </ul>
      <p data-testid="streaming-content">{streamingContent}</p>
      {error && <p data-testid="chat-error">{error}</p>}
      {onStop && (
        <button type="button" onClick={onStop}>
          Stop response
        </button>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      )}
      {onToggleHelperMode && (
        <button type="button" onClick={onToggleHelperMode}>
          Toggle auto-decide
        </button>
      )}
      <button type="button" onClick={() => void onSend('Map the lead journey')}>
        Send test message
      </button>
      <button
        type="button"
        onClick={() => void onSend('Accept suggestion: Let users edit cart items before payment.')}
      >
        Accept suggestion
      </button>
      <button
        type="button"
        onClick={() => void onSend('Actually, lock cart edits once payment starts.')}
      >
        Override answer
      </button>
    </div>
  ),
}))

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod-1',
    project_id: 'proj-1',
    domain: null,
    name: 'Scope',
    description: null,
    prd_content: '',
    position: { x: 0, y: 0 },
    color: '#F59E0B',
    entry_points: [],
    exit_points: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeOpenQuestion(overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    id: 'oq-1',
    project_id: 'proj-1',
    node_id: 'node-question-1',
    section: 'Cart',
    question: 'Can users edit cart items?',
    status: 'open',
    resolution: null,
    created_at: '2026-01-01T00:00:00Z',
    resolved_at: null,
    ...overrides,
  }
}

function workspaceElement(
  mode: ProjectMode,
  module: Module,
  initialOpenQuestions: OpenQuestion[] = [],
  initialMessages: ChatMessage[] = [],
) {
  return (
    <ScopeWorkspace
      project={{
        id: 'proj-1',
        name: mode === 'flowchart' ? 'Lead Journey' : 'Client Call',
        description: null,
        mode,
      }}
      initialModules={[module]}
      initialNodes={[]}
      initialEdges={[]}
      initialConnections={[]}
      initialMessages={initialMessages}
      initialOpenQuestions={initialOpenQuestions}
    />
  )
}

function renderWorkspace(
  mode: ProjectMode,
  module: Module,
  initialOpenQuestions: OpenQuestion[] = [],
) {
  return render(workspaceElement(mode, module, initialOpenQuestions))
}

function makeServerMessage(content: string): ChatMessage {
  return {
    id: `server-${content}`,
    role: 'assistant',
    content,
    operations: [],
    createdAt: '2026-01-01T00:00:00Z',
  }
}

function successfulStreamResponse() {
  return new Response('Assistant response', { status: 200 })
}

function toolEventChunk(tool: string, data: Record<string, unknown>): string {
  return `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool, data })}\n`
}

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  let index = 0

  return new Response(
    new ReadableStream({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(chunks[index++]))
      },
    }),
    { status: 200 },
  )
}

function lastChatMessage(): HTMLElement {
  const items = within(screen.getByTestId('chat-messages')).getAllByRole('listitem')
  return items[items.length - 1]
}

function makeEdge(overrides: Partial<FlowEdge> = {}): FlowEdge {
  return {
    id: 'edge-1',
    module_id: 'mod-scope',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    label: null,
    condition: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** Streams one chunk, then hangs until the request is aborted. */
function hangingStreamResponse(text: string, signal: AbortSignal | undefined) {
  const encoder = new TextEncoder()
  let sentFirstChunk = false

  return new Response(
    new ReadableStream({
      pull(controller) {
        if (!sentFirstChunk) {
          sentFirstChunk = true
          controller.enqueue(encoder.encode(text))
          return
        }

        return new Promise<never>((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        })
      },
    }),
    { status: 200 },
  )
}

/** Streams one chunk of prose, then breaks. */
function streamErrorAfterTextResponse(text: string) {
  const encoder = new TextEncoder()
  let sentFirstChunk = false

  return new Response(
    new ReadableStream({
      pull(controller) {
        if (!sentFirstChunk) {
          sentFirstChunk = true
          controller.enqueue(encoder.encode(text))
          return
        }

        controller.error(new Error('Stream collapsed'))
      },
    }),
    { status: 200 },
  )
}

function streamErrorAfterToolEventResponse(edge: FlowEdge) {
  const encoder = new TextEncoder()
  let didSendToolEvent = false

  return new Response(
    new ReadableStream({
      pull(controller) {
        if (!didSendToolEvent) {
          didSendToolEvent = true
          controller.enqueue(
            encoder.encode(
              `${TOOL_EVENT_DELIMITER}${JSON.stringify({
                tool: 'create_edge',
                data: { edge },
              })}\n`,
            ),
          )
          return
        }

        controller.error(new Error('stream failed after tool event'))
      },
    }),
    { status: 200 },
  )
}

describe('ScopeWorkspace chat mode routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockRefresh.mockClear()
    useGraphStore.getState().reset()
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.mocked(useScopeArchitectureHandoff).mockReturnValue({
      status: 'idle',
      error: null,
      isRunning: false,
      isChecking: false,
      run: mockHandoffRun,
      retry: mockHandoffRetry,
      dismissError: mockDismissHandoffError,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulStreamResponse()))
  })

  it('starts the durable Architecture handoff only after confirmation', async () => {
    const user = userEvent.setup()
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await user.click(screen.getByRole('button', { name: /build architecture/i }))
    expect(mockHandoffRun).not.toHaveBeenCalled()
    expect(
      screen.getByText(/nothing switches until the architecture is safely saved/i),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: /build architecture/i }))

    await waitFor(() => {
      expect(mockHandoffRun).toHaveBeenCalledTimes(1)
    })
    expect(window.sessionStorage.getItem('mermaid:scope-handoff:proj-1')).toBeNull()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('makes a failed handoff visibly safe and retryable', async () => {
    vi.mocked(useScopeArchitectureHandoff).mockReturnValue({
      status: 'failed',
      error: 'Architecture generation failed.',
      isRunning: false,
      isChecking: false,
      run: mockHandoffRun,
      retry: mockHandoffRetry,
      dismissError: mockDismissHandoffError,
    })
    const user = userEvent.setup()
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Architecture generation failed. Your Quick Capture is still intact.',
    )
    await user.click(screen.getByRole('button', { name: /retry safely/i }))
    expect(mockHandoffRetry).toHaveBeenCalledTimes(1)
  })

  it('sends flowchart chat with flowchart_build mode and the single canvas module id', async () => {
    const user = userEvent.setup()
    renderWorkspace(
      'flowchart',
      makeModule({
        id: 'mod-flowchart',
        name: 'Marketing Flowchart',
        color: '#14B8A6',
      }),
    )

    await waitFor(() => {
      expect(useGraphStore.getState().modules[0]?.id).toBe('mod-flowchart')
    })
    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({ method: 'POST' }))
    })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))

    expect(body).toEqual(
      expect.objectContaining({
        projectId: 'proj-1',
        message: 'Map the lead journey',
        mode: 'flowchart_build',
        context: expect.objectContaining({
          activeModuleId: 'mod-flowchart',
          mode: 'flowchart_build',
          modules: [{ id: 'mod-flowchart', name: 'Marketing Flowchart' }],
        }),
      }),
    )
    expect(screen.getByTestId('canvas-container')).toHaveAttribute('data-show-funnel-lanes', 'true')
  })

  it('keeps quick capture chat on scope_build mode', async () => {
    const user = userEvent.setup()
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await waitFor(() => {
      expect(useGraphStore.getState().modules[0]?.id).toBe('mod-scope')
    })
    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))

    expect(body.mode).toBe('scope_build')
    expect(body.provider).toBeUndefined()
    expect(body.context).toEqual(
      expect.objectContaining({
        activeModuleId: 'mod-scope',
        mode: 'scope_build',
      }),
    )
    expect(screen.getByTestId('canvas-container')).toHaveAttribute(
      'data-show-funnel-lanes',
      'false',
    )
  })

  it('clears the previous turn change highlight when a new send begins', async () => {
    const user = userEvent.setup()
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await waitFor(() => {
      expect(useGraphStore.getState().modules[0]?.id).toBe('mod-scope')
    })

    act(() => {
      useGraphStore.getState().markTurnChanged(['node-from-last-turn'])
    })
    expect(useGraphStore.getState().lastTurnChangedIds.size).toBe(1)

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })
    expect(useGraphStore.getState().lastTurnChangedIds.size).toBe(0)
  })

  it('refreshes persisted graph state after a stream error follows graph tool events', async () => {
    const user = userEvent.setup()
    const edge = makeEdge()
    vi.mocked(fetch).mockResolvedValueOnce(streamErrorAfterToolEventResponse(edge))
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await waitFor(() => {
      expect(useGraphStore.getState().modules[0]?.id).toBe('mod-scope')
    })
    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(useGraphStore.getState().edges).toEqual([edge])
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('keeps the partial answer and shows no error when the user stops a response', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(hangingStreamResponse('Half an answer', init?.signal ?? undefined)),
    )
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await user.click(screen.getByRole('button', { name: /send test message/i }))
    await waitFor(() => {
      expect(screen.getByTestId('streaming-content')).toHaveTextContent('Half an answer')
    })

    await user.click(screen.getByRole('button', { name: /stop response/i }))

    await waitFor(() => {
      expect(screen.getByTestId('chat-messages')).toHaveTextContent(
        /Half an answer\s*⚠ Response interrupted/,
      )
    })
    expect(screen.queryByTestId('chat-error')).not.toBeInTheDocument()
    // The user's own message survives the stop.
    expect(screen.getByTestId('chat-messages')).toHaveTextContent('Map the lead journey')
  })

  it('keeps the turn tool calls on the assistant message it committed', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValueOnce(
      streamResponse([
        toolEventChunk('create_edge', { edge: makeEdge() }),
        toolEventChunk('lookup_docs', { lookup: { library: 'stripe', topic: 'webhooks' } }),
        'Mapped the journey.',
      ]),
    )
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(screen.getByTestId('chat-messages')).toHaveTextContent('Mapped the journey.')
    })
    expect(lastChatMessage()).toHaveAttribute(
      'data-tool-calls',
      JSON.stringify(['Created edge', 'Looked up stripe docs']),
    )
  })

  it('keeps the turn tool calls on the interrupted assistant message', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(
        hangingStreamResponse(
          `${toolEventChunk('create_edge', { edge: makeEdge() })}Half an answer`,
          init?.signal ?? undefined,
        ),
      ),
    )
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await user.click(screen.getByRole('button', { name: /send test message/i }))
    await waitFor(() => {
      expect(screen.getByTestId('streaming-content')).toHaveTextContent('Half an answer')
    })

    await user.click(screen.getByRole('button', { name: /stop response/i }))

    await waitFor(() => {
      expect(screen.getByTestId('chat-messages')).toHaveTextContent(/⚠ Response interrupted/)
    })
    expect(lastChatMessage()).toHaveAttribute('data-tool-calls', JSON.stringify(['Created edge']))
  })

  it('does not let a refresh landing mid-turn wipe the in-flight conversation', async () => {
    const user = userEvent.setup()
    const scopeModule = makeModule({ id: 'mod-scope', name: 'Scope' })
    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(hangingStreamResponse('Working on it', init?.signal ?? undefined)),
    )
    const { rerender } = render(workspaceElement('scope', scopeModule))

    await user.click(screen.getByRole('button', { name: /send test message/i }))
    await waitFor(() => {
      expect(screen.getByTestId('streaming-content')).toHaveTextContent('Working on it')
    })

    // router.refresh() re-renders with server-side messages that predate this turn.
    rerender(
      workspaceElement('scope', scopeModule, [], [makeServerMessage('Stale server history')]),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(screen.getByTestId('chat-messages')).toHaveTextContent('Map the lead journey')
    expect(screen.getByTestId('chat-messages')).not.toHaveTextContent('Stale server history')

    // Once the turn ends, server state is allowed to win again.
    await user.click(screen.getByRole('button', { name: /stop response/i }))
    rerender(
      workspaceElement('scope', scopeModule, [], [makeServerMessage('Stale server history')]),
    )

    await waitFor(() => {
      expect(screen.getByTestId('chat-messages')).toHaveTextContent('Stale server history')
    })
  })

  it('surfaces the failure inside the chat and keeps the partial answer when a stream breaks', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValueOnce(streamErrorAfterTextResponse('Partial thought'))
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(screen.getByTestId('chat-error')).toHaveTextContent('Stream collapsed')
    })
    expect(screen.getByTestId('chat-messages')).toHaveTextContent(
      /Partial thought\s*⚠ Response interrupted/,
    )
  })

  it('re-sends the same message on retry without duplicating the user bubble', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValueOnce(streamErrorAfterTextResponse('Partial thought'))
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await user.click(screen.getByRole('button', { name: /send test message/i }))
    await waitFor(() => {
      expect(screen.getByTestId('chat-error')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /^retry$/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    const [, retryInit] = vi.mocked(fetch).mock.calls[1]
    expect(JSON.parse(String(retryInit?.body)).message).toBe('Map the lead journey')
    await waitFor(() => {
      expect(screen.queryByTestId('chat-error')).not.toBeInTheDocument()
    })
    expect(screen.getAllByText('Map the lead journey')).toHaveLength(1)
  })

  it('sends selected open question identity in chat context when resolving from the drawer', async () => {
    const user = userEvent.setup()
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }), [
      makeOpenQuestion({
        id: 'oq-cart-editing',
        section: 'Cart Management',
        question: 'Can users edit cart items?',
      }),
    ])

    await waitFor(() => {
      expect(useGraphStore.getState().openQuestions[0]?.id).toBe('oq-cart-editing')
    })
    await user.click(screen.getByRole('button', { name: /resolve can users edit cart items/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))

    expect(body.message).toBe(
      'Resolve this open question from Cart Management: "Can users edit cart items?"',
    )
    expect(body.context.resolvingOpenQuestion).toEqual({
      id: 'oq-cart-editing',
      section: 'Cart Management',
      question: 'Can users edit cart items?',
    })
  })

  it('keeps selected open question identity for the next accepted chat suggestion', async () => {
    const user = userEvent.setup()
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }), [
      makeOpenQuestion({
        id: 'oq-cart-editing',
        section: 'Cart Management',
        question: 'Can users edit cart items?',
      }),
    ])

    await waitFor(() => {
      expect(useGraphStore.getState().openQuestions[0]?.id).toBe('oq-cart-editing')
    })
    await user.click(screen.getByRole('button', { name: /resolve can users edit cart items/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    await user.click(screen.getByRole('button', { name: /accept suggestion/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    const [, secondInit] = vi.mocked(fetch).mock.calls[1]
    const secondBody = JSON.parse(String(secondInit?.body))

    expect(secondBody.message).toBe('Accept suggestion: Let users edit cart items before payment.')
    expect(secondBody.context.resolvingOpenQuestion).toEqual({
      id: 'oq-cart-editing',
      section: 'Cart Management',
      question: 'Can users edit cart items?',
    })
  })

  it('sends auto-decide on by default, then off once the user turns it off', async () => {
    const user = userEvent.setup()
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await user.click(screen.getByRole('button', { name: /send test message/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })
    const [, firstInit] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String(firstInit?.body)).helperMode).toBe(true)

    await user.click(screen.getByRole('button', { name: /toggle auto-decide/i }))

    expect(screen.getByTestId('floating-chat')).toHaveAttribute('data-helper-mode', 'false')
    expect(window.localStorage.getItem('mermaid:auto-decide:proj-1')).toBe('0')

    await user.click(screen.getByRole('button', { name: /send test message/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    const [, secondInit] = vi.mocked(fetch).mock.calls[1]
    expect(JSON.parse(String(secondInit?.body)).helperMode).toBe(false)
  })

  it('restores the stored auto-decide preference for this project', async () => {
    window.localStorage.setItem('mermaid:auto-decide:proj-1', '0')
    renderWorkspace('scope', makeModule({ id: 'mod-scope', name: 'Scope' }))

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat')).toHaveAttribute('data-helper-mode', 'false')
    })
  })
})
