// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  beginPlanningHandoff,
  claimPlanningHandoff,
  completePlanningHandoff,
  failPlanningHandoff,
  getPlanningHandoffRequestHash,
} from '@/lib/services/planning-handoff-service'

const projectId = '11111111-1111-4111-8111-111111111111'
const sourceVersionId = '22222222-2222-4222-8222-222222222222'
const targetArtifactId = '33333333-3333-4333-8333-333333333333'
const jobId = '44444444-4444-4444-8444-444444444444'
const requestKey = '55555555-5555-4555-8555-555555555555'
const claimToken = '66666666-6666-4666-8666-666666666666'
const completedVersionId = '77777777-7777-4777-8777-777777777777'

const workPlan = {
  source_architecture_version: {
    id: sourceVersionId,
    artifact_kind: 'architecture' as const,
    version: 2,
  },
  objective: 'Ship dependable appointment booking.',
  non_goals: ['Redesign the marketing website.'],
  phases: [
    {
      id: 'phase-foundation',
      title: 'Booking foundation',
      objective: 'Deliver one safe booking slice.',
      slice_ids: ['slice-booking'],
    },
  ],
  slices: [
    {
      id: 'slice-booking',
      title: 'Confirm an appointment',
      actor_or_trigger: 'A customer chooses an available time.',
      observable_outcome: 'The customer sees a confirmed appointment.',
      protected_invariant: 'One appointment cannot reserve the same slot twice.',
      dependencies: [],
      source_capability_ids: ['booking'],
      acceptance_criteria: ['A valid available slot produces one confirmation.'],
      verification: [{ command: 'npm test -- booking', purpose: 'Protect booking behavior.' }],
      likely_targets: { files: ['src/booking.ts'], api: ['/api/bookings'], data: ['bookings'] },
      risks: ['Concurrent requests may race.'],
      rollback_notes: ['Disable the booking write route.'],
      assumption_ids: [],
      unresolved_blocker_ids: [],
    },
  ],
  assumptions: [],
  unresolved_blockers: [],
}

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: jobId,
    project_id: projectId,
    source_version_id: sourceVersionId,
    target_artifact_id: targetArtifactId,
    request_key: requestKey,
    request_hash: getPlanningHandoffRequestHash({
      sourceVersionId,
      targetKind: 'work_plan',
    }),
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

function completedVersionRow() {
  return {
    id: completedVersionId,
    artifact_id: targetArtifactId,
    project_id: projectId,
    version: 1,
    content_state: 'complete',
    content: workPlan,
    content_hash: expect.any(String),
    request_key: requestKey,
    request_hash: expect.any(String),
    readiness_report: null,
    rendered_markdown: null,
    provenance: {},
    source_version_id: sourceVersionId,
    secondary_source_version_id: null,
    created_at: '2026-09-02T00:00:01.000Z',
  }
}

const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ rpc: mockRpc })),
}))

describe('planning handoff service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('begins one source-bound handoff with a stable request hash', async () => {
    mockRpc.mockResolvedValue({ data: { job: jobRow() }, error: null })

    await expect(
      beginPlanningHandoff({
        projectId,
        sourceVersionId,
        targetKind: 'work_plan',
        requestKey,
      }),
    ).resolves.toEqual({ success: true, data: jobRow() })

    expect(mockRpc).toHaveBeenCalledWith('begin_planning_handoff', {
      p_project_id: projectId,
      p_source_version_id: sourceVersionId,
      p_target_kind: 'work_plan',
      p_request_key: requestKey,
      p_request_hash: getPlanningHandoffRequestHash({
        sourceVersionId,
        targetKind: 'work_plan',
      }),
    })
  })

  it('returns a claim token only for a newly acquired lease', async () => {
    mockRpc.mockResolvedValue({
      data: {
        outcome: 'claimed',
        job: jobRow({
          state: 'running',
          attempt_count: 1,
          claim_token: claimToken,
          claimed_at: '2026-09-02T00:00:00.000Z',
          claim_expires_at: '2026-09-02T00:02:00.000Z',
        }),
      },
      error: null,
    })

    const result = await claimPlanningHandoff({ projectId, jobId })

    expect(result.success && result.data.outcome).toBe('claimed')
    expect(result.success && result.data.job.claim_token).toBe(claimToken)
    expect(mockRpc).toHaveBeenCalledWith('claim_planning_handoff', {
      p_project_id: projectId,
      p_job_id: jobId,
      p_lease_seconds: 120,
    })
  })

  it('fails closed when a claimed receipt omits its lease token', async () => {
    mockRpc.mockResolvedValue({
      data: { outcome: 'claimed', job: jobRow({ state: 'running', attempt_count: 1 }) },
      error: null,
    })

    await expect(claimPlanningHandoff({ projectId, jobId })).resolves.toEqual({
      success: false,
      error: 'Claimed handoff did not return a lease token',
    })
  })

  it('validates and commits a complete Work Plan receipt against the exact source', async () => {
    mockRpc.mockImplementation((_name, args) => {
      const version = completedVersionRow()
      return Promise.resolve({
        data: {
          job: jobRow({
            state: 'complete',
            attempt_count: 1,
            completed_version_id: completedVersionId,
          }),
          version: {
            ...version,
            content_hash: args.p_content_hash,
            request_hash: args.p_version_request_hash,
          },
        },
        error: null,
      })
    })

    const result = await completePlanningHandoff({
      projectId,
      jobId,
      claimToken,
      targetKind: 'work_plan',
      content: workPlan,
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.content).toEqual(workPlan)
    expect(mockRpc).toHaveBeenCalledWith(
      'complete_planning_handoff',
      expect.objectContaining({
        p_project_id: projectId,
        p_job_id: jobId,
        p_claim_token: claimToken,
        p_content: workPlan,
        p_content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_version_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    )
  })

  it('never calls completion for invalid generated output', async () => {
    const invalidPlan = { ...workPlan, phases: [] }

    const result = await completePlanningHandoff({
      projectId,
      jobId,
      claimToken,
      targetKind: 'work_plan',
      content: invalidPlan,
    })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('Too small'),
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('records a bounded safe failure against the active claim', async () => {
    mockRpc.mockResolvedValue({
      data: jobRow({ state: 'failed', attempt_count: 1, error_code: 'invalid_model_output' }),
      error: null,
    })

    const result = await failPlanningHandoff({
      projectId,
      jobId,
      claimToken,
      errorCode: 'invalid_model_output',
    })

    expect(result.success).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('fail_planning_handoff', {
      p_project_id: projectId,
      p_job_id: jobId,
      p_claim_token: claimToken,
      p_error_code: 'invalid_model_output',
    })
  })

  it('rejects malformed identities and lease bounds before database access', async () => {
    await expect(
      beginPlanningHandoff({
        projectId: 'not-a-project',
        sourceVersionId,
        targetKind: 'work_plan',
        requestKey,
      }),
    ).resolves.toEqual({ success: false, error: 'Invalid planning handoff request' })
    await expect(claimPlanningHandoff({ projectId, jobId, leaseSeconds: 601 })).resolves.toEqual({
      success: false,
      error: 'Invalid planning handoff lease',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
