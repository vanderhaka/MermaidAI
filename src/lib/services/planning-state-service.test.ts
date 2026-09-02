// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  getOrInitializePlanningState,
  getPlanningState,
  setPlanningAutoDecide,
} from '@/lib/services/planning-state-service'

const mockRpc = vi.fn()
const mockMaybeSingle = vi.fn()
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom, rpc: mockRpc })),
}))

const stateRow = {
  project_id: '11111111-1111-4111-8111-111111111111',
  stage: 'architecture',
  readiness_state: 'draft',
  auto_decide_enabled: true,
  staged_workflow_enabled: true,
  write_safety_revision: 0,
  active_architecture_artifact_id: '22222222-2222-4222-8222-222222222222',
  active_work_plan_artifact_id: null,
  active_execution_handoff_artifact_id: null,
  architecture_viewport: { x: 0, y: 0, zoom: 1 },
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

describe('planning state service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lazy-initializes an Architecture planning state through the idempotent RPC', async () => {
    mockRpc.mockResolvedValue({ data: stateRow, error: null })

    const result = await getOrInitializePlanningState(stateRow.project_id)

    expect(result).toEqual({ success: true, data: stateRow })
    expect(mockRpc).toHaveBeenCalledWith('initialize_architecture_planning_state', {
      p_project_id: stateRow.project_id,
    })
  })

  it('returns an existing state without initializing it', async () => {
    mockMaybeSingle.mockResolvedValue({ data: stateRow, error: null })

    const result = await getPlanningState(stateRow.project_id)

    expect(result).toEqual({ success: true, data: stateRow })
    expect(mockFrom).toHaveBeenCalledWith('planning_states')
    expect(mockEq).toHaveBeenCalledWith('project_id', stateRow.project_id)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns null when the project has not been initialized', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(getPlanningState(stateRow.project_id)).resolves.toEqual({
      success: true,
      data: null,
    })
  })

  it('refuses invalid database state instead of casting it into the domain', async () => {
    mockRpc.mockResolvedValue({
      data: { ...stateRow, readiness_state: 'looks-ready' },
      error: null,
    })

    const result = await getOrInitializePlanningState(stateRow.project_id)

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('Invalid planning state'),
    })
  })

  it('rejects malformed project IDs before reaching the database', async () => {
    await expect(getOrInitializePlanningState('not-a-project-id')).resolves.toEqual({
      success: false,
      error: 'Invalid project ID',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('persists Auto-Decide through the revision-protected planning-state RPC', async () => {
    const updated = {
      ...stateRow,
      auto_decide_enabled: false,
      write_safety_revision: 1,
    }
    mockRpc.mockResolvedValue({ data: updated, error: null })

    await expect(
      setPlanningAutoDecide({
        projectId: stateRow.project_id,
        enabled: false,
        expectedRevision: 0,
      }),
    ).resolves.toEqual({ success: true, data: updated })
    expect(mockRpc).toHaveBeenCalledWith('set_planning_auto_decide', {
      p_project_id: stateRow.project_id,
      p_enabled: false,
      p_expected_revision: 0,
    })
  })

  it('rejects an invalid Auto-Decide revision before reaching the database', async () => {
    await expect(
      setPlanningAutoDecide({
        projectId: stateRow.project_id,
        enabled: false,
        expectedRevision: -1,
      }),
    ).resolves.toEqual({ success: false, error: 'Invalid planning revision' })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
