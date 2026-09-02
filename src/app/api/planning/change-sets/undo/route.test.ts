// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUserWithDevAuth: vi.fn(),
  getProjectById: vi.fn(),
  undoArchitecture: vi.fn(),
  undoWorkPlan: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/auth/dev-auth', () => ({ getUserWithDevAuth: mocks.getUserWithDevAuth }))
vi.mock('@/lib/services/project-service', () => ({ getProjectById: mocks.getProjectById }))
vi.mock('@/lib/services/change-set-service', () => ({
  undoLatestArchitectureChangeSet: mocks.undoArchitecture,
  undoLatestWorkPlanChangeSet: mocks.undoWorkPlan,
}))

import { POST } from '@/app/api/planning/change-sets/undo/route'

const projectId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
const targetChangeSetId = '33333333-3333-4333-8333-333333333333'
const undoChangeSetId = '44444444-4444-4444-8444-444444444444'

function request(stage: 'architecture' | 'work_plan', body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/planning/change-sets/undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, stage, targetChangeSetId, undoChangeSetId, ...body }),
  })
}

describe('planning change-set undo route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({ auth: {} })
    mocks.getUserWithDevAuth.mockResolvedValue({
      data: { user: { id: ownerId } },
      error: null,
      usedDevAuth: false,
    })
    mocks.getProjectById.mockResolvedValue({
      success: true,
      data: { id: projectId, user_id: ownerId, mode: 'architecture' },
    })
  })

  it('routes Architecture undo through the latest-safe service', async () => {
    const receipt = {
      changeSetId: undoChangeSetId,
      targetChangeSetId,
      projectId,
      expectedRevision: 4,
      committedRevision: 5,
      restoredArchitectureVersionId: null,
      restoredOperations: 1,
      replayed: false,
    }
    mocks.undoArchitecture.mockResolvedValue({ success: true, data: receipt })

    const response = await POST(request('architecture'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ state: 'complete', receipt })
    expect(mocks.undoArchitecture).toHaveBeenCalledWith({
      projectId,
      targetChangeSetId,
      undoChangeSetId,
    })
    expect(mocks.undoWorkPlan).not.toHaveBeenCalled()
  })

  it('returns the restored Work Plan and persisted assistant receipt immediately', async () => {
    const data = {
      version: { id: 'version-v3', version: 3 },
      assistantMessage: { id: 'assistant-undo', content: 'Restored Work Plan v3.' },
      receipt: { kind: 'work_plan_undo', changeSetId: undoChangeSetId },
    }
    mocks.undoWorkPlan.mockResolvedValue({ success: true, data })

    const response = await POST(request('work_plan'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      state: 'complete',
      artifact: data.version,
      assistantMessage: data.assistantMessage,
      receipt: data.receipt,
    })
    expect(mocks.undoWorkPlan).toHaveBeenCalledWith({
      projectId,
      targetChangeSetId,
      undoChangeSetId,
    })
  })

  it('explains a newer-edit refusal as a conflict', async () => {
    mocks.undoWorkPlan.mockResolvedValue({
      success: false,
      error: 'Work Plan change set is no longer the current tip',
    })

    const response = await POST(request('work_plan'))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      state: 'failed',
      error: 'Work Plan change set is no longer the current tip',
    })
  })

  it('does not reveal another user project or reach an undo service', async () => {
    mocks.getProjectById.mockResolvedValue({
      success: true,
      data: {
        id: projectId,
        user_id: '99999999-9999-4999-8999-999999999999',
        mode: 'architecture',
      },
    })

    const response = await POST(request('work_plan'))

    expect(response.status).toBe(403)
    expect(mocks.undoWorkPlan).not.toHaveBeenCalled()
  })
})
