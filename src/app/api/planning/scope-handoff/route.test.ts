// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getUserWithDevAuth: vi.fn(),
  rateLimitCheck: vi.fn(),
  getProjectById: vi.fn(),
  getPlanningArtifactVersion: vi.fn(),
  begin: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  resumable: vi.fn(),
  generate: vi.fn(),
  buildCommand: vi.fn(),
}))

vi.mock('@/lib/auth/dev-auth', () => ({ getUserWithDevAuth: mocks.getUserWithDevAuth }))
vi.mock('@/lib/rate-limiter', () => ({
  chatRateLimiter: { check: mocks.rateLimitCheck },
}))
vi.mock('@/lib/services/project-service', () => ({ getProjectById: mocks.getProjectById }))
vi.mock('@/lib/services/planning-artifact-service', () => ({
  getPlanningArtifactVersion: mocks.getPlanningArtifactVersion,
}))
vi.mock('@/lib/services/scope-architecture-handoff-service', () => ({
  beginScopeArchitectureHandoff: mocks.begin,
  claimScopeArchitectureHandoff: mocks.claim,
  completeScopeArchitectureHandoff: mocks.complete,
  failScopeArchitectureHandoff: mocks.fail,
  getResumableScopeArchitectureHandoff: mocks.resumable,
}))
vi.mock('@/lib/services/scope-architecture-generator', () => ({
  generateArchitectureFromScope: mocks.generate,
}))
vi.mock('@/lib/services/architecture-service', () => ({
  buildInitialArchitectureCommand: mocks.buildCommand,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => Promise.resolve({})) }))

import { GET, POST } from '@/app/api/planning/scope-handoff/route'

const userId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const requestKey = '33333333-3333-4333-8333-333333333333'
const jobId = '44444444-4444-4444-8444-444444444444'
const claimToken = '55555555-5555-4555-8555-555555555555'
const changeSetId = '66666666-6666-4666-8666-666666666666'
const versionId = '77777777-7777-4777-8777-777777777777'

const snapshot = {
  project: { name: 'Salon', description: null },
  modules: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      name: 'Scope',
      description: null,
      domain: null,
      prdContent: 'Customers book appointments.',
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
const capture = { objective: 'Book appointments.' }
const command = {
  projectId,
  changeSetId,
  turnId: requestKey,
  expectedRevision: 0,
  operations: [{ type: 'module.create' }],
  architectureContent: { objective: 'Book appointments.' },
}
const artifact = {
  id: versionId,
  artifact_kind: 'architecture',
  content_state: 'complete',
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

function postRequest() {
  return new Request('http://localhost/api/planning/scope-handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, requestKey }),
  })
}

describe('Quick Capture Architecture handoff API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserWithDevAuth.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    })
    mocks.getProjectById.mockResolvedValue({
      success: true,
      data: { id: projectId, user_id: userId, mode: 'scope', name: 'Salon' },
    })
    mocks.rateLimitCheck.mockReturnValue({ allowed: true })
    mocks.begin.mockResolvedValue({ success: true, data: job() })
    mocks.claim.mockResolvedValue({
      success: true,
      data: {
        outcome: 'claimed',
        job: job({ state: 'running', claim_token: claimToken, attempt_count: 1 }),
      },
    })
    mocks.generate.mockResolvedValue({ success: true, data: capture })
    mocks.buildCommand.mockReturnValue({ success: true, data: command })
    mocks.complete.mockResolvedValue({
      success: true,
      data: { job: job({ state: 'complete' }), version: artifact, receipt: {} },
    })
    mocks.fail.mockResolvedValue({ success: true, data: job({ state: 'failed' }) })
    mocks.resumable.mockResolvedValue({ success: true, data: null })
  })

  it('freezes, generates, and atomically completes one Architecture', async () => {
    const response = await POST(postRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      state: 'complete',
      jobId,
      artifact,
    })
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ projectId, snapshot }))
    expect(mocks.buildCommand).toHaveBeenCalledWith({
      projectId,
      changeSetId,
      turnId: requestKey,
      expectedRevision: 0,
      capture,
    })
    expect(mocks.complete).toHaveBeenCalledWith({
      projectId,
      jobId,
      claimToken,
      command,
    })
  })

  it('returns quickly when another request owns the active lease', async () => {
    mocks.claim.mockResolvedValue({
      success: true,
      data: { outcome: 'busy', job: job({ state: 'running', attempt_count: 1 }) },
    })

    const response = await POST(postRequest())

    expect(response.status).toBe(202)
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('keeps the source recoverable when generation fails', async () => {
    mocks.generate.mockResolvedValue({
      success: false,
      error: 'Provider unavailable.',
      code: 'generation_failed',
    })

    const response = await POST(postRequest())

    expect(response.status).toBe(502)
    expect(mocks.fail).toHaveBeenCalledWith({
      projectId,
      jobId,
      claimToken,
      errorCode: 'generation_failed',
    })
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('rejects a source changed during generation as a safe conflict', async () => {
    mocks.complete.mockResolvedValue({
      success: false,
      error: 'Quick Capture changed while the Architecture was being prepared',
    })

    const response = await POST(postRequest())

    expect(response.status).toBe(409)
    expect(mocks.fail).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'commit_failed' }))
  })

  it('reports an unfinished request key so a reload can rejoin it', async () => {
    mocks.resumable.mockResolvedValue({ success: true, data: job({ state: 'running' }) })
    const response = await GET(
      new Request(`http://localhost/api/planning/scope-handoff?projectId=${projectId}`),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      state: 'running',
      requestKey,
      jobId,
    })
  })

  it('replays a completed request without another model call', async () => {
    mocks.getProjectById.mockResolvedValue({
      success: true,
      data: { id: projectId, user_id: userId, mode: 'architecture', name: 'Salon' },
    })
    mocks.claim.mockResolvedValue({
      success: true,
      data: {
        outcome: 'complete',
        job: job({ state: 'complete', completed_version_id: versionId }),
      },
    })
    mocks.getPlanningArtifactVersion.mockResolvedValue({ success: true, data: artifact })

    const response = await POST(postRequest())

    expect(response.status).toBe(200)
    expect(mocks.generate).not.toHaveBeenCalled()
  })
})
