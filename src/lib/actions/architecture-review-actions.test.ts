// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUserWithDevAuth: vi.fn(),
  getProjectById: vi.fn(),
  getPlanningState: vi.fn(),
  setPlanningAutoDecide: vi.fn(),
  getActivePlanningArtifactVersion: vi.fn(),
  listPlanningDecisions: vi.fn(),
  transitionPlanningDecision: vi.fn(),
  supersedePlanningDecision: vi.fn(),
  applyArchitectureCommand: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/auth/dev-auth', () => ({ getUserWithDevAuth: mocks.getUserWithDevAuth }))
vi.mock('@/lib/services/project-service', () => ({ getProjectById: mocks.getProjectById }))
vi.mock('@/lib/services/planning-state-service', () => ({
  getPlanningState: mocks.getPlanningState,
  setPlanningAutoDecide: mocks.setPlanningAutoDecide,
}))
vi.mock('@/lib/services/planning-artifact-service', () => ({
  getActivePlanningArtifactVersion: mocks.getActivePlanningArtifactVersion,
}))
vi.mock('@/lib/services/planning-decision-service', () => ({
  listPlanningDecisions: mocks.listPlanningDecisions,
  transitionPlanningDecision: mocks.transitionPlanningDecision,
  supersedePlanningDecision: mocks.supersedePlanningDecision,
}))
vi.mock('@/lib/services/planning-command-service', () => ({
  applyArchitectureCommand: mocks.applyArchitectureCommand,
}))

import {
  commitManualArchitectureModule,
  commitPlanningAutoDecidePreference,
  commitPlanningDecisionAction,
} from '@/lib/actions/architecture-review-actions'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const OWNER_ID = '22222222-2222-4222-8222-222222222222'
const ARTIFACT_ID = '33333333-3333-4333-8333-333333333333'
const VERSION_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const DECISION_ID = '66666666-6666-4666-8666-666666666666'
const CAPABILITY_ID = '77777777-7777-4777-8777-777777777777'

const architectureContent = {
  objective: 'Let customers manage appointments.',
  outcomes: ['Customers receive a confirmed appointment.'],
  actors: ['Customer'],
  capabilities: [
    {
      id: CAPABILITY_ID,
      name: 'Booking',
      purpose: 'Own appointment confirmation.',
      responsibilities: ['Confirm an available time'],
      boundaries: ['Does not process payment'],
    },
  ],
  connections: [],
  important_flows: [
    {
      id: 'customer-books',
      actor: 'Customer',
      outcome: 'Customers receive a confirmed appointment.',
      capability_ids: [CAPABILITY_ID],
    },
  ],
  assumptions: [],
  blockers: [],
}

const activeVersion = {
  id: VERSION_ID,
  artifact_id: ARTIFACT_ID,
  project_id: PROJECT_ID,
  artifact_kind: 'architecture' as const,
  version: 3,
  content_state: 'complete' as const,
  content: architectureContent,
  content_hash: 'hash-v3',
  request_key: REQUEST_ID,
  request_hash: 'request-hash',
  readiness_report: null,
  rendered_markdown: null,
  provenance: {},
  source_version_id: null,
  secondary_source_version_id: null,
  created_at: '2026-09-02T00:00:00.000Z',
}

const receipt = {
  changeSetId: REQUEST_ID,
  projectId: PROJECT_ID,
  expectedRevision: 9,
  committedRevision: 10,
  semantic: true,
  previousArchitectureVersionId: VERSION_ID,
  architectureVersionId: '88888888-8888-4888-8888-888888888888',
  operations: [],
  summary: {},
  replayed: false,
}

const proposedDecision = {
  id: DECISION_ID,
  project_id: PROJECT_ID,
  artifact_version_id: VERSION_ID,
  category: 'provider policy',
  statement: 'The provider supports partial refunds.',
  state: 'proposed' as const,
  provenance: 'assistant' as const,
  readiness_impact: 'non_blocking' as const,
  supersedes_decision_id: null,
  created_at: '2026-09-02T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
  events: [],
  latest_event: null,
}

function decisionInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: PROJECT_ID,
    architectureVersionId: VERSION_ID,
    expectedRevision: 9,
    requestId: REQUEST_ID,
    action: 'accept',
    decisionId: DECISION_ID,
    reason: 'Confirmed during Architecture review.',
    ...overrides,
  }
}

