// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExecutionHandoffWorkspace } from '@/components/dashboard/execution-handoff-workspace'
import type { ExecutionHandoffContent } from '@/types/planning'
import type { ExecutionHandoffPlanningView, PlanningStageAvailability } from '@/types/planning-ui'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  run: vi.fn(),
  usePlanningHandoff: vi.fn(),
  isRunning: false,
  error: null as string | null,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}))

vi.mock('@/lib/services/project-service', () => ({ updateProject: vi.fn() }))

vi.mock('@/hooks/usePlanningHandoff', () => ({
  usePlanningHandoff: (options: unknown) => {
    mocks.usePlanningHandoff(options)
    return {
      status: mocks.isRunning ? 'running' : 'idle',
      isRunning: mocks.isRunning,
      error: mocks.error,
      run: mocks.run,
      dismissError: vi.fn(),
    }
  },
}))

const projectId = '11111111-1111-4111-8111-111111111111'
const architectureVersionId = '22222222-2222-4222-8222-222222222222'
const workPlanVersionId = '33333333-3333-4333-8333-333333333333'
const handoffArtifactId = '44444444-4444-4444-8444-444444444444'
const handoffVersionId = '55555555-5555-4555-8555-555555555555'

const content: ExecutionHandoffContent = {
  source_architecture_version: {
    id: architectureVersionId,
    artifact_kind: 'architecture',
    version: 3,
  },
  source_work_plan_version: {
    id: workPlanVersionId,
    artifact_kind: 'work_plan',
    version: 2,
  },
  objective: 'Ship a dependable booking path.',
  non_goals: ['Take payments.'],
  dependency_order: ['slice-booking'],
  slices: [
    {
      id: 'slice-booking',
      title: 'Confirm a booking',
      dependencies: [],
      acceptance_criteria: ['One valid request creates one booking.'],
      verification: [{ command: 'npm test -- booking', purpose: 'Protect booking behavior.' }],
      risks: ['Concurrent requests.'],
      rollback_notes: ['Disable booking writes.'],
    },
  ],
  assumptions: [],
  unresolved_blockers: [],
  out_of_scope: ['Production deployment.'],
  authorization_notice:
    'This packet is for review, copy, or download only. It does not authorize or start implementation.',
}

const markdown = `# Execution Handoff

## Objective

Ship a dependable booking path.

## Slice 1: Confirm a booking

- Verify with npm test -- booking.
`

const availability: PlanningStageAvailability = {
  architecture: { state: 'current' },
  workPlan: { state: 'current', version: 2 },
  handoff: { state: 'ready', version: null },
}

function planning(
  overrides: Partial<ExecutionHandoffPlanningView> = {},
): ExecutionHandoffPlanningView {
  return {
    sourceWorkPlanVersion: { id: workPlanVersionId, version: 2 },
    version: null,
    isStale: false,
    canGenerate: true,
    ...overrides,
  }
}

function renderedPlanning(
  overrides: Partial<ExecutionHandoffPlanningView> = {},
): ExecutionHandoffPlanningView {
  return planning({
    version: {
      id: handoffVersionId,
      artifactId: handoffArtifactId,
      artifactKind: 'execution_handoff',
      version: 4,
      contentHash: 'handoff-hash',
      sourceVersionId: workPlanVersionId,
      secondarySourceVersionId: architectureVersionId,
      renderedMarkdown: markdown,
      content,
    },
    canGenerate: false,
    ...overrides,
  })
}

function renderWorkspace(
  planningView: ExecutionHandoffPlanningView,
  stageAvailability: PlanningStageAvailability = availability,
) {
  return render(
    <ExecutionHandoffWorkspace
      project={{ id: projectId, name: 'Booking Studio' }}
      planning={planningView}
      availability={stageAvailability}
    />,
  )
}

