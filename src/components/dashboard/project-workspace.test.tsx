// @vitest-environment happy-dom
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectWorkspace } from '@/components/dashboard/project-workspace'
import {
  commitManualArchitectureModule,
  commitPlanningAutoDecidePreference,
  commitPlanningDecisionAction,
} from '@/lib/actions/architecture-review-actions'
import { TOOL_EVENT_DELIMITER } from '@/lib/services/llm-shared'
import { createModule } from '@/lib/services/module-service'
import { useGraphStore } from '@/store/graph-store'
import type { ChatMessage, ChatPlanningLink } from '@/types/chat'
import type { FlowNode, Module } from '@/types/graph'
import type { ArchitecturePlanningView } from '@/types/planning-ui'

const mockRefresh = vi.fn()
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}))

vi.mock('@/lib/services/auth-service', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/actions/architecture-review-actions', () => ({
  commitManualArchitectureModule: vi.fn(),
  commitPlanningAutoDecidePreference: vi.fn(),
  commitPlanningDecisionAction: vi.fn(),
}))
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
  default: ({ architecturePlanning }: { architecturePlanning?: ArchitecturePlanningView }) => (
    <div
      data-testid="prd-preview-panel"
      data-planning-version={architecturePlanning?.version?.version ?? ''}
    />
  ),
}))

vi.mock('@/components/dashboard/SavedIndicator', () => ({
  SavedIndicator: () => <span data-testid="saved-indicator" />,
}))

