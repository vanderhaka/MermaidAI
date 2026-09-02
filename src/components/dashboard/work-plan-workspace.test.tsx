// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkPlanWorkspace } from '@/components/dashboard/work-plan-workspace'
import type { ChatMessage } from '@/types/chat'
import type { WorkPlanContent } from '@/types/planning'
import type { PlanningStageAvailability, WorkPlanPlanningView } from '@/types/planning-ui'

const mockRefresh = vi.fn()
const mockReplace = vi.fn()
const mockPush = vi.fn()
const mockRunHandoff = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: mockReplace, push: mockPush }),
}))

vi.mock('@/lib/services/project-service', () => ({ updateProject: vi.fn() }))

vi.mock('@/hooks/usePlanningHandoff', () => ({
  usePlanningHandoff: () => ({
    status: 'idle',
    isRunning: false,
    error: null,
    run: mockRunHandoff,
    dismissError: vi.fn(),
  }),
}))

vi.mock('@/components/chat/FloatingChat', () => ({
  default: ({
    messages,
    isLoading,
    error,
    onSend,
    onRetry,
    isOpen,
    draftStorageKey,
    composerResetSignal,
    composerResetValue,
    undoableChangeSetId,
    onUndoChangeSet,
  }: {
    messages: ChatMessage[]
    isLoading: boolean
    error?: string | null
    onSend: (message: string) => Promise<boolean | void>
    onRetry?: () => void
    isOpen: boolean
    draftStorageKey?: string
    composerResetSignal?: number
    composerResetValue?: string
    undoableChangeSetId?: string | null
    onUndoChangeSet?: (changeSetId: string) => Promise<unknown>
  }) => (
    <div
      data-testid="floating-chat"
      data-open={String(isOpen)}
      data-loading={String(isLoading)}
      data-draft-key={draftStorageKey}
      data-composer-reset={composerResetSignal}
      data-composer-reset-value={composerResetValue}
    >
      {messages.map((message) => (
        <p key={message.id} data-role={message.role}>
          {message.content}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void onSend('Strengthen retry verification')}>
        Send refinement
      </button>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Retry refinement
        </button>
      )}
      {undoableChangeSetId && onUndoChangeSet && (
        <button type="button" onClick={() => void onUndoChangeSet(undoableChangeSetId)}>
          Undo latest plan change
        </button>
      )}
    </div>
  ),
}))

const projectId = '11111111-1111-4111-8111-111111111111'
const architectureVersionId = '22222222-2222-4222-8222-222222222222'
const workPlanArtifactId = '33333333-3333-4333-8333-333333333333'
const workPlanVersionId = '44444444-4444-4444-8444-444444444444'
const revisedWorkPlanVersionId = '55555555-5555-4555-8555-555555555555'
const refinementChangeSetId = '99999999-9999-4999-8999-999999999999'

const content: WorkPlanContent = {
  source_architecture_version: {
    id: architectureVersionId,
    artifact_kind: 'architecture',
    version: 3,
  },
  objective: 'Ship a dependable booking path.',
  non_goals: ['Take payments.'],
  phases: [
    {
      id: 'phase-booking',
      title: 'Booking path',
      objective: 'Create one usable outcome.',
      slice_ids: ['slice-booking'],
    },
  ],
  slices: [
    {
      id: 'slice-booking',
      title: 'Confirm a booking',
      actor_or_trigger: 'A customer chooses an available time.',
      observable_outcome: 'The customer sees a confirmation.',
      protected_invariant: 'A time can only be reserved once.',
      dependencies: [],
      source_capability_ids: ['booking'],
      acceptance_criteria: ['One valid request creates one booking.'],
      verification: [{ command: 'npm test -- booking', purpose: 'Protect booking behavior.' }],
      likely_targets: { files: [], api: ['/api/bookings'], data: ['bookings'] },
      risks: ['Concurrent requests.'],
      rollback_notes: ['Disable booking writes.'],
      assumption_ids: [],
      unresolved_blocker_ids: [],
    },
  ],
  assumptions: [],
  unresolved_blockers: [],
}

const availability: PlanningStageAvailability = {
  architecture: { state: 'current' },
  workPlan: { state: 'current', version: 1 },
  handoff: { state: 'ready', version: null },
}

