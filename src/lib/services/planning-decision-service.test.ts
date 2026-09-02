// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { applyArchitectureCommandMock, createClientMock, decisionOrderMock, eventOrderMock } =
  vi.hoisted(() => ({
    applyArchitectureCommandMock: vi.fn(),
    createClientMock: vi.fn(),
    decisionOrderMock: vi.fn(),
    eventOrderMock: vi.fn(),
  }))
vi.mock('@/lib/services/planning-command-service', () => ({
  applyArchitectureCommand: applyArchitectureCommandMock,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

import {
  listPlanningDecisions,
  proposeAutoDecision,
  supersedePlanningDecision,
  transitionPlanningDecision,
} from '@/lib/services/planning-decision-service'

const projectId = '11111111-1111-4111-8111-111111111111'
const changeSetId = '22222222-2222-4222-8222-222222222222'
const turnId = '33333333-3333-4333-8333-333333333333'
const decisionId = '44444444-4444-4444-8444-444444444444'
const replacementId = '55555555-5555-4555-8555-555555555555'
const operationIds = [
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
]
const moduleId = '88888888-8888-4888-8888-888888888888'

const architectureContent = {
  objective: 'Let customers book appointments.',
  outcomes: ['A customer gets a confirmed appointment.'],
  actors: ['Customer'],
  capabilities: [
    {
      id: moduleId,
      name: 'Bookings',
      purpose: 'Own an appointment request through confirmation.',
      responsibilities: ['Reserve an available time'],
      boundaries: ['Does not settle a payment'],
    },
  ],
  connections: [],
  important_flows: [
    {
      id: 'customer-books',
      actor: 'Customer',
      outcome: 'A customer gets a confirmed appointment.',
      capability_ids: [moduleId],
    },
  ],
  assumptions: [],
  blockers: [],
}

const commandIdentity = {
  projectId,
  changeSetId,
  turnId,
  expectedRevision: 5,
  operationIds,
  architectureContent,
}

const evidence = [
  {
    type: 'chat_turn',
    reference: turnId,
    summary: 'The brief did not specify this routine booking policy.',
  },
]

describe('planning decision service', () => {
  beforeEach(() => {
    applyArchitectureCommandMock.mockReset()
    applyArchitectureCommandMock.mockResolvedValue({
      success: true,
      data: { changeSetId, committedRevision: 6 },
    })
    decisionOrderMock.mockResolvedValue({ data: [], error: null })
    eventOrderMock.mockResolvedValue({ data: [], error: null })
    createClientMock.mockResolvedValue({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            order: table === 'planning_decisions' ? decisionOrderMock : eventOrderMock,
          }),
        }),
      }),
    })
  })

  it('records Auto-Decide output as a proposed, visible, evidenced assumption', async () => {
    const result = await proposeAutoDecision({
      ...commandIdentity,
      decision: {
        id: decisionId,
        category: 'Booking policy',
        statement: 'Hold a slot for ten minutes during checkout.',
        readinessImpact: 'non_blocking',
      },
      reason: 'Applied the common default and kept it visible for review.',
      evidence,
    })

    expect(result.success).toBe(true)
    expect(applyArchitectureCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        changeSetId,
        expectedRevision: 5,
        operations: [
          {
            operationId: operationIds[0],
            type: 'decision.create',
            decision: {
              id: decisionId,
              category: 'Booking policy',
              statement: 'Hold a slot for ten minutes during checkout.',
              state: 'proposed',
              provenance: 'assistant',
              readinessImpact: 'non_blocking',
              supersedesDecisionId: null,
              actor: { type: 'assistant', label: 'MermaidAI assistant' },
              reason: 'Applied the common default and kept it visible for review.',
              evidence,
            },
          },
        ],
        architectureContent,
      }),
    )
  })

  it('accepts a proposed decision with the user actor and exact evidence', async () => {
    const result = await transitionPlanningDecision({
      ...commandIdentity,
      decision: { id: decisionId, state: 'proposed' },
      targetState: 'accepted',
      actor: {
        type: 'user',
        userId: '99999999-9999-4999-8999-999999999999',
        label: 'Project owner',
      },
      reason: 'Confirmed during Architecture review.',
      evidence,
    })

    expect(result.success).toBe(true)
    expect(applyArchitectureCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            type: 'decision.update',
            decisionId,
            changes: expect.objectContaining({
              state: 'accepted',
              actor: {
                type: 'user',
                userId: '99999999-9999-4999-8999-999999999999',
                label: 'Project owner',
              },
              reason: 'Confirmed during Architecture review.',
              evidence,
            }),
          }),
        ],
      }),
    )
  })

  it('rejects an illegal accepted-to-rejected transition before any write', async () => {
    const result = await transitionPlanningDecision({
      ...commandIdentity,
      decision: { id: decisionId, state: 'accepted' },
      targetState: 'rejected',
      actor: { type: 'user', label: 'Project owner' },
      reason: 'Changed direction.',
      evidence,
    })

    expect(result).toEqual({
      success: false,
      error: 'Invalid planning decision transition: accepted -> rejected',
    })
    expect(applyArchitectureCommandMock).not.toHaveBeenCalled()
  })

  it('edits by superseding the old decision and proposing a replacement atomically', async () => {
    const result = await supersedePlanningDecision({
      ...commandIdentity,
      decision: { id: decisionId, state: 'accepted' },
      replacement: {
        id: replacementId,
        category: 'Booking policy',
        statement: 'Hold a slot for fifteen minutes during checkout.',
        provenance: 'user',
        readinessImpact: 'non_blocking',
      },
      actor: { type: 'user', label: 'Project owner' },
      reason: 'Extended the hold after reviewing the booking journey.',
      evidence,
    })

    expect(result.success).toBe(true)
    expect(applyArchitectureCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operations: [
          expect.objectContaining({
            operationId: operationIds[0],
            type: 'decision.update',
            decisionId,
            changes: expect.objectContaining({ state: 'superseded' }),
          }),
          expect.objectContaining({
            operationId: operationIds[1],
            type: 'decision.create',
            decision: expect.objectContaining({
              id: replacementId,
              state: 'proposed',
              supersedesDecisionId: decisionId,
            }),
          }),
        ],
      }),
    )
  })

  it('rejects missing evidence before any write', async () => {
    const result = await proposeAutoDecision({
      ...commandIdentity,
      decision: {
        id: decisionId,
        category: 'Booking policy',
        statement: 'Hold a slot for ten minutes during checkout.',
        readinessImpact: 'non_blocking',
      },
      reason: 'Applied the common default.',
      evidence: [],
    })

    expect(result).toEqual({ success: false, error: expect.stringContaining('evidence') })
    expect(applyArchitectureCommandMock).not.toHaveBeenCalled()
  })

  it('loads active decisions with the latest non-undone evidence event', async () => {
    decisionOrderMock.mockResolvedValue({
      data: [
        {
          id: decisionId,
          project_id: projectId,
          artifact_version_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          category: 'Booking policy',
          statement: 'Hold a slot for ten minutes.',
          state: 'accepted',
          provenance: 'assistant',
          readiness_impact: 'non_blocking',
          supersedes_decision_id: null,
          created_at: '2026-09-02T00:00:00.000Z',
          updated_at: '2026-09-02T00:05:00.000Z',
        },
      ],
      error: null,
    })
    eventOrderMock.mockResolvedValue({
      data: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          project_id: projectId,
          decision_id: decisionId,
          architecture_version_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          change_set_id: changeSetId,
          sequence: 1,
          from_state: 'proposed',
          to_state: 'accepted',
          actor_type: 'user',
          actor_user_id: '99999999-9999-4999-8999-999999999999',
          actor_label: 'Project owner',
          reason: 'Confirmed during Architecture review.',
          evidence,
          undone_by_change_set_id: null,
          created_at: '2026-09-02T00:05:00.000Z',
        },
      ],
      error: null,
    })

    const result = await listPlanningDecisions(projectId)

    expect(result).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          id: decisionId,
          state: 'accepted',
          latest_event: expect.objectContaining({
            actor_type: 'user',
            reason: 'Confirmed during Architecture review.',
            evidence,
          }),
        }),
      ],
    })
  })
})
