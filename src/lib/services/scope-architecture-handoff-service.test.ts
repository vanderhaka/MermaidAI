// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  beginScopeArchitectureHandoff,
  claimScopeArchitectureHandoff,
  completeScopeArchitectureHandoff,
  failScopeArchitectureHandoff,
  getResumableScopeArchitectureHandoff,
} from '@/lib/services/scope-architecture-handoff-service'

const projectId = '11111111-1111-4111-8111-111111111111'
const requestKey = '22222222-2222-4222-8222-222222222222'
const jobId = '33333333-3333-4333-8333-333333333333'
const claimToken = '44444444-4444-4444-8444-444444444444'
const changeSetId = '55555555-5555-4555-8555-555555555555'
const moduleId = '66666666-6666-4666-8666-666666666666'
const operationId = '77777777-7777-4777-8777-777777777777'
const versionId = '88888888-8888-4888-8888-888888888888'
const artifactId = '99999999-9999-4999-8999-999999999999'

const snapshot = {
  project: { name: 'Salon', description: 'Capture bookings.' },
  modules: [
    {
      id: moduleId,
      name: 'Scope',
      description: null,
      domain: null,
      prdContent: 'Customers book a salon appointment.',
      entryPoints: [],
      exitPoints: [],
    },
  ],
  nodes: [],
  edges: [],
  connections: [],
  openQuestions: [],
  messages: [],
}

const architectureContent = {
  objective: 'Let customers book salon appointments.',
  outcomes: ['A customer receives a confirmed appointment.'],
  actors: ['Customer'],
  capabilities: [
    {
      id: moduleId,
      name: 'Booking',
      purpose: 'Own appointment requests.',
      responsibilities: ['Confirm an available appointment.'],
      boundaries: ['Does not collect payment.'],
    },
  ],
  connections: [],
  important_flows: [
    {
      id: 'customer-books',
      actor: 'Customer',
      outcome: 'A confirmed appointment.',
      capability_ids: [moduleId],
    },
  ],
  assumptions: [],
  blockers: [],
}

const command = {
  projectId,
  changeSetId,
  turnId: requestKey,
  expectedRevision: 0,
  operations: [
    {
      type: 'module.create' as const,
      operationId,
      module: {
        id: moduleId,
        name: 'Booking',
        description: 'Own appointment requests.',
        domain: null,
        position: { x: 0, y: 0 },
        color: '#111827',
        entryPoints: [],
        exitPoints: [],
      },
    },
  ],
  architectureContent,
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: jobId,
    project_id: projectId,
    request_key: requestKey,
    request_hash: 'source-hash',
    source_hash: 'source-hash',
    source_snapshot: snapshot,
    state: 'pending',
    attempt_count: 0,
    claimed_at: null,
    claim_expires_at: null,
    claim_token: null,
    change_set_id: changeSetId,
    completed_version_id: null,
    error_code: null,
    created_at: '2026-09-02T04:15:00.000Z',
    updated_at: '2026-09-02T04:15:00.000Z',
    ...overrides,
  }
}

const receipt = {
  changeSetId,
  projectId,
  expectedRevision: 0,
  committedRevision: 1,
  semantic: true,
  previousArchitectureVersionId: null,
  architectureVersionId: versionId,
  operations: [
    {
      operationId,
      sequence: 0,
      type: 'module.create',
      semantic: true,
      before: { modules: [] },
      after: { modules: [{ id: moduleId }] },
    },
  ],
  summary: { created: { modules: 1 } },
  planningInputLinksBefore: {
    decisions: [{ id: operationId, artifactVersionId: null }],
    questions: [],
  },
  replayed: false,
}

function version(contentHash: string) {
  return {
    id: versionId,
    artifact_id: artifactId,
    project_id: projectId,
    version: 1,
    content_state: 'complete',
    content: architectureContent,
    content_hash: contentHash,
    request_key: requestKey,
    request_hash: 'command-hash',
    readiness_report: null,
    rendered_markdown: null,
    provenance: {},
    source_version_id: null,
    secondary_source_version_id: null,
    created_at: '2026-09-02T04:16:00.000Z',
  }
}

const mockRpc = vi.fn()
const mockMaybeSingle = vi.fn()
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  in: vi.fn(() => query),
  order: vi.fn(() => query),
  limit: vi.fn(() => query),
  maybeSingle: mockMaybeSingle,
}
const mockFrom = vi.fn(() => query)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ rpc: mockRpc, from: mockFrom })),
}))

describe('Quick Capture Architecture handoff service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('begins and claims a durable source snapshot job', async () => {
    mockRpc.mockResolvedValueOnce({ data: { job: job() }, error: null }).mockResolvedValueOnce({
      data: {
        outcome: 'claimed',
        job: job({
          state: 'running',
          attempt_count: 1,
          claim_token: claimToken,
          claimed_at: '2026-09-02T04:15:01.000Z',
          claim_expires_at: '2026-09-02T04:17:01.000Z',
        }),
      },
      error: null,
    })

    await expect(beginScopeArchitectureHandoff({ projectId, requestKey })).resolves.toEqual({
      success: true,
      data: job(),
    })
    const claim = await claimScopeArchitectureHandoff({ projectId, jobId })
    expect(claim.success && claim.data.outcome).toBe('claimed')
    expect(claim.success && claim.data.job.claim_token).toBe(claimToken)
  })

  it('finds an unfinished job so a page reload can resume it', async () => {
    mockMaybeSingle.mockResolvedValue({ data: job({ state: 'running' }), error: null })

    await expect(getResumableScopeArchitectureHandoff(projectId)).resolves.toEqual({
      success: true,
      data: job({ state: 'running' }),
    })
    expect(mockFrom).toHaveBeenCalledWith('scope_architecture_handoff_jobs')
    expect(query.in).toHaveBeenCalledWith('state', ['pending', 'running'])
  })

  it('commits and verifies the exact command, immutable version, and receipt', async () => {
    mockRpc.mockImplementation((_name, args) =>
      Promise.resolve({
        data: {
          job: job({ state: 'complete', completed_version_id: versionId }),
          version: version(args.p_architecture_content_hash),
          receipt,
        },
        error: null,
      }),
    )

    const result = await completeScopeArchitectureHandoff({
      projectId,
      jobId,
      claimToken,
      command,
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.version.id).toBe(versionId)
    expect(mockRpc).toHaveBeenCalledWith(
      'complete_scope_architecture_handoff',
      expect.objectContaining({
        p_project_id: projectId,
        p_job_id: jobId,
        p_claim_token: claimToken,
        p_operations: command.operations,
        p_architecture_content: architectureContent,
        p_architecture_content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        p_command_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    )
  })

  it('fails closed before database access for an invalid command', async () => {
    const result = await completeScopeArchitectureHandoff({
      projectId,
      jobId,
      claimToken,
      command: { ...command, expectedRevision: -1 },
    })

    expect(result).toEqual({ success: false, error: 'Invalid Quick Capture Architecture command.' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('marks the active lease failed without discarding the source snapshot', async () => {
    mockRpc.mockResolvedValue({
      data: job({ state: 'failed', error_code: 'generation_failed' }),
      error: null,
    })

    const result = await failScopeArchitectureHandoff({
      projectId,
      jobId,
      claimToken,
      errorCode: 'generation_failed',
    })

    expect(result.success && result.data.source_snapshot).toEqual(snapshot)
  })
})
