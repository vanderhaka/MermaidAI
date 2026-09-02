// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  finalizeChatChangeSet,
  getCommittedChatChangeSetForRetry,
  recoverAbandonedChatChangeSets,
  undoLatestArchitectureChangeSet,
  undoLatestWorkPlanChangeSet,
} from '@/lib/services/change-set-service'

const projectId = '11111111-1111-4111-8111-111111111111'
const targetChangeSetId = '22222222-2222-4222-8222-222222222222'
const undoChangeSetId = '33333333-3333-4333-8333-333333333333'
const restoredArchitectureVersionId = '44444444-4444-4444-8444-444444444444'
const workPlanArtifactId = '55555555-5555-4555-8555-555555555555'
const restoredWorkPlanVersionId = '66666666-6666-4666-8666-666666666666'

const undoReceipt = {
  changeSetId: undoChangeSetId,
  targetChangeSetId,
  projectId,
  expectedRevision: 7,
  committedRevision: 8,
  restoredArchitectureVersionId,
  restoredOperations: 3,
  replayed: false,
}

const restoredWorkPlanVersion = {
  id: restoredWorkPlanVersionId,
  artifact_id: workPlanArtifactId,
  project_id: projectId,
  version: 3,
  content_state: 'complete',
  content: {
    source_architecture_version: {
      id: restoredArchitectureVersionId,
      artifact_kind: 'architecture',
      version: 2,
    },
    objective: 'Ship a safe booking journey.',
    non_goals: [],
    phases: [
      {
        id: 'phase-1',
        title: 'First outcome',
        objective: 'Deliver a booking.',
        slice_ids: ['slice-1'],
      },
    ],
    slices: [
      {
        id: 'slice-1',
        title: 'Book appointment',
        actor_or_trigger: 'Customer',
        observable_outcome: 'Appointment is confirmed.',
        protected_invariant: 'No double booking.',
        dependencies: [],
        source_capability_ids: ['booking'],
        acceptance_criteria: ['One slot is reserved.'],
        verification: [{ command: 'npm test', purpose: 'Prove booking.' }],
        likely_targets: { files: [], api: ['/api/bookings'], data: ['bookings'] },
        risks: ['Concurrent requests.'],
        rollback_notes: ['Disable booking writes.'],
        assumption_ids: [],
        unresolved_blocker_ids: [],
      },
    ],
    assumptions: [],
    unresolved_blockers: [],
  },
  content_hash: 'work-plan-v3-hash',
  request_key: '77777777-7777-4777-8777-777777777777',
  request_hash: 'work-plan-v3-request-hash',
  readiness_report: null,
  rendered_markdown: null,
  provenance: {},
  source_version_id: restoredArchitectureVersionId,
  secondary_source_version_id: null,
  created_at: '2026-09-02T00:00:00.000Z',
}

const workPlanUndoAssistant = {
  id: '88888888-8888-4888-8888-888888888888',
  project_id: projectId,
  role: 'assistant',
  content: 'Restored Work Plan v3. Work Plan v4 is still preserved in history.',
  created_at: '2026-09-02T00:01:00.000Z',
  turn_id: undoChangeSetId,
  message_key: undoChangeSetId,
  planning_stage: 'work_plan',
  artifact_id: workPlanArtifactId,
  artifact_version_id: restoredWorkPlanVersionId,
  change_set_id: undoChangeSetId,
  metadata: { turn_status: 'completed' },
}

const workPlanUndoResult = {
  version: restoredWorkPlanVersion,
  assistant_message: workPlanUndoAssistant,
  receipt: {
    kind: 'work_plan_undo',
    changeSetId: undoChangeSetId,
    targetChangeSetId,
    projectId,
    expectedWorkPlanVersionId: '99999999-9999-4999-8999-999999999999',
    restoredWorkPlanVersionId,
    expectedVersion: 4,
    restoredVersion: 3,
    replayed: false,
  },
}

