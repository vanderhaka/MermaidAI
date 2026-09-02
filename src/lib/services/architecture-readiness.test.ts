// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ rpc: mockRpc })),
}))

import {
  evaluateArchitectureReadiness,
  getArchitectureReadinessFreshness,
  persistArchitectureReadinessReport,
  type ArchitectureReadinessDecision,
  type ArchitectureReadinessInput,
  type ArchitectureReadinessQuestion,
} from '@/lib/services/architecture-readiness'

const projectId = '11111111-1111-4111-8111-111111111111'
const versionId = '22222222-2222-4222-8222-222222222222'
const otherVersionId = '33333333-3333-4333-8333-333333333333'

const completeArchitecture = {
  objective: 'Let a salon manage a booking from request through confirmation.',
  outcomes: ['A customer gets a confirmed appointment', 'Staff avoid scheduling clashes'],
  actors: ['Customer', 'Salon staff'],
  capabilities: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Availability',
      purpose: 'Expose times that can actually be booked.',
      responsibilities: ['Combine schedules and commitments'],
      boundaries: ['Does not own the booking'],
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Bookings',
      purpose: 'Own the appointment from request through confirmation.',
      responsibilities: ['Reserve a valid slot'],
      boundaries: ['Does not settle money'],
    },
  ],
  connections: [
    {
      from_capability_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      to_capability_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      description: 'Availability supplies a bookable slot.',
    },
  ],
  important_flows: [
    {
      id: 'customer-books',
      actor: 'Customer',
      outcome: 'A customer gets a confirmed appointment',
      capability_ids: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ],
    },
    {
      id: 'staff-delivers',
      actor: 'Salon staff',
      outcome: 'Staff avoid scheduling clashes',
      capability_ids: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ],
    },
  ],
  assumptions: [],
  blockers: [],
}

const validEvent = {
  actor_type: 'assistant' as const,
  actor_label: 'MermaidAI assistant',
  reason: 'Applied the common default and kept it visible for review.',
  evidence: [
    {
      type: 'chat_turn',
      reference: '44444444-4444-4444-8444-444444444444',
      summary: 'The booking brief did not specify this routine policy.',
    },
  ],
}

function decision(
  overrides: Partial<ArchitectureReadinessDecision> = {},
): ArchitectureReadinessDecision {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    artifact_version_id: versionId,
    category: 'Booking policy',
    statement: 'Hold a slot for ten minutes during checkout.',
    state: 'proposed',
    provenance: 'assistant',
    readiness_impact: 'non_blocking',
    supersedes_decision_id: null,
    latest_event: validEvent,
    ...overrides,
  }
}

function question(
  readinessImpact: ArchitectureReadinessQuestion['readiness_impact'],
  overrides: Partial<ArchitectureReadinessQuestion> = {},
): ArchitectureReadinessQuestion {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    artifact_version_id: versionId,
    question: 'What happens when the deposit fails?',
    status: 'open',
    readiness_impact: readinessImpact,
    ...overrides,
  }
}

function input(overrides: Partial<ArchitectureReadinessInput> = {}): ArchitectureReadinessInput {
  return {
    projectId,
    architectureVersion: { id: versionId, version: 3, contentHash: 'architecture-hash' },
    activeArchitectureVersionId: versionId,
    evaluatedRevision: 7,
    architecture: completeArchitecture,
    decisions: [],
    openQuestions: [],
    ...overrides,
  }
}

