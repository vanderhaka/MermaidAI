// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getUserWithDevAuth: vi.fn(),
  rateLimitCheck: vi.fn(),
  getProjectById: vi.fn(),
  getPlanningState: vi.fn(),
  getActivePlanningArtifactVersion: vi.fn(),
  getPlanningArtifactVersion: vi.fn(),
  getPlanningArtifactStaleness: vi.fn(),
  listPlanningDecisions: vi.fn(),
  listChatMessages: vi.fn(),
  addChatMessage: vi.fn(),
  refineWorkPlan: vi.fn(),
  getCommittedWorkPlanRevision: vi.fn(),
  commitWorkPlanRevision: vi.fn(),
}))

vi.mock('@/lib/auth/dev-auth', () => ({ getUserWithDevAuth: mocks.getUserWithDevAuth }))
vi.mock('@/lib/rate-limiter', () => ({ chatRateLimiter: { check: mocks.rateLimitCheck } }))
vi.mock('@/lib/services/project-service', () => ({ getProjectById: mocks.getProjectById }))
vi.mock('@/lib/services/planning-state-service', () => ({
  getPlanningState: mocks.getPlanningState,
}))
vi.mock('@/lib/services/planning-artifact-service', () => ({
  getActivePlanningArtifactVersion: mocks.getActivePlanningArtifactVersion,
  getPlanningArtifactVersion: mocks.getPlanningArtifactVersion,
  getPlanningArtifactStaleness: mocks.getPlanningArtifactStaleness,
}))
vi.mock('@/lib/services/planning-decision-service', () => ({
  listPlanningDecisions: mocks.listPlanningDecisions,
}))
vi.mock('@/lib/services/chat-message-service', () => ({
  listChatMessages: mocks.listChatMessages,
  addChatMessage: mocks.addChatMessage,
}))
vi.mock('@/lib/services/work-plan-refinement-service', () => ({
  refineWorkPlan: mocks.refineWorkPlan,
}))
vi.mock('@/lib/services/work-plan-revision-service', () => ({
  getCommittedWorkPlanRevision: mocks.getCommittedWorkPlanRevision,
  commitWorkPlanRevision: mocks.commitWorkPlanRevision,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => Promise.resolve({})) }))

import { POST } from '@/app/api/planning/work-plan/refine/route'

const userId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const architectureVersionId = '33333333-3333-4333-8333-333333333333'
const architectureArtifactId = '44444444-4444-4444-8444-444444444444'
const workPlanVersionId = '55555555-5555-4555-8555-555555555555'
const workPlanArtifactId = '66666666-6666-4666-8666-666666666666'
const nextWorkPlanVersionId = '77777777-7777-4777-8777-777777777777'
const turnId = '88888888-8888-4888-8888-888888888888'
const changeSetId = '99999999-9999-4999-8999-999999999999'
const userMessageKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const assistantMessageKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const architectureContent = {
  objective: 'Let customers book.',
  outcomes: ['A confirmed booking.'],
  actors: ['Customer'],
  capabilities: [
    {
      id: 'booking',
      name: 'Booking',
      purpose: 'Reserve a slot.',
      responsibilities: ['Confirm a free slot.'],
      boundaries: ['Does not collect payment.'],
    },
  ],
  connections: [],
  important_flows: [
    {
      id: 'book',
      actor: 'Customer',
      outcome: 'Booking confirmed.',
      capability_ids: ['booking'],
    },
  ],
  assumptions: [],
  blockers: [],
}

const workPlanContent = {
  source_architecture_version: {
    id: architectureVersionId,
    artifact_kind: 'architecture' as const,
    version: 2,
  },
  objective: 'Ship booking.',
  non_goals: ['Payments.'],
  phases: [{ id: 'phase-one', title: 'Booking', objective: 'Ship it.', slice_ids: ['book'] }],
  slices: [
    {
      id: 'book',
      title: 'Book a slot',
      actor_or_trigger: 'Customer selects a slot.',
      observable_outcome: 'Booking is confirmed.',
      protected_invariant: 'No double booking.',
      dependencies: [],
      source_capability_ids: ['booking'],
      acceptance_criteria: ['One booking is created.'],
      verification: [{ command: 'npm test -- booking' }],
      likely_targets: { files: [], api: ['/api/book'], data: ['bookings'] },
      risks: ['Contention.'],
      rollback_notes: ['Disable writes.'],
      assumption_ids: [],
      unresolved_blocker_ids: [],
    },
  ],
  assumptions: [],
  unresolved_blockers: [],
}

function architectureVersion() {
  return {
    id: architectureVersionId,
    artifact_id: architectureArtifactId,
    project_id: projectId,
    artifact_kind: 'architecture' as const,
    version: 2,
    content_state: 'complete' as const,
    content: architectureContent,
    content_hash: 'architecture-hash',
    request_key: changeSetId,
    request_hash: 'architecture-request-hash',
    readiness_report: null,
    rendered_markdown: null,
    provenance: {},
    source_version_id: null,
    secondary_source_version_id: null,
    created_at: '2026-09-02T00:00:00.000Z',
  }
}