vi.mock('@/components/chat/FloatingChat', () => ({
  default: ({
    messages,
    streamingContent,
    pendingActivity,
    error,
    onSend,
    onStop,
    onRetry,
    helperMode,
    onToggleHelperMode,
    isOpen,
    draftStorageKey,
    undoableChangeSetId,
    onUndoChangeSet,
  }: {
    messages: ChatMessage[]
    streamingContent: string
    pendingActivity?: string | null
    error: string | null
    onSend: (message: string) => Promise<boolean>
    onStop?: () => void
    onRetry?: () => void
    helperMode?: boolean
    onToggleHelperMode?: () => void
    isOpen: boolean
    draftStorageKey?: string
    undoableChangeSetId?: string | null
    onUndoChangeSet?: (changeSetId: string) => Promise<unknown>
  }) => (
    <div
      data-testid="floating-chat"
      data-helper-mode={String(helperMode)}
      data-is-open={String(isOpen)}
      data-draft-key={draftStorageKey}
    >
      <ul data-testid="chat-messages">
        {messages.map((entry) => (
          <li
            key={entry.id}
            data-role={entry.role}
            data-tool-calls={JSON.stringify(entry.toolCalls ?? [])}
            data-change-set-id={entry.changeSetId ?? ''}
            data-change-summary={JSON.stringify(entry.metadata?.change_summary ?? null)}
          >
            {entry.content}
          </li>
        ))}
      </ul>
      <p data-testid="streaming-content">{streamingContent}</p>
      {pendingActivity && <p data-testid="architecture-activity">{pendingActivity}</p>}
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
      {undoableChangeSetId && onUndoChangeSet && (
        <button type="button" onClick={() => void onUndoChangeSet(undoableChangeSetId)}>
          Undo latest Architecture change
        </button>
      )}
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

function workspaceElement(
  initialMessages: ChatMessage[] = [],
  initialModules = [makeModule()],
  planningLink?: ChatPlanningLink,
  architecturePlanning?: ArchitecturePlanningView,
) {
  return (
    <ProjectWorkspace
      project={{ id: 'proj-1', name: 'Storefront', description: null, mode: 'architecture' }}
      initialModules={initialModules}
      initialNodes={[]}
      initialEdges={[]}
      initialConnections={[]}
      initialMessages={initialMessages}
      planningLink={planningLink}
      architecturePlanning={architecturePlanning}
    />
  )
}

function architecturePlanning(): ArchitecturePlanningView {
  return {
    expectedRevision: 4,
    autoDecideEnabled: true,
    version: {
      id: '22222222-2222-4222-8222-222222222222',
      artifactId: '11111111-1111-4111-8111-111111111111',
      version: 2,
      contentHash: 'hash-v2',
      contentState: 'complete',
      content: {
        objective: 'Coordinate bookings.',
        outcomes: ['Customers receive a confirmed booking.'],
        actors: ['Customer'],
        capabilities: [],
        connections: [],
        important_flows: [],
        assumptions: [],
        blockers: [],
      },
    },
    readinessReport: {
      schemaVersion: 2,
      projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      architectureVersionId: '22222222-2222-4222-8222-222222222222',
      architectureVersion: 2,
      architectureContentHash: 'hash-v2',
      evaluatedRevision: 4,
      state: 'needs_input',
      freshness: 'current',
      handoffEligible: false,
      checks: [],
      reasons: ['Review one proposed assumption.'],
      blockingQuestionIds: [],
      nonBlockingQuestionIds: [],
      deferredQuestionIds: [],
      proposedDecisionIds: ['33333333-3333-4333-8333-333333333333'],
      acceptedDecisionIds: [],
      supersededDecisionIds: [],
      invalidInputIds: [],
      staleInputIds: [],
    },
    decisions: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        artifact_version_id: '22222222-2222-4222-8222-222222222222',
        category: 'availability',
        statement: 'Bookings require a confirmed time slot.',
        state: 'proposed',
        provenance: 'assistant',
        readiness_impact: 'blocking',
        supersedes_decision_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        latest_event: {
          actor_type: 'assistant',
          actor_label: 'Architecture assistant',
          reason: 'Needed to complete the booking boundary.',
          evidence: [
            {
              type: 'conversation',
              reference: 'turn:1',
              summary: 'Customer needs a confirmed appointment.',
            },
          ],
        },
      },
    ],
  }
}

function toolEventChunk(tool: string, data: Record<string, unknown>): string {
  return `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool, data })}\n`
}

function toolStartChunk(tool: string): string {
  return `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool, status: 'start' })}\n`
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
    vi.clearAllMocks()
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

  it('starts a meaningful first Full Design brief with a module map, not the discovery interview', async () => {
    const user = userEvent.setup()
    render(workspaceElement([], []))

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))

    expect(body).toEqual(
      expect.objectContaining({
        mode: 'module_map',
        context: expect.objectContaining({ mode: 'module_map', modules: [] }),
      }),
    )
  })

  it('clears a stale Quick Capture selection before the first Architecture chat turn', async () => {
    const user = userEvent.setup()
    act(() => {
      useGraphStore.getState().setActiveModuleId('retired-scope-module')
    })
    render(workspaceElement([], [makeModule({ id: 'architecture-capability' })]))

    await waitFor(() => {
      expect(useGraphStore.getState().activeModuleId).toBeNull()
    })
    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.mode).toBe('module_map')
    expect(body.context.activeModuleId).toBeNull()
  })

  it('acknowledges an empty Architecture turn immediately and keeps Stop available', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(hangingStreamResponse('', init?.signal ?? undefined)),
    )
    render(workspaceElement([], []))

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    expect(await screen.findByTestId('architecture-activity')).toHaveTextContent(
      'Reading your brief and finding actors',
    )
    expect(screen.getByRole('button', { name: /stop response/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /stop response/i }))
  })

  it('moves from local acknowledgement to the real Architecture tool activity', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(
        hangingStreamResponse(
          toolStartChunk('capture_architecture_map'),
          init?.signal ?? undefined,
        ),
      ),
    )
    render(workspaceElement([], []))

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    expect(await screen.findByTestId('architecture-activity')).toHaveTextContent(
      'Mapping capabilities',
    )

    await user.click(screen.getByRole('button', { name: /stop response/i }))
  })

  it('announces connection application only when the Architecture receipt commits', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementationOnce((_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        turn: {
          turnId: string
          changeSetId: string
          operationIds: string[]
          expectedRevision: number
        }
      }
      return Promise.resolve(
        hangingStreamResponse(
          toolEventChunk('capture_architecture_map', {
            modules: [makeModule({ id: 'capability-1', name: 'Orders' })],
            connections: [],
            nodes: [],
            questions: [],
            metadata: {
              change_summary: {
                capabilitiesCreated: 1,
                connectionsCreated: 0,
                assumptionsRecorded: 0,
                questionsRecorded: 0,
                provisional: true,
              },
            },
            __chatTurnReceipt: {
              turnId: body.turn.turnId,
              changeSetId: body.turn.changeSetId,
              operationId: body.turn.operationIds[0],
              sequence: 0,
              status: 'committed',
              expectedRevision: body.turn.expectedRevision,
              committedRevision: body.turn.expectedRevision + 1,
              artifactVersionId: '99999999-9999-4999-8999-999999999999',
            },
          }),
          init?.signal ?? undefined,
        ),
      )
    })
    render(workspaceElement([], []))

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    expect(await screen.findByTestId('architecture-activity')).toHaveTextContent(
      'Applying committed connections',
    )

    await user.click(screen.getByRole('button', { name: /stop response/i }))
  })

  it('links the current streamed summary to its matching committed Architecture receipt', async () => {
    const user = userEvent.setup()
    const changeSummary = {
      capabilitiesCreated: 1,
      connectionsCreated: 0,
      assumptionsRecorded: 1,
      questionsRecorded: 0,
      provisional: true,
    }
    const normalizedChangeSummary = {
      created: 1,
      updated: 0,
      deleted: 0,
      assumed: 1,
      resolved: 0,
      ...changeSummary,
    }
    let committedChangeSetId = ''
    vi.mocked(fetch).mockImplementationOnce((_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        turn: {
          turnId: string
          changeSetId: string
          operationIds: string[]
          expectedRevision: number
        }
      }
      committedChangeSetId = body.turn.changeSetId
      return Promise.resolve(
        streamResponse([
          toolEventChunk('capture_architecture_map', {
            modules: [makeModule({ id: 'capability-1', name: 'Orders' })],
            connections: [],
            nodes: [],
            questions: [],
            metadata: { change_summary: changeSummary },
            __chatTurnReceipt: {
              turnId: body.turn.turnId,
              changeSetId: body.turn.changeSetId,
              operationId: body.turn.operationIds[0],
              sequence: 0,
              status: 'committed',
              expectedRevision: body.turn.expectedRevision,
              committedRevision: body.turn.expectedRevision + 1,
              artifactVersionId: '99999999-9999-4999-8999-999999999999',
            },
          }),
          'Mapped the first Architecture.',
        ]),
      )
    })
    render(workspaceElement([], []))

    await user.click(screen.getByRole('button', { name: /send test message/i }))

    await waitFor(() => {
      expect(lastChatMessage()).toHaveTextContent('Mapped the first Architecture.')
    })
    expect(lastChatMessage()).toHaveAttribute('data-change-set-id', committedChangeSetId)
    expect(lastChatMessage()).toHaveAttribute(
      'data-change-summary',
      JSON.stringify(normalizedChangeSummary),
    )
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
    render(workspaceElement([], []))

    await user.click(screen.getByRole('button', { name: /send test message/i }))
    await waitFor(() => {
      expect(screen.getByTestId('chat-error')).toHaveTextContent('Network unreachable')
    })
    expect(screen.queryByTestId('architecture-activity')).not.toBeInTheDocument()

    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(hangingStreamResponse('', init?.signal ?? undefined)),
    )
    await user.click(screen.getByRole('button', { name: /^retry$/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    const [, retryInit] = vi.mocked(fetch).mock.calls[1]
    expect(JSON.parse(String(retryInit?.body)).message).toBe('Detail the checkout flow')
    expect(screen.getAllByText('Detail the checkout flow')).toHaveLength(1)
    expect(screen.getByTestId('architecture-activity')).toHaveTextContent(
      'Reading your brief and finding actors',
    )

    await user.click(screen.getByRole('button', { name: /stop response/i }))
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

  it('adds a staged Architecture capability through the audited command action', async () => {
    const user = userEvent.setup()
    vi.mocked(commitManualArchitectureModule).mockResolvedValue({
      success: true,
      receipt: {
        changeSetId: '44444444-4444-4444-8444-444444444444',
        committedRevision: 5,
        replayed: false,
      },
    })
    render(
      workspaceElement([], [makeModule()], {
        stage: 'architecture',
        artifactId: '11111111-1111-4111-8111-111111111111',
        artifactVersionId: '22222222-2222-4222-8222-222222222222',
        expectedRevision: 4,
      }),
    )

    await user.click(screen.getByRole('button', { name: /add module/i }))

    await waitFor(() => {
      expect(commitManualArchitectureModule).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          architectureVersionId: '22222222-2222-4222-8222-222222222222',
          expectedRevision: 4,
          name: 'Module 2',
          requestId: expect.any(String),
        }),
      )
    })
    expect(createModule).not.toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
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

  it('shows the staged Architecture status and persists Auto-Decide on the server', async () => {
    const user = userEvent.setup()
    vi.mocked(commitPlanningAutoDecidePreference).mockResolvedValue({
      success: true,
      enabled: false,
      expectedRevision: 5,
    })
    render(
      workspaceElement(
        [],
        [makeModule()],
        {
          stage: 'architecture',
          artifactId: '11111111-1111-4111-8111-111111111111',
          artifactVersionId: '22222222-2222-4222-8222-222222222222',
          expectedRevision: 4,
        },
        architecturePlanning(),
      ),
    )

    expect(screen.getByText('Architecture', { selector: 'span' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /architecture needs input.*show readiness details/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /architecture brief/i })).toBeInTheDocument()
    expect(screen.getByTestId('prd-preview-panel')).toHaveAttribute('data-planning-version', '2')
    expect(screen.getByTestId('floating-chat')).toHaveAttribute(
      'data-draft-key',
      'mermaidai.planningDraft.proj-1.architecture',
    )

    await user.click(screen.getByRole('button', { name: /toggle auto-decide/i }))

    await waitFor(() => {
      expect(commitPlanningAutoDecidePreference).toHaveBeenCalledWith({
        projectId: 'proj-1',
        enabled: false,
        expectedRevision: 4,
      })
    })
    expect(screen.getByTestId('floating-chat')).toHaveAttribute('data-helper-mode', 'false')
    expect(window.localStorage.getItem('mermaid:auto-decide:proj-1')).toBeNull()
  })

  it('undoes only the latest Architecture receipt through the protected route', async () => {
    const user = userEvent.setup()
    const targetChangeSetId = '44444444-4444-4444-8444-444444444444'
    const fetchMock = vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        state: 'complete',
        receipt: {
          committedRevision: 5,
          changeSetId: '55555555-5555-4555-8555-555555555555',
        },
      }),
    )
    const committedMessage: ChatMessage = {
      id: 'assistant-architecture-receipt',
      role: 'assistant',
      content: 'Updated the booking boundary.',
      operations: [],
      createdAt: '2026-09-02T00:00:00.000Z',
      planningStage: 'architecture',
      artifactId: '11111111-1111-4111-8111-111111111111',
      artifactVersionId: '22222222-2222-4222-8222-222222222222',
      changeSetId: targetChangeSetId,
      metadata: {
        change_summary: {
          capabilitiesCreated: 0,
          connectionsCreated: 0,
          assumptionsRecorded: 0,
          questionsRecorded: 0,
          created: 0,
          updated: 1,
          deleted: 0,
          assumed: 0,
          resolved: 0,
          provisional: true,
        },
      },
    }
    render(
      workspaceElement(
        [committedMessage],
        [makeModule()],
        {
          stage: 'architecture',
          artifactId: '11111111-1111-4111-8111-111111111111',
          artifactVersionId: '22222222-2222-4222-8222-222222222222',
          expectedRevision: 4,
        },
        architecturePlanning(),
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Undo latest Architecture change' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/planning/change-sets/undo',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >
    expect(body).toMatchObject({
      projectId: 'proj-1',
      stage: 'architecture',
      targetChangeSetId,
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('commits a proposed Architecture decision from the readiness panel', async () => {
    const user = userEvent.setup()
    vi.mocked(commitPlanningDecisionAction).mockResolvedValue({
      success: true,
      receipt: {
        changeSetId: '44444444-4444-4444-8444-444444444444',
        committedRevision: 5,
        replayed: false,
      },
    })
    render(
      workspaceElement(
        [],
        [makeModule()],
        {
          stage: 'architecture',
          artifactId: '11111111-1111-4111-8111-111111111111',
          artifactVersionId: '22222222-2222-4222-8222-222222222222',
          expectedRevision: 4,
        },
        architecturePlanning(),
      ),
    )

    await user.click(
      screen.getByRole('button', { name: /architecture needs input.*show readiness details/i }),
    )
    await user.click(
      screen.getByRole('button', { name: /accept: bookings require a confirmed time slot/i }),
    )
    await user.type(screen.getByLabelText(/reason for accepting/i), 'Matches the agreed flow.')
    await user.click(screen.getByRole('button', { name: /confirm accept/i }))

    await waitFor(() => {
      expect(commitPlanningDecisionAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'accept',
          projectId: 'proj-1',
          architectureVersionId: '22222222-2222-4222-8222-222222222222',
          expectedRevision: 4,
          decisionId: '33333333-3333-4333-8333-333333333333',
          reason: 'Matches the agreed flow.',
          requestId: expect.any(String),
        }),
      )
    })
    expect(mockRefresh).toHaveBeenCalled()
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