describe('Architecture readiness truth table', () => {
  it('keeps a blank project in draft even when it has zero open questions', () => {
    const report = evaluateArchitectureReadiness(
      input({
        architecture: null,
      }),
    )

    expect(report.state).toBe('draft')
    expect(report.handoffEligible).toBe(false)
    expect(report.checks.map((check) => [check.key, check.status])).toEqual([
      ['outcome', 'fail'],
      ['capability_map', 'fail'],
      ['connections', 'fail'],
      ['actor_flows', 'fail'],
      ['business_boundaries', 'fail'],
      ['narrative_consistency', 'pass'],
      ['coverage_decisions', 'pass'],
      ['blockers', 'pass'],
    ])
  })

  it('keeps a goal-only project in draft without pretending zero questions means ready', () => {
    const report = evaluateArchitectureReadiness(
      input({
        architecture: {
          ...completeArchitecture,
          capabilities: [],
          connections: [],
          important_flows: [],
        },
      }),
    )

    expect(report.state).toBe('draft')
    expect(report.reasons).toContain('The capability map is incomplete.')
  })

  it('keeps a disconnected capability map in draft', () => {
    const report = evaluateArchitectureReadiness(
      input({ architecture: { ...completeArchitecture, connections: [] } }),
    )

    expect(report.state).toBe('draft')
    expect(report.checks.find((check) => check.key === 'connections')).toMatchObject({
      status: 'fail',
      affectedIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    })
  })

  it('refuses handoff while the brief still describes a resolved choice as open', () => {
    const report = evaluateArchitectureReadiness(
      input({
        architecture: {
          ...completeArchitecture,
          capabilities: completeArchitecture.capabilities.map((capability, index) =>
            index === 0
              ? {
                  ...capability,
                  boundaries: ['Does not resolve the unanswered scope of final approval.'],
                }
              : capability,
          ),
        },
      }),
    )

    expect(report.state).toBe('draft')
    expect(report.handoffEligible).toBe(false)
    expect(report.checks.find((check) => check.key === 'narrative_consistency')).toEqual({
      key: 'narrative_consistency',
      status: 'fail',
      explanation:
        'Replace open, unanswered, unresolved, or TBD placeholders with the current decision; keep remaining uncertainty in the review list.',
      affectedIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    })
    expect(report.reasons).toContain(
      'The Architecture narrative still contains unresolved planning placeholders.',
    )
  })

  it('detects a split map when one connected component still leaves an isolated capability', () => {
    const isolatedId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const report = evaluateArchitectureReadiness(
      input({
        architecture: {
          ...completeArchitecture,
          capabilities: [
            ...completeArchitecture.capabilities,
            {
              id: isolatedId,
              name: 'Reporting',
              purpose: 'Summarise completed salon work.',
              responsibilities: ['Summarise operational outcomes'],
              boundaries: ['Does not operate bookings'],
            },
          ],
        },
      }),
    )

    expect(report.state).toBe('draft')
    expect(report.checks.find((check) => check.key === 'connections')).toMatchObject({
      status: 'fail',
      affectedIds: expect.arrayContaining([isolatedId]),
    })
  })

  it('returns needs_input for an unresolved blocking question', () => {
    const report = evaluateArchitectureReadiness(input({ openQuestions: [question('blocking')] }))

    expect(report.state).toBe('needs_input')
    expect(report.blockingQuestionIds).toEqual(['66666666-6666-4666-8666-666666666666'])
    expect(report.handoffEligible).toBe(false)
  })

  it.each(['non_blocking', 'deferred'] as const)(
    'does not block a coherent map for an unresolved %s question',
    (readinessImpact) => {
      const report = evaluateArchitectureReadiness(
        input({ openQuestions: [question(readinessImpact)] }),
      )

      expect(report.state).toBe('ready')
      expect(report.handoffEligible).toBe(true)
      expect(report.blockingQuestionIds).toEqual([])
    },
  )

  it('shows proposed assumptions but requires explicit acceptance before handoff', () => {
    const report = evaluateArchitectureReadiness(input({ decisions: [decision()] }))

    expect(report.state).toBe('ready_with_assumptions')
    expect(report.proposedDecisionIds).toEqual(['55555555-5555-4555-8555-555555555555'])
    expect(report.handoffEligible).toBe(false)
  })

  it('allows handoff with an explicitly accepted, evidenced assumption', () => {
    const report = evaluateArchitectureReadiness(
      input({ decisions: [decision({ state: 'accepted' })] }),
    )

    expect(report.state).toBe('ready_with_assumptions')
    expect(report.acceptedDecisionIds).toEqual(['55555555-5555-4555-8555-555555555555'])
    expect(report.handoffEligible).toBe(true)
  })

  it('uses correct plural grammar for multiple active assumptions', () => {
    const report = evaluateArchitectureReadiness(
      input({
        decisions: [
          decision({ state: 'accepted' }),
          decision({ id: '77777777-7777-4777-8777-777777777777', state: 'accepted' }),
        ],
      }),
    )

    expect(report.checks.find((check) => check.key === 'coverage_decisions')?.explanation).toBe(
      '2 active assumptions remain visible in the review.',
    )
  })

  it('returns ready for a complete map with no active assumptions or blockers', () => {
    const report = evaluateArchitectureReadiness(input())

    expect(report.state).toBe('ready')
    expect(report.handoffEligible).toBe(true)
    expect(report.reasons).toEqual(['Architecture v3 is ready for Work Plan generation.'])
  })

  it('fails closed on an unclassified open question', () => {
    const report = evaluateArchitectureReadiness(input({ openQuestions: [question(null)] }))

    expect(report.state).toBe('needs_input')
    expect(report.invalidInputIds).toEqual(['66666666-6666-4666-8666-666666666666'])
    expect(report.reasons).toContain(
      '1 planning input needs a valid readiness classification or evidence trail.',
    )
  })

  it.each([
    ['missing event', null],
    ['missing reason', { ...validEvent, reason: ' ' }],
    ['missing evidence', { ...validEvent, evidence: [] }],
    [
      'invalid evidence',
      { ...validEvent, evidence: [{ type: 'chat_turn', reference: '', summary: 'No reference' }] },
    ],
  ])('fails closed on %s for an active decision', (_label, latestEvent) => {
    const report = evaluateArchitectureReadiness(
      input({ decisions: [decision({ latest_event: latestEvent })] }),
    )

    expect(report.state).toBe('needs_input')
    expect(report.invalidInputIds).toEqual(['55555555-5555-4555-8555-555555555555'])
    expect(report.handoffEligible).toBe(false)
  })

  it('excludes stale and superseded decisions from active assumptions while explaining them', () => {
    const report = evaluateArchitectureReadiness(
      input({
        decisions: [
          decision({ artifact_version_id: otherVersionId }),
          decision({
            id: '77777777-7777-4777-8777-777777777777',
            state: 'superseded',
          }),
        ],
      }),
    )

    expect(report.state).toBe('ready')
    expect(report.staleInputIds).toEqual(['55555555-5555-4555-8555-555555555555'])
    expect(report.supersededDecisionIds).toEqual(['77777777-7777-4777-8777-777777777777'])
  })

  it('is deterministic regardless of input ordering', () => {
    const decisions = [
      decision({ id: '88888888-8888-4888-8888-888888888888', state: 'accepted' }),
      decision(),
    ]
    const questions = [
      question('deferred', { id: '99999999-9999-4999-8999-999999999999' }),
      question('non_blocking'),
    ]

    expect(evaluateArchitectureReadiness(input({ decisions, openQuestions: questions }))).toEqual(
      evaluateArchitectureReadiness(
        input({ decisions: decisions.toReversed(), openQuestions: questions.toReversed() }),
      ),
    )
  })
})

