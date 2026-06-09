// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScopeWorkspace } from '@/components/dashboard/scope-workspace'
import { useGraphStore } from '@/store/graph-store'
import type { Module, OpenQuestion, ProjectMode } from '@/types/graph'

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('@/lib/services/project-service', () => ({
  updateProject: vi.fn(),
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
    onSend,
    subtitle,
    examplePrompts,
  }: {
    onSend: (message: string) => Promise<boolean>
    subtitle: string
    examplePrompts: string[]
  }) => (
    <div
      data-testid="floating-chat"
      data-subtitle={subtitle}
      data-example-prompts={JSON.stringify(examplePrompts)}
    >
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

function renderWorkspace(
  mode: ProjectMode,
  module: Module,
  initialOpenQuestions: OpenQuestion[] = [],
) {
  return render(
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
      initialMessages={[]}
      initialOpenQuestions={initialOpenQuestions}
    />,
  )
}

function successfulStreamResponse() {
  return new Response('Assistant response', { status: 200 })
}

describe('ScopeWorkspace chat mode routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useGraphStore.getState().reset()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulStreamResponse()))
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
})
