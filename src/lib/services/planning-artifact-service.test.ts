// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createPlanningArtifactVersion,
  decodePlanningArtifactVersion,
  derivePlanningArtifactStaleness,
  getPlanningContentHash,
} from '@/lib/services/planning-artifact-service'

const projectId = '11111111-1111-4111-8111-111111111111'
const artifactId = '22222222-2222-4222-8222-222222222222'
const versionId = '33333333-3333-4333-8333-333333333333'
const requestKey = '44444444-4444-4444-8444-444444444444'

const architectureContent = {
  objective: 'Let customers book appointments.',
  outcomes: ['Customers can confirm a booking.'],
  actors: ['Customer'],
  capabilities: [
    {
      id: 'booking',
      name: 'Booking',
      purpose: 'Capture an appointment request.',
      responsibilities: ['Collect appointment details'],
      boundaries: ['Does not charge a payment'],
    },
  ],
  connections: [],
  important_flows: [
    {
      id: 'customer-books',
      actor: 'Customer',
      outcome: 'A confirmed appointment.',
      capability_ids: ['booking'],
    },
  ],
  assumptions: [],
  blockers: [],
}

const artifactRow = {
  id: artifactId,
  project_id: projectId,
  kind: 'architecture',
  active_version_id: versionId,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

const versionRow = {
  id: versionId,
  artifact_id: artifactId,
  project_id: projectId,
  version: 2,
  content_state: 'complete',
  content: architectureContent,
  content_hash: 'content-hash',
  request_key: requestKey,
  request_hash: 'request-hash',
  readiness_report: null,
  rendered_markdown: null,
  provenance: {},
  source_version_id: null,
  secondary_source_version_id: null,
  created_at: '2026-09-01T00:00:00.000Z',
}

const mockArtifactSingle = vi.fn()
const mockArtifactSelect = vi.fn(() => ({ single: mockArtifactSingle }))
const mockArtifactUpsert = vi.fn(() => ({ select: mockArtifactSelect }))
const mockFrom = vi.fn(() => ({ upsert: mockArtifactUpsert }))
const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom, rpc: mockRpc })),
}))

describe('planning artifact service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hashes semantically identical normalized content consistently', () => {
    const reorderedAndPadded = {
      blockers: [],
      assumptions: [],
      important_flows: architectureContent.important_flows,
      connections: [],
      capabilities: architectureContent.capabilities,
      actors: ['  Customer  '],
      outcomes: architectureContent.outcomes,
      objective: '  Let customers book appointments.  ',
    }

    expect(getPlanningContentHash('architecture', reorderedAndPadded)).toBe(
      getPlanningContentHash('architecture', architectureContent),
    )
  })

  it('does not collapse an intentional new version merely because content is identical', async () => {
    mockArtifactSingle.mockResolvedValue({ data: artifactRow, error: null })
    mockRpc
      .mockImplementationOnce((_name, args) =>
        Promise.resolve({
          data: {
            ...versionRow,
            content_hash: args.p_content_hash,
            request_key: args.p_request_key,
            request_hash: args.p_request_hash,
          },
          error: null,
        }),
      )
      .mockImplementationOnce((_name, args) =>
        Promise.resolve({
          data: {
            ...versionRow,
            id: '55555555-5555-4555-8555-555555555555',
            version: 3,
            content_hash: args.p_content_hash,
            request_key: args.p_request_key,
            request_hash: args.p_request_hash,
          },
          error: null,
        }),
      )

    const first = await createPlanningArtifactVersion({
      projectId,
      artifactKind: 'architecture',
      requestKey,
      content: architectureContent,
    })
    const second = await createPlanningArtifactVersion({
      projectId,
      artifactKind: 'architecture',
      requestKey: '66666666-6666-4666-8666-666666666666',
      content: architectureContent,
    })

    expect(first.success && first.data.version).toBe(2)
    expect(second.success && second.data.version).toBe(3)
    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(mockRpc.mock.calls[0][1].p_content_hash).toBe(mockRpc.mock.calls[1][1].p_content_hash)
    expect(mockRpc.mock.calls[0][1].p_request_key).not.toBe(mockRpc.mock.calls[1][1].p_request_key)
  })

  it('sends a stable request identity to the race-safe allocation RPC', async () => {
    mockArtifactSingle.mockResolvedValue({ data: artifactRow, error: null })
    mockRpc.mockImplementation((_name, args) =>
      Promise.resolve({
        data: {
          ...versionRow,
          content_hash: args.p_content_hash,
          request_key: args.p_request_key,
          request_hash: args.p_request_hash,
        },
        error: null,
      }),
    )

    const result = await createPlanningArtifactVersion({
      projectId,
      artifactKind: 'architecture',
      requestKey,
      content: architectureContent,
    })

    expect(result.success).toBe(true)
    expect(mockArtifactUpsert).toHaveBeenCalledWith(
      { project_id: projectId, kind: 'architecture' },
      { onConflict: 'project_id,kind' },
    )
    expect(mockRpc).toHaveBeenCalledWith(
      'allocate_planning_artifact_version',
      expect.objectContaining({
        p_artifact_id: artifactId,
        p_request_key: requestKey,
        p_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_source_version_id: null,
        p_secondary_source_version_id: null,
      }),
    )
  })

  it('keeps draft marker content unparsed and rejects invalid complete content', () => {
    expect(
      decodePlanningArtifactVersion('architecture', {
        ...versionRow,
        version: 1,
        content_state: 'draft',
        content: {},
        request_key: null,
        request_hash: null,
      }),
    ).toEqual(expect.objectContaining({ content_state: 'draft', content: null }))

    expect(() =>
      decodePlanningArtifactVersion('architecture', { ...versionRow, content: {} }),
    ).toThrow(/Invalid complete architecture content/)
  })

  it('derives Work Plan staleness only from its exact Architecture source version', () => {
    expect(
      derivePlanningArtifactStaleness(
        'work_plan',
        { sourceVersionId: 'architecture-v1', secondarySourceVersionId: null },
        {
          activeArchitectureVersionId: 'architecture-v1',
          activeWorkPlanVersionId: null,
        },
      ),
    ).toEqual({ isStale: false, reasons: [] })

    expect(
      derivePlanningArtifactStaleness(
        'work_plan',
        { sourceVersionId: 'architecture-v1', secondarySourceVersionId: null },
        {
          activeArchitectureVersionId: 'architecture-v2',
          activeWorkPlanVersionId: null,
        },
      ),
    ).toEqual({ isStale: true, reasons: ['architecture_source_changed'] })
  })

  it('marks a Handoff stale when either exact source changes', () => {
    expect(
      derivePlanningArtifactStaleness(
        'execution_handoff',
        {
          sourceVersionId: 'work-plan-v1',
          secondarySourceVersionId: 'architecture-v1',
        },
        {
          activeArchitectureVersionId: 'architecture-v2',
          activeWorkPlanVersionId: 'work-plan-v2',
        },
      ),
    ).toEqual({
      isStale: true,
      reasons: ['work_plan_source_changed', 'architecture_source_changed'],
    })
  })
})