describe('ExecutionHandoffWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mocks.isRunning = false
    mocks.error = null
  })

  it('explains why the stage is locked without exposing a generation action', () => {
    renderWorkspace(planning({ sourceWorkPlanVersion: null, canGenerate: false }), {
      ...availability,
      workPlan: { state: 'locked', version: null },
      handoff: { state: 'locked', version: null },
    })

    expect(screen.getByRole('heading', { name: 'Handoff is locked' })).toBeInTheDocument()
    expect(screen.getByText(/Create a current Work Plan/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Handoff' })).not.toBeInTheDocument()
  })

  it('starts deterministic packet generation from the bound Work Plan version', async () => {
    const user = userEvent.setup()
    renderWorkspace(planning())

    await user.click(screen.getByRole('button', { name: 'Create Handoff' }))

    expect(mocks.run).toHaveBeenCalledTimes(1)
    expect(mocks.usePlanningHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        sourceVersionId: workPlanVersionId,
        targetKind: 'execution_handoff',
      }),
    )
  })

  it('acknowledges packet rendering immediately and suppresses duplicate submission', () => {
    mocks.isRunning = true
    renderWorkspace(planning())

    expect(screen.getByRole('status')).toHaveTextContent('Rendering the packet')
    expect(screen.getByRole('status')).toHaveTextContent('Binding versions and checks')
    expect(screen.queryByRole('button', { name: 'Create Handoff' })).not.toBeInTheDocument()
  })

  it('renders the packet with exact source versions and an explicit no-execution boundary', () => {
    renderWorkspace(renderedPlanning(), {
      ...availability,
      handoff: { state: 'current', version: 4 },
    })

    expect(screen.getAllByRole('heading', { name: 'Execution Handoff' })).toHaveLength(2)
    expect(screen.getByText('Ship a dependable booking path.')).toBeInTheDocument()
    const exactSources = screen.getByText('Exact sources').closest('aside')
    expect(exactSources).not.toBeNull()
    expect(within(exactSources!).getByText('v3')).toBeInTheDocument()
    expect(within(exactSources!).getByText('v2')).toBeInTheDocument()
    expect(within(exactSources!).getByText('v4')).toBeInTheDocument()
    expect(screen.getByText(/Review and export only/i)).toHaveTextContent(
      'No task, branch, command, migration, deployment, or provider action can start here.',
    )
  })

  it('copies the exact rendered Markdown and confirms the action inline', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderWorkspace(renderedPlanning())

    await user.click(screen.getByRole('button', { name: 'Copy Markdown' }))

    expect(writeText).toHaveBeenCalledWith(markdown)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('falls back to a selected textarea when the Clipboard API is unavailable', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard permission denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    renderWorkspace(renderedPlanning())

    await user.click(screen.getByRole('button', { name: 'Copy Markdown' }))

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('reports when both clipboard paths fail', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard permission denied')) },
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    })
    renderWorkspace(renderedPlanning())

    await user.click(screen.getByRole('button', { name: 'Copy Markdown' }))

    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
  })

  it('downloads a project-slugged Markdown file', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn().mockReturnValue('blob:handoff')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const anchor = document.createElement('a')
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined)
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) =>
      tagName === 'a' ? anchor : createElement(tagName, options),
    )
    renderWorkspace(renderedPlanning())

    await user.click(screen.getByRole('button', { name: 'Download .md' }))

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(anchor.href).toBe('blob:handoff')
    expect(anchor.download).toBe('booking-studio-execution-handoff.md')
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:handoff')
  })

  it('preserves a stale packet and labels the exact version that needs refresh', () => {
    renderWorkspace(renderedPlanning({ isStale: true }), {
      ...availability,
      handoff: { state: 'stale', version: 4 },
    })

    expect(screen.getByText(/Work Plan changed after this packet was created/i)).toHaveTextContent(
      'Handoff v4 is preserved, but it is no longer current.',
    )
    expect(screen.getByRole('button', { name: 'Copy Markdown' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download .md' })).toBeInTheDocument()
  })
})
