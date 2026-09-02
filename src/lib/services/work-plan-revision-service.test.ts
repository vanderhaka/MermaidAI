// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ rpc: mockRpc })),
}))

import {
  commitWorkPlanRevision,
  getWorkPlanRevisionRequestHash,
} from '@/lib/services/work-plan-revision-service'

describe('Work Plan revision service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hashes only the stable request fields when committing generated content', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'database sentinel' } })

    const input = {
      projectId: '11111111-1111-4111-8111-111111111111',
      expectedWorkPlanVersionId: '22222222-2222-4222-8222-222222222222',
      sourceArchitectureVersionId: '33333333-3333-4333-8333-333333333333',
      changeSetId: '44444444-4444-4444-8444-444444444444',
      turnId: '55555555-5555-4555-8555-555555555555',
      userMessageKey: '66666666-6666-4666-8666-666666666666',
      assistantMessageKey: '77777777-7777-4777-8777-777777777777',
      message: 'Split approval assignment from decision access.',
      content: {
        source_architecture_version: {
          id: '33333333-3333-4333-8333-333333333333',
          artifact_kind: 'architecture',
          version: 5,
        },
        objective: 'Ship a safe review flow.',
        non_goals: [],
        phases: [
          {
            id: 'approval',
            title: 'Approval',
            objective: 'Assign an approver.',
            slice_ids: ['assign-approver'],
          },
        ],
        slices: [
          {
            id: 'assign-approver',
            title: 'Assign approver',
            actor_or_trigger: 'An administrator selects one approver.',
            observable_outcome: 'The project names one approver.',
            protected_invariant: 'Only one approver is active.',
            dependencies: [],
            source_capability_ids: ['approval'],
            acceptance_criteria: ['One approver is recorded.'],
            verification: [
              { command: 'Confirm in target repository: approver uniqueness is covered.' },
            ],
            likely_targets: { files: [], api: [], data: [] },
            risks: ['Concurrent assignment.'],
            rollback_notes: ['Restore the prior assignment.'],
            assumption_ids: [],
            unresolved_blocker_ids: [],
          },
        ],
        assumptions: [],
        unresolved_blockers: [],
      },
      assistantContent: 'Split approval into one focused slice.',
      summary: 'Split approval into one focused slice.',
      commands: [{ type: 'update_summary', objective: 'Ship a safe review flow.' }],
    }
    const result = await commitWorkPlanRevision(input)

    expect(result).toEqual({ success: false, error: 'database sentinel' })
    expect(getWorkPlanRevisionRequestHash(input)).toBe(
      getWorkPlanRevisionRequestHash({
        projectId: input.projectId,
        expectedWorkPlanVersionId: input.expectedWorkPlanVersionId,
        sourceArchitectureVersionId: input.sourceArchitectureVersionId,
        changeSetId: input.changeSetId,
        turnId: input.turnId,
        userMessageKey: input.userMessageKey,
        assistantMessageKey: input.assistantMessageKey,
        message: input.message,
      }),
    )
    expect(mockRpc).toHaveBeenCalledWith(
      'commit_work_plan_revision',
      expect.objectContaining({
        p_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_request_payload: expect.not.objectContaining({
          content: expect.anything(),
          assistantContent: expect.anything(),
          summary: expect.anything(),
          commands: expect.anything(),
        }),
      }),
    )
  })
})