function workPlanVersion(id = workPlanVersionId, version = 3) {
  return {
    ...architectureVersion(),
    id,
    artifact_id: workPlanArtifactId,
    artifact_kind: 'work_plan' as const,
    version,
    content: workPlanContent,
    content_hash: `work-plan-hash-${version}`,
    source_version_id: architectureVersionId,
  }
}

function assistantMessage() {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    role: 'assistant' as const,
    content: 'Added a duplicate-request check.',
    operations: [],
    createdAt: '2026-09-02T00:01:00.000Z',
    turnId,
    messageKey: assistantMessageKey,
    planningStage: 'work_plan' as const,
    artifactId: workPlanArtifactId,
    artifactVersionId: nextWorkPlanVersionId,
    changeSetId,
    metadata: {},
  }
}

function request(versionId = workPlanVersionId) {
  return new Request('http://localhost/api/planning/work-plan/refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      workPlanVersionId: versionId,
      message: 'Add duplicate-request coverage.',
      turnId,
      changeSetId,
      userMessageKey,
      assistantMessageKey,
    }),
  })
}

describe('Work Plan refinement API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserWithDevAuth.mockResolvedValue({ data: { user: { id: userId } }, error: null })
    mocks.rateLimitCheck.mockReturnValue({ allowed: true })
    mocks.getProjectById.mockResolvedValue({
      success: true,
      data: { id: projectId, user_id: userId, mode: 'architecture', name: 'Salon' },
    })
    mocks.getPlanningState.mockResolvedValue({
      success: true,
      data: { project_id: projectId, staged_workflow_enabled: true },
    })
    mocks.getActivePlanningArtifactVersion.mockResolvedValue({
      success: true,
      data: workPlanVersion(),
    })
    mocks.getCommittedWorkPlanRevision.mockResolvedValue({ success: true, data: null })
    mocks.getPlanningArtifactVersion.mockResolvedValue({
      success: true,
      data: architectureVersion(),
    })
    mocks.getPlanningArtifactStaleness.mockResolvedValue({
      success: true,
      data: { isStale: false, reasons: [] },
    })
    mocks.listPlanningDecisions.mockResolvedValue({ success: true, data: [] })
    mocks.listChatMessages.mockResolvedValue({ success: true, data: [] })
    mocks.addChatMessage.mockResolvedValue({ success: true, data: {} })
    mocks.refineWorkPlan.mockResolvedValue({
      success: true,
      data: {
        content: workPlanContent,
        summary: 'Added a duplicate-request check.',
        commandCount: 1,
        commands: [{ type: 'update_summary', objective: 'Ship booking safely.' }],
      },
    })
    mocks.commitWorkPlanRevision.mockResolvedValue({
      success: true,
      data: {
        version: workPlanVersion(nextWorkPlanVersionId, 4),
        assistantMessage: assistantMessage(),
        receipt: { kind: 'work_plan_revision', replayed: false },
      },
    })
  })

  it('persists the input, generates finite edits, and atomically commits the receipt', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        state: 'complete',
        artifact: expect.objectContaining({ id: nextWorkPlanVersionId, version: 4 }),
      }),
    )
    expect(mocks.addChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Add duplicate-request coverage.',
        planning_stage: 'work_plan',
        artifact_version_id: workPlanVersionId,
      }),
    )
    expect(mocks.refineWorkPlan).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Add duplicate-request coverage.' }),
    )
    expect(mocks.commitWorkPlanRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedWorkPlanVersionId: workPlanVersionId,
        sourceArchitectureVersionId: architectureVersionId,
        changeSetId,
      }),
    )
  })

  it('returns a committed retry before rate limiting or another model call', async () => {
    mocks.getCommittedWorkPlanRevision.mockResolvedValue({
      success: true,
      data: {
        version: workPlanVersion(nextWorkPlanVersionId, 4),
        assistantMessage: assistantMessage(),
        receipt: { kind: 'work_plan_revision', replayed: false },
      },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.rateLimitCheck).not.toHaveBeenCalled()
    expect(mocks.addChatMessage).not.toHaveBeenCalled()
    expect(mocks.refineWorkPlan).not.toHaveBeenCalled()
    expect(mocks.commitWorkPlanRevision).not.toHaveBeenCalled()
  })

  it('rejects a tab based on an older Work Plan without persisting or generating', async () => {
    const response = await POST(request('dddddddd-dddd-4ddd-8ddd-dddddddddddd'))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringContaining('v3 is now active') }),
    )
    expect(mocks.addChatMessage).not.toHaveBeenCalled()
    expect(mocks.refineWorkPlan).not.toHaveBeenCalled()
  })

  it('preserves the submitted user message when model validation fails', async () => {
    mocks.refineWorkPlan.mockResolvedValue({
      success: false,
      error: 'The edit would create a dependency cycle.',
      code: 'invalid_output',
    })

    const response = await POST(request())

    expect(response.status).toBe(502)
    expect(mocks.addChatMessage).toHaveBeenCalledTimes(1)
    expect(mocks.commitWorkPlanRevision).not.toHaveBeenCalled()
  })

  it('maps a concurrent active-version change to a recoverable conflict', async () => {
    mocks.commitWorkPlanRevision.mockResolvedValue({
      success: false,
      error: 'Work Plan changed while this refinement was running',
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringContaining('changed while') }),
    )
  })
})