describe('architecture review actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockResolvedValue({ auth: {} })
    mocks.getUserWithDevAuth.mockResolvedValue({
      data: { user: { id: OWNER_ID } },
      error: null,
      usedDevAuth: false,
    })
    mocks.getProjectById.mockResolvedValue({
      success: true,
      data: {
        id: PROJECT_ID,
        user_id: OWNER_ID,
        name: 'Bookings',
        description: null,
        mode: 'architecture',
      },
    })
    mocks.getPlanningState.mockResolvedValue({
      success: true,
      data: {
        project_id: PROJECT_ID,
        stage: 'architecture',
        readiness_state: 'ready_with_assumptions',
        auto_decide_enabled: true,
        write_safety_revision: 9,
        active_architecture_artifact_id: ARTIFACT_ID,
      },
    })
    mocks.getActivePlanningArtifactVersion.mockResolvedValue({
      success: true,
      data: activeVersion,
    })
    mocks.listPlanningDecisions.mockResolvedValue({
      success: true,
      data: [proposedDecision],
    })
    mocks.transitionPlanningDecision.mockResolvedValue({ success: true, data: receipt })
    mocks.supersedePlanningDecision.mockResolvedValue({ success: true, data: receipt })
    mocks.applyArchitectureCommand.mockResolvedValue({ success: true, data: receipt })
    mocks.setPlanningAutoDecide.mockResolvedValue({
      success: true,
      data: {
        project_id: PROJECT_ID,
        stage: 'architecture',
        readiness_state: 'ready_with_assumptions',
        auto_decide_enabled: false,
        write_safety_revision: 10,
        active_architecture_artifact_id: ARTIFACT_ID,
        active_work_plan_artifact_id: null,
        active_execution_handoff_artifact_id: null,
        architecture_viewport: { x: 0, y: 0, zoom: 1 },
        created_at: '2026-09-02T00:00:00.000Z',
        updated_at: '2026-09-02T00:00:00.000Z',
      },
    })
  })

  it('rejects unsupported actions before touching authentication or services', async () => {
    await expect(
      commitPlanningDecisionAction(decisionInput({ action: 'delete' })),
    ).resolves.toEqual(
      expect.objectContaining({ success: false, error: expect.stringMatching(/invalid/i) }),
    )
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.transitionPlanningDecision).not.toHaveBeenCalled()
  })

  it('persists Auto-Decide for the owned Architecture and returns the next revision', async () => {
    await expect(
      commitPlanningAutoDecidePreference({
        projectId: PROJECT_ID,
        enabled: false,
        expectedRevision: 9,
      }),
    ).resolves.toEqual({ success: true, enabled: false, expectedRevision: 10 })

    expect(mocks.setPlanningAutoDecide).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      enabled: false,
      expectedRevision: 9,
    })
  })

  it('does not claim an Auto-Decide toggle when the returned revision is inconsistent', async () => {
    mocks.setPlanningAutoDecide.mockResolvedValueOnce({
      success: true,
      data: {
        project_id: PROJECT_ID,
        auto_decide_enabled: false,
        write_safety_revision: 14,
      },
    })

    await expect(
      commitPlanningAutoDecidePreference({
        projectId: PROJECT_ID,
        enabled: false,
        expectedRevision: 9,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ success: false, error: expect.stringMatching(/receipt/i) }),
    )
  })

  it('requires an authenticated project owner', async () => {
    mocks.getUserWithDevAuth.mockResolvedValue({
      data: { user: { id: '99999999-9999-4999-8999-999999999999' } },
      error: null,
      usedDevAuth: false,
    })

    await expect(commitPlanningDecisionAction(decisionInput())).resolves.toEqual({
      success: false,
      error: 'Project access denied.',
      conflict: false,
    })
    expect(mocks.transitionPlanningDecision).not.toHaveBeenCalled()
  })

  it('refuses a stale revision or a different active Architecture version', async () => {
    await expect(
      commitPlanningDecisionAction(decisionInput({ expectedRevision: 8 })),
    ).resolves.toEqual({
      success: false,
      error: 'Architecture changed. Refresh before reviewing this decision.',
      conflict: true,
    })
    expect(mocks.transitionPlanningDecision).not.toHaveBeenCalled()

    mocks.getPlanningState.mockResolvedValueOnce({
      success: true,
      data: {
        project_id: PROJECT_ID,
        stage: 'architecture',
        readiness_state: 'ready_with_assumptions',
        auto_decide_enabled: true,
        write_safety_revision: 9,
        active_architecture_artifact_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    })
    await expect(commitPlanningDecisionAction(decisionInput())).resolves.toEqual(
      expect.objectContaining({ success: false, conflict: true }),
    )
  })

  it('accepts through the finite decision service with exact content, evidence, and retry identity', async () => {
    const result = await commitPlanningDecisionAction(decisionInput())

    expect(result).toEqual({
      success: true,
      receipt: {
        changeSetId: REQUEST_ID,
        committedRevision: 10,
        replayed: false,
      },
    })
    expect(mocks.transitionPlanningDecision).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      changeSetId: REQUEST_ID,
      turnId: null,
      expectedRevision: 9,
      operationIds: [expect.stringMatching(/^[0-9a-f-]{36}$/)],
      architectureContent,
      decision: { id: DECISION_ID, state: 'proposed' },
      targetState: 'accepted',
      actor: { type: 'user', userId: OWNER_ID, label: 'Project owner' },
      reason: 'Confirmed during Architecture review.',
      evidence: [
        {
          type: 'architecture_review',
          reference: `decision:${DECISION_ID}`,
          summary: 'Project owner accepted this decision in Architecture review.',
        },
      ],
    })

    await commitPlanningDecisionAction(decisionInput())
    const firstOperationId = mocks.transitionPlanningDecision.mock.calls[0][0].operationIds[0]
    const retriedOperationId = mocks.transitionPlanningDecision.mock.calls[1][0].operationIds[0]
    expect(retriedOperationId).toBe(firstOperationId)
  })

  it('edits by atomically superseding the current exact-version decision', async () => {
    await commitPlanningDecisionAction(
      decisionInput({
        action: 'edit',
        statement: 'The platform team owns partial refund support.',
      }),
    )

    expect(mocks.supersedePlanningDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSetId: REQUEST_ID,
        operationIds: [
          expect.stringMatching(/^[0-9a-f-]{36}$/),
          expect.stringMatching(/^[0-9a-f-]{36}$/),
        ],
        decision: { id: DECISION_ID, state: 'proposed' },
        replacement: expect.objectContaining({
          statement: 'The platform team owns partial refund support.',
          provenance: 'user',
          readinessImpact: 'non_blocking',
        }),
      }),
    )
  })

  it('does not claim a failed service result committed', async () => {
    mocks.transitionPlanningDecision.mockResolvedValue({
      success: false,
      error: 'Stale planning revision',
    })

    await expect(commitPlanningDecisionAction(decisionInput())).resolves.toEqual({
      success: false,
      error: 'Stale planning revision',
      conflict: true,
    })
  })

  it('adds a manual capability only through the command boundary and returns its receipt', async () => {
    const result = await commitManualArchitectureModule({
      projectId: PROJECT_ID,
      architectureVersionId: VERSION_ID,
      expectedRevision: 9,
      requestId: REQUEST_ID,
      name: 'Module 2',
    })

    expect(result).toEqual({
      success: true,
      receipt: {
        changeSetId: REQUEST_ID,
        committedRevision: 10,
        replayed: false,
      },
    })
    expect(mocks.applyArchitectureCommand).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      changeSetId: REQUEST_ID,
      turnId: null,
      expectedRevision: 9,
      operations: [
        {
          operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          type: 'module.create',
          module: expect.objectContaining({
            id: expect.stringMatching(/^[0-9a-f-]{36}$/),
            name: 'Module 2',
          }),
        },
      ],
      architectureContent: expect.objectContaining({
        capabilities: [
          architectureContent.capabilities[0],
          expect.objectContaining({ name: 'Module 2' }),
        ],
        blockers: [
          expect.objectContaining({
            statement:
              'Define the purpose, responsibilities, boundaries, and connections for Module 2.',
          }),
        ],
      }),
    })
  })

  it('refuses manual add without a complete active Architecture snapshot', async () => {
    mocks.getActivePlanningArtifactVersion.mockResolvedValue({
      success: true,
      data: { ...activeVersion, content_state: 'draft', content: null },
    })

    await expect(
      commitManualArchitectureModule({
        projectId: PROJECT_ID,
        architectureVersionId: VERSION_ID,
        expectedRevision: 9,
        requestId: REQUEST_ID,
        name: 'Module 2',
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Generate the first Architecture map before adding a manual capability.',
      conflict: false,
    })
    expect(mocks.applyArchitectureCommand).not.toHaveBeenCalled()
  })
})