describe('Architecture readiness source binding', () => {
  it('marks an otherwise ready report stale when the active version changes', () => {
    const report = evaluateArchitectureReadiness(
      input({ activeArchitectureVersionId: otherVersionId }),
    )

    expect(report.freshness).toBe('stale')
    expect(report.handoffEligible).toBe(false)
    expect(
      getArchitectureReadinessFreshness(report, {
        activeArchitectureVersionId: otherVersionId,
        currentRevision: 7,
      }),
    ).toEqual({ freshness: 'stale', reasons: ['architecture_version_changed'] })
  })

  it('marks a persisted report stale when newer work advances the revision', () => {
    const report = evaluateArchitectureReadiness(input())

    expect(
      getArchitectureReadinessFreshness(report, {
        activeArchitectureVersionId: versionId,
        currentRevision: 8,
      }),
    ).toEqual({ freshness: 'stale', reasons: ['planning_revision_changed'] })
  })

  it('persists the exact report through an ownership and revision checked RPC', async () => {
    const report = evaluateArchitectureReadiness(input())
    const persisted = {
      id: 'aaaaaaaa-1111-4111-8111-111111111111',
      project_id: projectId,
      architecture_version_id: versionId,
      schema_version: 2,
      evaluated_revision: 7,
      state: 'ready',
      report,
      report_hash: 'hash',
      created_at: '2026-09-02T00:00:00.000Z',
    }
    mockRpc.mockResolvedValue({ data: persisted, error: null })

    await expect(persistArchitectureReadinessReport({ projectId, report })).resolves.toEqual({
      success: true,
      data: persisted,
    })
    expect(mockRpc).toHaveBeenCalledWith('persist_architecture_readiness_report', {
      p_project_id: projectId,
      p_architecture_version_id: versionId,
      p_evaluated_revision: 7,
      p_report: report,
    })
  })
})
