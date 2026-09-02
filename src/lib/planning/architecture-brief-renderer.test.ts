import { describe, expect, it } from 'vitest'

import { renderArchitectureBrief } from '@/lib/planning/architecture-brief-renderer'
import type { ArchitectureReadinessReport } from '@/lib/services/architecture-readiness'
import type { PlanningDecision } from '@/lib/services/planning-decision-service'
import type { ArchitectureSnapshotContent } from '@/types/planning'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const VERSION_ID = '22222222-2222-4222-8222-222222222222'

const architecture: ArchitectureSnapshotContent = {
  objective: 'Let studio staff manage booking deposits without manual reconciliation.',
  outcomes: ['Deposits are traceable', 'Refund ownership is explicit'],
  actors: ['Studio staff', 'Customer'],
  capabilities: [
    {
      id: 'booking',
      name: 'Booking management',
      purpose: 'Own the booking lifecycle.',
      responsibilities: ['Create bookings', 'Track booking status'],
      boundaries: ['Does not process money'],
    },
    {
      id: 'payments',
      name: 'Deposit payments',
      purpose: 'Own deposit authorization and refunds.',
      responsibilities: ['Authorize deposits', 'Record refund outcomes'],
      boundaries: ['Does not decide refund policy'],
    },
  ],
  connections: [
    {
      from_capability_id: 'booking',
      to_capability_id: 'payments',
      description: 'Booking requests a deposit before confirmation.',
    },
  ],
  important_flows: [
    {
      id: 'staff-refund',
      actor: 'Studio staff',
      outcome: 'Refund ownership is explicit',
      capability_ids: ['booking', 'payments'],
    },
  ],
  assumptions: [{ id: 'assumption-1', statement: 'The provider supports partial refunds.' }],
  blockers: [{ id: 'blocker-1', statement: 'Refund approval threshold is undecided.' }],
}

function report(overrides: Partial<ArchitectureReadinessReport> = {}): ArchitectureReadinessReport {
  return {
    schemaVersion: 2,
    projectId: PROJECT_ID,
    architectureVersionId: VERSION_ID,
    architectureVersion: 7,
    architectureContentHash: 'hash-v7',
    evaluatedRevision: 15,
    state: 'ready_with_assumptions',
    freshness: 'current',
    handoffEligible: false,
    checks: [],
    reasons: ['Accept or reject the provider assumption.'],
    blockingQuestionIds: [],
    nonBlockingQuestionIds: [],
    deferredQuestionIds: [],
    proposedDecisionIds: ['33333333-3333-4333-8333-333333333333'],
    acceptedDecisionIds: ['44444444-4444-4444-8444-444444444444'],
    supersededDecisionIds: [],
    invalidInputIds: [],
    staleInputIds: [],
    ...overrides,
  }
}

function decision(overrides: Partial<PlanningDecision>): PlanningDecision {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    project_id: PROJECT_ID,
    artifact_version_id: VERSION_ID,
    category: 'provider capability',
    statement: 'The provider supports partial refunds.',
    state: 'proposed',
    provenance: 'assistant',
    readiness_impact: 'non_blocking',
    supersedes_decision_id: null,
    created_at: '2026-09-02T00:00:00.000Z',
    updated_at: '2026-09-02T00:00:00.000Z',
    events: [],
    latest_event: null,
    ...overrides,
  }
}

describe('renderArchitectureBrief', () => {
  it('renders the exact active version, capability map, readiness, and active decisions', () => {
    const markdown = renderArchitectureBrief({
      projectName: 'Studio bookings',
      version: {
        id: VERSION_ID,
        version: 7,
        contentHash: 'hash-v7',
        content: architecture,
      },
      report: report(),
      decisions: [
        decision({}),
        decision({
          id: '44444444-4444-4444-8444-444444444444',
          category: 'refund ownership',
          statement: 'Studio managers approve refunds over $500.',
          state: 'accepted',
          provenance: 'user',
        }),
        decision({
          id: '55555555-5555-4555-8555-555555555555',
          statement: 'An older rejected assumption.',
          state: 'rejected',
        }),
      ],
    })

    expect(markdown).toContain('# Studio bookings Architecture Brief')
    expect(markdown).toContain('Architecture v7')
    expect(markdown).toContain('Ready with assumptions')
    expect(markdown).toContain('Booking management -> Deposit payments')
    expect(markdown).toContain('Studio staff: Refund ownership is explicit')
    expect(markdown).toContain('Studio managers approve refunds over $500.')
    expect(markdown).toContain('The provider supports partial refunds.')
    expect(markdown).toContain('Refund approval threshold is undecided.')
    expect(markdown).not.toContain('An older rejected assumption.')
  })

  it('does not present a readiness report from another version as current', () => {
    const markdown = renderArchitectureBrief({
      projectName: 'Studio bookings',
      version: {
        id: VERSION_ID,
        version: 7,
        contentHash: 'hash-v7',
        content: architecture,
      },
      report: report({ architectureVersionId: '66666666-6666-4666-8666-666666666666' }),
      decisions: [],
    })

    expect(markdown).toContain('Readiness not evaluated for Architecture v7')
    expect(markdown).not.toContain('Ready with assumptions')
  })

  it('is deterministic and does not mutate the source arrays', () => {
    const decisions = [
      decision({ id: '88888888-8888-4888-8888-888888888888', statement: 'Second.' }),
      decision({ id: '77777777-7777-4777-8777-777777777777', statement: 'First.' }),
    ]
    const originalOrder = decisions.map(({ id }) => id)
    const input = {
      projectName: 'Studio bookings',
      version: {
        id: VERSION_ID,
        version: 7,
        contentHash: 'hash-v7',
        content: architecture,
      },
      report: report(),
      decisions,
    }

    expect(renderArchitectureBrief(input)).toBe(renderArchitectureBrief(input))
    expect(decisions.map(({ id }) => id)).toEqual(originalOrder)
  })
})
