// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getUserWithDevAuth: vi.fn(),
  rateLimitCheck: vi.fn(),
  getProjectById: vi.fn(),
  getPlanningArtifactVersion: vi.fn(),
  getPlanningArtifactStaleness: vi.fn(),
  getPlanningState: vi.fn(),
  getLatestArchitectureReadinessReport: vi.fn(),
  listPlanningDecisions: vi.fn(),
  beginPlanningHandoff: vi.fn(),
  claimPlanningHandoff: vi.fn(),
  completePlanningHandoff: vi.fn(),
  failPlanningHandoff: vi.fn(),
  generateWorkPlan: vi.fn(),
}))

vi.mock('@/lib/auth/dev-auth', () => ({ getUserWithDevAuth: mocks.getUserWithDevAuth }))
vi.mock('@/lib/rate-limiter', () => ({
  chatRateLimiter: { check: mocks.rateLimitCheck },
}))
vi.mock('@/lib/services/project-service', () => ({ getProjectById: mocks.getProjectById }))
vi.mock('@/lib/services/planning-artifact-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/planning-artifact-service')>()
  return {
    ...actual,
    getPlanningArtifactVersion: mocks.getPlanningArtifactVersion,
    getPlanningArtifactStaleness: mocks.getPlanningArtifactStaleness,
  }
})
vi.mock('@/lib/services/planning-state-service', () => ({
  getPlanningState: mocks.getPlanningState,
}))
vi.mock('@/lib/services/architecture-readiness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/architecture-readiness')>()
  return {
    ...actual,
    getLatestArchitectureReadinessReport: mocks.getLatestArchitectureReadinessReport,
  }
})
vi.mock('@/lib/services/planning-decision-service', () => ({
  listPlanningDecisions: mocks.listPlanningDecisions,
}))
vi.mock('@/lib/services/planning-handoff-service', () => ({
  beginPlanningHandoff: mocks.beginPlanningHandoff,
  claimPlanningHandoff: mocks.claimPlanningHandoff,
  completePlanningHandoff: mocks.completePlanningHandoff,
  failPlanningHandoff: mocks.failPlanningHandoff,
}))
vi.mock('@/lib/services/work-plan-generator', () => ({
  generateWorkPlan: mocks.generateWorkPlan,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => Promise.resolve({})) }))

import { POST } from '@/app/api/planning/handoff/route'

const userId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const architectureArtifactId = '33333333-3333-4333-8333-333333333333'
const architectureVersionId = '44444444-4444-4444-8444-444444444444'
const requestKey = '55555555-5555-4555-8555-555555555555'
const jobId = '66666666-6666-4666-8666-666666666666'
const claimToken = '77777777-7777-4777-8777-777777777777'
const workPlanArtifactId = '88888888-8888-4888-8888-888888888888'
const workPlanVersionId = '99999999-9999-4999-8999-999999999999'