function planning(overrides: Partial<WorkPlanPlanningView> = {}): WorkPlanPlanningView {
  return {
    sourceArchitectureVersion: { id: architectureVersionId, version: 3 },
    version: {
      id: workPlanVersionId,
      artifactId: workPlanArtifactId,
      artifactKind: 'work_plan',
      version: 1,
      contentHash: 'hash-v1',
      sourceVersionId: architectureVersionId,
      secondarySourceVersionId: null,
      renderedMarkdown: null,
      content,
    },
    messages: [],
    isStale: false,
    canGenerate: true,
    sourceComparison: null,
    ...overrides,
  }
}

function committedArtifact(version: number, objective: string) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    artifact_id: workPlanArtifactId,
    project_id: projectId,
    artifact_kind: 'work_plan' as const,
    version,
    content_hash: `hash-v${version}`,
    readiness_report: null,
    rendered_markdown: null,
    provenance: { source: 'chat' },
    source_version_id: architectureVersionId,
    secondary_source_version_id: null,
    created_at: '2026-09-02T00:00:00.000Z',
    content_state: 'complete' as const,
    content: { ...content, objective },
    request_key: '66666666-6666-4666-8666-666666666666',
    request_hash: 'request-hash',
  }
}

function assistantMessage(): ChatMessage {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    role: 'assistant',
    content: 'Added explicit retry verification.',
    operations: [],
    createdAt: '2026-09-02T00:00:01.000Z',
    messageKey: '88888888-8888-4888-8888-888888888888',
    planningStage: 'work_plan',
    artifactId: workPlanArtifactId,
    artifactVersionId: '55555555-5555-4555-8555-555555555555',
  }
}

function refinementReceiptMessage(): ChatMessage {
  return {
    ...assistantMessage(),
    changeSetId: refinementChangeSetId,
    artifactVersionId: revisedWorkPlanVersionId,
    metadata: {
      work_plan_receipt: {
        kind: 'work_plan_revision',
        changeSetId: refinementChangeSetId,
        previousWorkPlanVersionId: workPlanVersionId,
        workPlanVersionId: revisedWorkPlanVersionId,
        previousVersion: 1,
        committedVersion: 2,
        summary: 'Added retry verification.',
        commands: [{ type: 'update_slice' }],
      },
    },
  }
}

function planningWithCommittedRevision(): WorkPlanPlanningView {
  const base = planning()
  return {
    ...base,
    version: {
      ...base.version!,
      id: revisedWorkPlanVersionId,
      version: 2,
      contentHash: 'hash-v2',
      content: { ...content, objective: 'Ship booking with explicit retry safety.' },
    },
    messages: [refinementReceiptMessage()],
  }
}