const mockRpc = vi.fn()
const mockMaybeSingle = vi.fn()
const mockLimit = vi.fn()
const queryBuilder: Record<string, ReturnType<typeof vi.fn>> = {}
queryBuilder.update = vi.fn(() => queryBuilder)
queryBuilder.select = vi.fn(() => queryBuilder)
queryBuilder.eq = vi.fn(() => queryBuilder)
queryBuilder.in = vi.fn(() => queryBuilder)
queryBuilder.not = vi.fn(() => queryBuilder)
queryBuilder.lt = vi.fn(() => queryBuilder)
queryBuilder.limit = mockLimit
queryBuilder.maybeSingle = mockMaybeSingle
const mockFrom = vi.fn(() => queryBuilder)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom, rpc: mockRpc })),
}))

describe('change set service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('undoes one named latest change set through one revision-protected RPC', async () => {
    mockRpc.mockResolvedValue({ data: undoReceipt, error: null })

    const result = await undoLatestArchitectureChangeSet({
      projectId,
      targetChangeSetId,
      undoChangeSetId,
    })

    expect(result).toEqual({ success: true, data: undoReceipt })
    expect(mockRpc).toHaveBeenCalledWith('undo_latest_architecture_change_set', {
      p_project_id: projectId,
      p_target_change_set_id: targetChangeSetId,
      p_undo_change_set_id: undoChangeSetId,
      p_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('returns the latest-tip refusal and never fabricates an undo receipt', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Change set is no longer the current tip' },
    })

    await expect(
      undoLatestArchitectureChangeSet({
        projectId,
        targetChangeSetId,
        undoChangeSetId,
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Change set is no longer the current tip',
    })
  })

  it('restores the immutable previous Work Plan version through one exact RPC', async () => {
    mockRpc.mockResolvedValue({ data: workPlanUndoResult, error: null })

    const result = await undoLatestWorkPlanChangeSet({
      projectId,
      targetChangeSetId,
      undoChangeSetId,
    })

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        version: expect.objectContaining({ id: restoredWorkPlanVersionId, version: 3 }),
        assistantMessage: expect.objectContaining({
          changeSetId: undoChangeSetId,
          artifactVersionId: restoredWorkPlanVersionId,
        }),
        receipt: workPlanUndoResult.receipt,
      }),
    })
    expect(mockRpc).toHaveBeenCalledWith('undo_latest_work_plan_change_set', {
      p_project_id: projectId,
      p_target_change_set_id: targetChangeSetId,
      p_undo_change_set_id: undoChangeSetId,
      p_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('returns the Work Plan latest-tip refusal without changing local state', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Work Plan change set is no longer the current tip' },
    })

    await expect(
      undoLatestWorkPlanChangeSet({ projectId, targetChangeSetId, undoChangeSetId }),
    ).resolves.toEqual({
      success: false,
      error: 'Work Plan change set is no longer the current tip',
    })
  })

  it('validates all IDs before reaching the database', async () => {
    const result = await undoLatestArchitectureChangeSet({
      projectId: 'not-a-project',
      targetChangeSetId,
      undoChangeSetId,
    })

    expect(result.success).toBe(false)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('finalizes only the committed change set owned by the exact project and turn', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: targetChangeSetId,
        project_id: projectId,
        turn_id: undoChangeSetId,
        state: 'completed',
      },
      error: null,
    })

    const result = await finalizeChatChangeSet({
      projectId,
      turnId: undoChangeSetId,
      changeSetId: targetChangeSetId,
      state: 'partial',
    })

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({ id: targetChangeSetId, state: 'completed' }),
    })
    expect(queryBuilder.update).toHaveBeenCalledWith({ state: 'partial' })
    expect(queryBuilder.eq).toHaveBeenCalledWith('id', targetChangeSetId)
    expect(queryBuilder.eq).toHaveBeenCalledWith('project_id', projectId)
    expect(queryBuilder.eq).toHaveBeenCalledWith('turn_id', undoChangeSetId)
    expect(queryBuilder.in).toHaveBeenCalledWith('state', ['completed', 'partial'])
    expect(queryBuilder.not).toHaveBeenCalledWith('committed_at', 'is', null)
  })

  it('finds only the exact committed change set identity for a lost-response Retry', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({
        data: {
          id: targetChangeSetId,
          state: 'partial',
          expected_revision: 7,
          committed_revision: 8,
          committed_architecture_version_id: restoredArchitectureVersionId,
          committed_at: '2026-09-02T00:00:00.000Z',
          receipt: {
            operations: [
              { type: 'module.create' },
              { type: 'module_connection.create' },
              { type: 'decision.create' },
              { type: 'question.create' },
            ],
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null })

    const result = await getCommittedChatChangeSetForRetry({
      projectId,
      turnId: undoChangeSetId,
      changeSetId: targetChangeSetId,
      expectedRevision: 7,
    })

    expect(result).toEqual({
      success: true,
      data: {
        id: targetChangeSetId,
        committedRevision: 8,
        artifactVersionId: restoredArchitectureVersionId,
        changeSummary: {
          created: 3,
          updated: 0,
          deleted: 0,
          assumed: 1,
          resolved: 0,
          capabilitiesCreated: 1,
          connectionsCreated: 1,
          assumptionsRecorded: 1,
          questionsRecorded: 1,
          provisional: true,
        },
        completedAssistant: null,
      },
    })
    expect(queryBuilder.eq).toHaveBeenCalledWith('id', targetChangeSetId)
    expect(queryBuilder.eq).toHaveBeenCalledWith('project_id', projectId)
    expect(queryBuilder.eq).toHaveBeenCalledWith('turn_id', undoChangeSetId)
    expect(queryBuilder.eq).toHaveBeenCalledWith('expected_revision', 7)
  })

  it('returns the already-completed assistant for the exact committed Retry identity', async () => {
    const completedAssistant = {
      content: 'Built the provisional Architecture.',
      artifact_version_id: restoredArchitectureVersionId,
      metadata: { turn_status: 'completed' },
    }
    mockMaybeSingle
      .mockResolvedValueOnce({
        data: {
          id: targetChangeSetId,
          state: 'completed',
          expected_revision: 7,
          committed_revision: 8,
          committed_architecture_version_id: restoredArchitectureVersionId,
          committed_at: '2026-09-02T00:00:00.000Z',
          receipt: { operations: [{ type: 'module.create' }] },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: completedAssistant, error: null })

    const result = await getCommittedChatChangeSetForRetry({
      projectId,
      turnId: undoChangeSetId,
      changeSetId: targetChangeSetId,
      expectedRevision: 7,
    })

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        completedAssistant: {
          content: completedAssistant.content,
          artifactVersionId: restoredArchitectureVersionId,
          metadata: completedAssistant.metadata,
        },
      }),
    })
    expect(queryBuilder.eq).toHaveBeenCalledWith('role', 'assistant')
    expect(queryBuilder.eq).toHaveBeenCalledWith('metadata->>turn_status', 'completed')
  })

  it('recovers an aged committed change set with no finalized assistant linkage as partial', async () => {
    const committedAt = '2026-09-02T00:00:00.000Z'
    mockLimit
      .mockResolvedValueOnce({
        data: [
          {
            id: targetChangeSetId,
            turn_id: undoChangeSetId,
            committed_at: committedAt,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: targetChangeSetId }, error: null })

    const result = await recoverAbandonedChatChangeSets(projectId, {
      now: new Date('2026-09-02T00:10:00.000Z'),
      safeAgeMs: 5 * 60 * 1000,
    })

    expect(result).toEqual({
      success: true,
      data: { recoveredChangeSetIds: [targetChangeSetId] },
    })
    expect(queryBuilder.lt).toHaveBeenCalledWith('committed_at', '2026-09-02T00:05:00.000Z')
    expect(queryBuilder.update).toHaveBeenCalledWith({ state: 'partial' })
    expect(queryBuilder.eq).toHaveBeenCalledWith('committed_at', committedAt)
  })

  it('does not recover a change set whose completed assistant linkage appeared', async () => {
    mockLimit
      .mockResolvedValueOnce({
        data: [
          {
            id: targetChangeSetId,
            turn_id: undoChangeSetId,
            committed_at: '2026-09-02T00:00:00.000Z',
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ id: 'assistant-message' }], error: null })

    const result = await recoverAbandonedChatChangeSets(projectId, {
      now: new Date('2026-09-02T00:10:00.000Z'),
      safeAgeMs: 5 * 60 * 1000,
    })

    expect(result).toEqual({ success: true, data: { recoveredChangeSetIds: [] } })
    expect(queryBuilder.update).not.toHaveBeenCalled()
  })
})