const architectureContent = {
  objective: 'Let customers book.',
  outcomes: ['A confirmed appointment.'],
  actors: ['Customer'],
  capabilities: [
    {
      id: 'booking',
      name: 'Booking',
      purpose: 'Reserve an appointment.',
      responsibilities: ['Confirm a free slot.'],
      boundaries: ['Does not collect payment.'],
    },
  ],
  connections: [],
  important_flows: [
    {
      id: 'customer-books',
      actor: 'Customer',
      outcome: 'Appointment confirmed.',
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
  non_goals: ['Collect payments.'],
  phases: [
    {
      id: 'phase-one',
      title: 'Booking',
      objective: 'Deliver the booking path.',
      slice_ids: ['slice-booking'],
    },
  ],
  slices: [
    {
      id: 'slice-booking',
      title: 'Confirm booking',
      actor_or_trigger: 'A customer selects a slot.',
      observable_outcome: 'A booking is confirmed.',
      protected_invariant: 'A slot cannot be double booked.',
      dependencies: [],
      source_capability_ids: ['booking'],
      acceptance_criteria: ['One request creates one booking.'],
      verification: [{ command: 'npm test -- booking' }],
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

function architectureVersion() {
  return {
    id: architectureVersionId,
    artifact_id: architectureArtifactId,
    project_id: projectId,
    artifact_kind: 'architecture' as const,
    version: 2,
    content_hash: 'architecture-hash',
    readiness_report: null,
    rendered_markdown: null,
    provenance: {},
    source_version_id: null,
    secondary_source_version_id: null,
    created_at: '2026-09-02T00:00:00.000Z',
    content_state: 'complete' as const,
    content: architectureContent,
    request_key: requestKey,
    request_hash: 'request-hash',
  }
}

function workPlanVersion() {
  return {
    id: workPlanVersionId,
    artifact_id: workPlanArtifactId,
    project_id: projectId,
    artifact_kind: 'work_plan' as const,
    version: 1,
    content_hash: 'work-plan-hash',
    readiness_report: null,
    rendered_markdown: null,
    provenance: {},
    source_version_id: architectureVersionId,
    secondary_source_version_id: null,
    created_at: '2026-09-02T00:01:00.000Z',
    content_state: 'complete' as const,
    content: workPlanContent,
    request_key: requestKey,
    request_hash: 'work-plan-request-hash',
  }
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: jobId,
    project_id: projectId,
    source_version_id: architectureVersionId,
    target_artifact_id: workPlanArtifactId,
    request_key: requestKey,
    request_hash: 'handoff-hash',
    state: 'pending',
    attempt_count: 0,
    claimed_at: null,
    claim_expires_at: null,
    claim_token: null,
    completed_version_id: null,
    error_code: null,
    created_at: '2026-09-02T00:00:00.000Z',
    updated_at: '2026-09-02T00:00:00.000Z',
    ...overrides,
  }
}

function request(
  targetKind: 'work_plan' | 'execution_handoff' = 'work_plan',
  sourceVersionId = architectureVersionId,
) {
  return new Request('http://localhost/api/planning/handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, sourceVersionId, targetKind, requestKey }),
  })
}

function readiness(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    projectId,
    architectureVersionId,
    architectureVersion: 2,
    architectureContentHash: 'architecture-hash',
    evaluatedRevision: 3,
    state: 'ready',
    freshness: 'current',
    handoffEligible: true,
    checks: [],
    reasons: [],
    blockingQuestionIds: [],
    nonBlockingQuestionIds: [],
    deferredQuestionIds: [],
    proposedDecisionIds: [],
    acceptedDecisionIds: [],
    supersededDecisionIds: [],
    invalidInputIds: [],
    staleInputIds: [],
    ...overrides,
  }
}

describe('planning handoff API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserWithDevAuth.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })
    mocks.rateLimitCheck.mockReturnValue({ allowed: true })
    mocks.getProjectById.mockResolvedValue({
      success: true,
      data: { id: projectId, user_id: userId, mode: 'architecture', name: 'Salon' },
    })
    mocks.getPlanningArtifactVersion.mockResolvedValue({
      success: true,
      data: architectureVersion(),
    })
    mocks.getPlanningState.mockResolvedValue({
      success: true,
      data: {
        project_id: projectId,
        stage: 'architecture',
        readiness_state: 'ready',
        auto_decide_enabled: true,
        staged_workflow_enabled: true,
        write_safety_revision: 3,
        active_architecture_artifact_id: architectureArtifactId,
        active_work_plan_artifact_id: null,
        active_execution_handoff_artifact_id: null,
        architecture_viewport: { x: 0, y: 0, zoom: 1 },
        created_at: '2026-09-02T00:00:00.000Z',
        updated_at: '2026-09-02T00:00:00.000Z',
      },
    })
    mocks.getLatestArchitectureReadinessReport.mockResolvedValue({
      success: true,
      data: { report: readiness() },
    })
    mocks.listPlanningDecisions.mockResolvedValue({ success: true, data: [] })
    mocks.beginPlanningHandoff.mockResolvedValue({ success: true, data: job() })
    mocks.claimPlanningHandoff.mockResolvedValue({
      success: true,
      data: {
        outcome: 'claimed',
        job: job({ state: 'running', attempt_count: 1, claim_token: claimToken }),
      },
    })
    mocks.generateWorkPlan.mockResolvedValue({ success: true, data: workPlanContent })
    mocks.completePlanningHandoff.mockResolvedValue({
      success: true,
      data: workPlanVersion(),
    })
    mocks.failPlanningHandoff.mockResolvedValue({
      success: true,
      data: job({ state: 'failed' }),
    })
    mocks.getPlanningArtifactStaleness.mockResolvedValue({
      success: true,
      data: { isStale: false, reasons: [] },
    })
  })

  it('generates and atomically completes one source-bound Work Plan', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        state: 'complete',
        jobId,
        artifact: expect.objectContaining({ id: workPlanVersionId }),
      }),
    )
    expect(mocks.generateWorkPlan).toHaveBeenCalledTimes(1)
    expect(mocks.completePlanningHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        jobId,
        claimToken,
        targetKind: 'work_plan',
        content: workPlanContent,
      }),
    )
  })

  it('refuses to start until exact Architecture readiness is current and eligible', async () => {
    mocks.getLatestArchitectureReadinessReport.mockResolvedValue({
      success: true,
      data: { report: readiness({ handoffEligible: false, state: 'needs_input' }) },
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringContaining('not ready') }),
    )
    expect(mocks.beginPlanningHandoff).not.toHaveBeenCalled()
    expect(mocks.generateWorkPlan).not.toHaveBeenCalled()
  })

  it('returns running immediately for a double-click without a second generation', async () => {
    mocks.claimPlanningHandoff.mockResolvedValue({
      success: true,
      data: {
        outcome: 'busy',
        job: job({ state: 'running', attempt_count: 1 }),
      },
    })

    const response = await POST(request())

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      state: 'running',
      jobId,
      attemptCount: 1,
    })
    expect(mocks.generateWorkPlan).not.toHaveBeenCalled()
  })

  it('returns an already committed result after a lost response', async () => {
    mocks.claimPlanningHandoff.mockResolvedValue({
      success: true,
      data: {
        outcome: 'complete',
        job: job({
          state: 'complete',
          completed_version_id: workPlanVersionId,
        }),
      },
    })
    mocks.getPlanningArtifactVersion
      .mockResolvedValueOnce({ success: true, data: architectureVersion() })
      .mockResolvedValueOnce({ success: true, data: workPlanVersion() })

    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        state: 'complete',
        artifact: expect.objectContaining({ id: workPlanVersionId }),
      }),
    )
    expect(mocks.generateWorkPlan).not.toHaveBeenCalled()
    expect(mocks.completePlanningHandoff).not.toHaveBeenCalled()
  })

  it('fails the lease when model output is invalid and leaves Retry available', async () => {
    mocks.generateWorkPlan.mockResolvedValue({
      success: false,
      error: 'Invalid Work Plan.',
      code: 'invalid_output',
    })

    const response = await POST(request())

    expect(response.status).toBe(502)
    expect(mocks.failPlanningHandoff).toHaveBeenCalledWith({
      projectId,
      jobId,
      claimToken,
      errorCode: 'invalid_output',
    })
    expect(mocks.completePlanningHandoff).not.toHaveBeenCalled()
  })

  it('builds the Execution Handoff deterministically without another model call', async () => {
    mocks.getPlanningArtifactVersion.mockResolvedValue({
      success: true,
      data: workPlanVersion(),
    })
    mocks.beginPlanningHandoff.mockResolvedValue({
      success: true,
      data: job({ source_version_id: workPlanVersionId }),
    })
    mocks.claimPlanningHandoff.mockResolvedValue({
      success: true,
      data: {
        outcome: 'claimed',
        job: job({
          source_version_id: workPlanVersionId,
          state: 'running',
          attempt_count: 1,
          claim_token: claimToken,
        }),
      },
    })
    mocks.completePlanningHandoff.mockImplementation((input) =>
      Promise.resolve({
        success: true,
        data: {
          ...workPlanVersion(),
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          artifact_kind: 'execution_handoff',
          content: input.content,
          rendered_markdown: input.renderedMarkdown,
          source_version_id: workPlanVersionId,
          secondary_source_version_id: architectureVersionId,
        },
      }),
    )

    const response = await POST(request('execution_handoff', workPlanVersionId))

    expect(response.status).toBe(200)
    expect(mocks.generateWorkPlan).not.toHaveBeenCalled()
    expect(mocks.completePlanningHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        targetKind: 'execution_handoff',
        renderedMarkdown: expect.stringContaining('does not authorize or start implementation'),
      }),
    )
  })

  it('blocks a stale Work Plan from producing a fresh Handoff', async () => {
    mocks.getPlanningArtifactVersion.mockResolvedValue({
      success: true,
      data: workPlanVersion(),
    })
    mocks.getPlanningArtifactStaleness.mockResolvedValue({
      success: true,
      data: { isStale: true, reasons: ['architecture_source_changed'] },
    })

    const response = await POST(request('execution_handoff', workPlanVersionId))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.stringContaining('stale Work Plan') }),
    )
    expect(mocks.beginPlanningHandoff).not.toHaveBeenCalled()
  })
})