describe('WorkPlanWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the bound plan and exposes a stage-specific durable chat draft', async () => {
    const user = userEvent.setup()
    render(
      <WorkPlanWorkspace
        project={{ id: projectId, name: 'Booking' }}
        planning={planning()}
        availability={availability}
      />,
    )

    expect(screen.getByText('Ship a dependable booking path.')).toBeInTheDocument()
    expect(screen.getByText('Work Plan v1')).toBeInTheDocument()
    expect(screen.getByText('Repository evidence boundary')).toBeInTheDocument()
    expect(
      screen.getByText(/MermaidAI has not inspected or run the target repository/),
    ).toBeInTheDocument()
    expect(screen.getByText('Suggested proof')).toBeInTheDocument()
    expect(screen.getByTestId('floating-chat')).toHaveAttribute('data-open', 'false')
    expect(screen.getByTestId('floating-chat')).toHaveAttribute(
      'data-draft-key',
      `mermaidai.planningDraft.${projectId}.work-plan`,
    )

    await user.click(screen.getByRole('button', { name: 'Refine with AI' }))
    expect(screen.getByTestId('floating-chat')).toHaveAttribute('data-open', 'true')
  })

  it('acknowledges immediately and swaps in the committed immutable revision', async () => {
    const user = userEvent.setup()
    let finishRequest: ((response: Response) => void) | undefined
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve
        }),
    )
    render(
      <WorkPlanWorkspace
        project={{ id: projectId, name: 'Booking' }}
        planning={planning()}
        availability={availability}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Send refinement' }))
    expect(screen.getByText('Strengthen retry verification')).toBeInTheDocument()
    expect(screen.getByTestId('floating-chat')).toHaveAttribute('data-loading', 'true')

    await act(async () => {
      finishRequest?.(
        Response.json({
          state: 'complete',
          artifact: committedArtifact(2, 'Ship booking with explicit retry safety.'),
          assistantMessage: assistantMessage(),
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText('Ship booking with explicit retry safety.')).toBeInTheDocument()
    })
    expect(screen.getByText('Work Plan v2')).toBeInTheDocument()
    expect(screen.getByText('Added explicit retry verification.')).toBeInTheDocument()
    expect(mockRefresh).toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/planning/work-plan/refine',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('retries a failed turn with the same durable identities', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ state: 'failed', error: 'Model output was invalid.' }, { status: 502 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          state: 'complete',
          artifact: committedArtifact(2, 'Ship booking with explicit retry safety.'),
          assistantMessage: assistantMessage(),
        }),
      )
    render(
      <WorkPlanWorkspace
        project={{ id: projectId, name: 'Booking' }}
        planning={planning()}
        availability={availability}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Send refinement' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Model output was invalid.')
    expect(mockRefresh).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Retry refinement' }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('floating-chat')).toHaveAttribute('data-composer-reset', '1')
    expect(screen.getByTestId('floating-chat')).toHaveAttribute(
      'data-composer-reset-value',
      'Strengthen retry verification',
    )

    const firstBody = JSON.parse(
      (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>
    const secondBody = JSON.parse(
      (fetchSpy.mock.calls[1]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>
    expect(secondBody).toEqual(firstBody)
  })

  it('restores the previous immutable Work Plan immediately from the latest receipt', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        state: 'complete',
        artifact: {
          ...committedArtifact(1, 'Ship a dependable booking path.'),
          id: workPlanVersionId,
        },
        assistantMessage: {
          ...assistantMessage(),
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          messageKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          content: 'Restored Work Plan v1. Work Plan v2 remains preserved in history.',
          artifactVersionId: workPlanVersionId,
          changeSetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      }),
    )
    render(
      <WorkPlanWorkspace
        project={{ id: projectId, name: 'Booking' }}
        planning={planningWithCommittedRevision()}
        availability={{ ...availability, workPlan: { state: 'current', version: 2 } }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Undo latest plan change' }))

    expect(await screen.findByText('Work Plan v1')).toBeInTheDocument()
    expect(screen.getByText(/Restored Work Plan v1/i)).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/planning/change-sets/undo',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >
    expect(body).toMatchObject({
      projectId,
      stage: 'work_plan',
      targetChangeSetId: refinementChangeSetId,
    })
  })

  it('retries Work Plan undo with the same idempotent request identity', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ error: 'Temporary conflict.' }, { status: 409 }))
      .mockResolvedValueOnce(
        Response.json({
          state: 'complete',
          artifact: {
            ...committedArtifact(1, 'Ship a dependable booking path.'),
            id: workPlanVersionId,
          },
          assistantMessage: {
            ...assistantMessage(),
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            messageKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            content: 'Restored Work Plan v1.',
            artifactVersionId: workPlanVersionId,
          },
        }),
      )
    render(
      <WorkPlanWorkspace
        project={{ id: projectId, name: 'Booking' }}
        planning={planningWithCommittedRevision()}
        availability={{ ...availability, workPlan: { state: 'current', version: 2 } }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Undo latest plan change' }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: 'Undo latest plan change' }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))

    const firstBody = JSON.parse(
      (fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>
    const secondBody = JSON.parse(
      (fetchSpy.mock.calls[1]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>
    expect(secondBody).toEqual(firstBody)
  })

  it('preserves a stale plan but blocks refinement and handoff creation', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(
      <WorkPlanWorkspace
        project={{ id: projectId, name: 'Booking' }}
        planning={planning({
          isStale: true,
          sourceComparison: {
            fromVersion: 2,
            toVersion: 3,
            capabilitiesAdded: 1,
            capabilitiesRemoved: 0,
            capabilitiesChanged: 2,
            connectionsAdded: 1,
            connectionsRemoved: 0,
            connectionsChanged: 0,
            decisionsChanged: 1,
          },
        })}
        availability={{ ...availability, workPlan: { state: 'stale', version: 1 } }}
      />,
    )

    expect(screen.getByText(/preserved for review/i)).toBeInTheDocument()
    expect(screen.getByText(/Architecture v2 → v3/i)).toBeInTheDocument()
    expect(screen.getByText(/Capabilities \+1 \/ −0 \/ ~2/i)).toBeInTheDocument()
    expect(screen.getByText(/Assumptions or blockers changed 1/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Handoff' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Send refinement' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/refresh this plan/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
