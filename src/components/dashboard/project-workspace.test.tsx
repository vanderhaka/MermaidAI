// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectWorkspace } from '@/components/dashboard/project-workspace'
import { TOOL_EVENT_DELIMITER } from '@/lib/services/llm-shared'
import { createModule } from '@/lib/services/module-service'
import { useGraphStore } from '@/store/graph-store'
import type { ChatMessage } from '@/types/chat'
import type { FlowNode, Module } from '@/types/graph'

const mockRefresh = vi.fn()
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}))

vi.mock('@/lib/services/auth-service', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/services/module-service', () => ({ createModule: vi.fn() }))
vi.mock('@/lib/services/project-service', () => ({
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

vi.mock('@/components/canvas/CanvasContainer', () => ({
  default: () => <div data-testid="canvas-container" />,
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
    helperMode,
    onToggleHelperMode,
    isOpen,
  }: {
    messages: ChatMessage[]
    streamingContent: string
    error: string | null
    onSend: (message: string) => Promise<boolean>
    onStop?: () => void
    onRetry?: () => void
    helperMode?: boolean
    onToggleHelperMode?: () => void
    isOpen: boolean
  }) => (
    <div
      data-testid="floating-chat"
      data-helper-mode={String(helperMode)}
      data-is-open={String(isOpen)}
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
      <button type="button" onClick={() => void onSend('Detail the checkout flow')}>
        Send test message
      </button>
    </div>
  ),
}))

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod-1',
    project_id: 'proj-1',
    domain: null,
    name: 'Checkout',
    description: null,
    prd_content: '',
    position: { x: 0, y: 0 },
    color: '#111827',
    entry_points: [],
    exit_points: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'node-1',
    module_id: 'mod-1',
    node_type: 'process',
    label: 'Capture order',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '#2563eb',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
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

function workspaceElement(initialMessages: ChatMessage[] = [], initialModules = [makeModule()]) {
  return (
    <ProjectWorkspace
      project={{ id: 'proj-1', name: 'Storefront', description: null, mode: 'architecture' }}
      initialModules={initialModules}
      initialNodes={[]}
      initialEdges={[]}
      initialConnections={[]}
      initialMessages={initialMessages}
    />
  )
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

describe('ProjectWorkspace chat streaming', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockRefresh.mockClear()
    useGraphStore.getState().reset()
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Assistant response')))
  })

  it('automatically maps a promoted scope in Full Design mode', async () => {
    window.sessionStorage.setItem('mermaid:scope-handoff:proj-1', 'pending')
    render(workspaceElement([], [makeModule({ id: 'mod-scope', name: 'Scope' })]))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))

    expect(body.message).toBe(
      'Turn the captured Quick Capture flow into a Full Design module map now. Create and connect every module, preserve the captured decisions, and carry unresolved questions forward without blocking.',
    )
    expect(body.mode).toBe('module_map')
    expect(body.context.activeModuleId).toBeNull()
    expect(screen.getByTestId('floating-chat')).toHaveAttribute('data-is-open', 'true')
    expect(window.sessionStorage.getItem('mermaid:scope-handoff:proj-1')).toBeNull()
  })

  it('applies node and edge events to the canvas as they stream, not after a refresh', async () => {
    const user = userEvent.setup()
    const node = makeNode({ id: 'node-detail', label: 'Validate card' })
    vi.mocked(fetch).mockResolvedValueOnce(
      streamResponse([toolEventChunk('create_node', { node }), 'Added the step.']),
    )
    render(workspaceElement())

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(useGraphStore.getState().nodes).toEqual([node])
    })
  })

  it('highlights only the nodes the current turn touched', async () => {
    const user = userEvent.setup()
    const node = makeNode({ id: 'node-detail', label: 'Validate card' })
    vi.mocked(fetch).mockResolvedValueOnce(
      streamResponse([toolEventChunk('create_node', { node }), 'Added the step.']),
    )
    render(workspaceElement())

    act(() => {
      useGraphStore.getState().markTurnChanged(['node-from-last-turn'])
    })

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect([...useGraphStore.getState().lastTurnChangedIds]).toEqual(['node-detail'])
    })
  })

  it('keeps the partial answer and shows no error when the user stops a response', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(hangingStreamResponse('Half an answer', init?.signal ?? undefined)),
    )
    render(workspaceElement())

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
    expect(screen.getByTestId('chat-messages')).toHaveTextContent('Detail the checkout flow')
  })

  it('keeps the turn tool calls on the assistant message it committed', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValueOnce(
      streamResponse([
        toolEventChunk('create_node', { node: makeNode({ id: 'node-detail' }) }),
        toolEventChunk('lookup_docs', { lookup: { library: 'stripe', topic: 'webhooks' } }),
        'Added the step.',
      ]),
    )
    render(workspaceElement())

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(screen.getByTestId('chat-messages')).toHaveTextContent('Added the step.')
    })
    expect(lastChatMessage()).toHaveAttribute(
      'data-tool-calls',
      JSON.stringify(['Created node', 'Looked up stripe docs']),
    )
  })

  it('keeps the turn tool calls on the interrupted assistant message', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(
        hangingStreamResponse(
          `${toolEventChunk('create_node', { node: makeNode({ id: 'node-detail' }) })}Half an answer`,
          init?.signal ?? undefined,
        ),
      ),
    )
    render(workspaceElement())

    await user.click(screen.getByRole('button', { name: /send test message/i }))
    await waitFor(() => {
      expect(screen.getByTestId('streaming-content')).toHaveTextContent('Half an answer')
    })

    await user.click(screen.getByRole('button', { name: /stop response/i }))

    await waitFor(() => {
      expect(screen.getByTestId('chat-messages')).toHaveTextContent(/⚠ Response interrupted/)
    })
    expect(lastChatMessage()).toHaveAttribute('data-tool-calls', JSON.stringify(['Created node']))
  })

  it('shows send failures inside the chat and re-sends the same message on retry', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network unreachable'))
    render(workspaceElement())

    await user.click(screen.getByRole('button', { name: /send test message/i }))
    await waitFor(() => {
      expect(screen.getByTestId('chat-error')).toHaveTextContent('Network unreachable')
    })

    await user.click(screen.getByRole('button', { name: /^retry$/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    const [, retryInit] = vi.mocked(fetch).mock.calls[1]
    expect(JSON.parse(String(retryInit?.body)).message).toBe('Detail the checkout flow')
    expect(screen.getAllByText('Detail the checkout flow')).toHaveLength(1)
  })

  it('keeps page-level failures in page flow, where a closed chat panel cannot hide them', async () => {
    const user = userEvent.setup()
    vi.mocked(createModule).mockResolvedValue({ success: false, error: 'Module limit reached' })
    render(workspaceElement())

    await user.click(screen.getByRole('button', { name: /add module/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Module limit reached')
    expect(screen.getByTestId('floating-chat')).not.toContainElement(alert)
    expect(screen.queryByTestId('chat-error')).not.toBeInTheDocument()
  })

  it('does not let a refresh landing mid-turn wipe the in-flight conversation', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(hangingStreamResponse('Working on it', init?.signal ?? undefined)),
    )
    const { rerender } = render(workspaceElement())

    await user.click(screen.getByRole('button', { name: /send test message/i }))
    await waitFor(() => {
      expect(screen.getByTestId('streaming-content')).toHaveTextContent('Working on it')
    })

    rerender(workspaceElement([makeServerMessage('Stale server history')]))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(screen.getByTestId('chat-messages')).toHaveTextContent('Detail the checkout flow')
    expect(screen.getByTestId('chat-messages')).not.toHaveTextContent('Stale server history')

    await user.click(screen.getByRole('button', { name: /stop response/i }))
    rerender(workspaceElement([makeServerMessage('Stale server history')]))

    await waitFor(() => {
      expect(screen.getByTestId('chat-messages')).toHaveTextContent('Stale server history')
    })
  })

  it('sends auto-decide on by default, then off once the user turns it off', async () => {
    const user = userEvent.setup()
    render(workspaceElement())

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
    render(workspaceElement())

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat')).toHaveAttribute('data-helper-mode', 'false')
    })
  })
})
