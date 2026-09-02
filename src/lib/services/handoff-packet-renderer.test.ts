// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  buildExecutionHandoffContent,
  EXECUTION_HANDOFF_AUTHORIZATION_NOTICE,
  renderExecutionHandoffPacket,
} from '@/lib/services/handoff-packet-renderer'

const workPlanVersion = {
  id: '11111111-1111-4111-8111-111111111111',
  artifact_id: '22222222-2222-4222-8222-222222222222',
  project_id: '33333333-3333-4333-8333-333333333333',
  artifact_kind: 'work_plan' as const,
  version: 4,
  content_hash: 'work-plan-hash',
  readiness_report: null,
  rendered_markdown: null,
  provenance: {},
  source_version_id: '44444444-4444-4444-8444-444444444444',
  secondary_source_version_id: null,
  created_at: '2026-09-02T00:00:00.000Z',
  content_state: 'complete' as const,
  request_key: '55555555-5555-4555-8555-555555555555',
  request_hash: 'request-hash',
  content: {
    source_architecture_version: {
      id: '44444444-4444-4444-8444-444444444444',
      artifact_kind: 'architecture' as const,
      version: 3,
    },
    objective: 'Ship safe booking.',
    non_goals: ['Replace the CRM.'],
    phases: [
      {
        id: 'phase-one',
        title: 'Foundation',
        objective: 'Create and expose a booking.',
        slice_ids: ['slice-api', 'slice-store'],
      },
    ],
    // Deliberately listed in reverse dependency order to prove deterministic sorting.
    slices: [
      {
        id: 'slice-api',
        title: 'Expose booking',
        actor_or_trigger: 'A customer submits the form.',
        observable_outcome: 'The customer receives a confirmation.',
        protected_invariant: 'Only persisted bookings are confirmed.',
        dependencies: ['slice-store'],
        source_capability_ids: ['booking'],
        acceptance_criteria: ['A valid request returns a confirmation.'],
        verification: [{ command: 'npm test -- api', purpose: 'Prove the API path.' }],
        likely_targets: { files: [], api: ['/api/bookings'], data: [] },
        risks: ['The API could confirm too early.'],
        rollback_notes: ['Disable the route.'],
        assumption_ids: [],
        unresolved_blocker_ids: [],
      },
      {
        id: 'slice-store',
        title: 'Store booking',
        actor_or_trigger: 'The booking service validates a request.',
        observable_outcome: 'One booking is durable.',
        protected_invariant: 'A slot is unique.',
        dependencies: [],
        source_capability_ids: ['booking'],
        acceptance_criteria: ['A slot cannot be double-booked.'],
        verification: [{ command: 'npm test -- store' }],
        likely_targets: { files: [], api: [], data: ['bookings'] },
        risks: ['Concurrent inserts.'],
        rollback_notes: ['Stop writes and retain data.'],
        assumption_ids: ['assumption-one'],
        unresolved_blocker_ids: [],
      },
    ],
    assumptions: [{ id: 'assumption-one', statement: 'One timezone per venue.' }],
    unresolved_blockers: [],
  },
}

describe('Execution Handoff packet renderer', () => {
  it('derives an exact, dependency-ordered, non-executing packet from a Work Plan', () => {
    const content = buildExecutionHandoffContent(workPlanVersion)

    expect(content.dependency_order).toEqual(['slice-store', 'slice-api'])
    expect(content.source_work_plan_version).toEqual({
      id: workPlanVersion.id,
      artifact_kind: 'work_plan',
      version: 4,
    })
    expect(content.source_architecture_version.id).toBe(workPlanVersion.source_version_id)
    expect(content.authorization_notice).toBe(EXECUTION_HANDOFF_AUTHORIZATION_NOTICE)
  })

  it('renders byte-for-byte deterministically with exact source labels and safety wording', () => {
    const content = buildExecutionHandoffContent(workPlanVersion)
    const first = renderExecutionHandoffPacket({ projectName: 'Salon', content })
    const second = renderExecutionHandoffPacket({ projectName: 'Salon', content })

    expect(first).toBe(second)
    expect(first).toContain(`Architecture v3 (\`${workPlanVersion.source_version_id}\`)`)
    expect(first).toContain(`Work Plan v4 (\`${workPlanVersion.id}\`)`)
    expect(first.indexOf('Store booking')).toBeLessThan(first.indexOf('Expose booking'))
    expect(first).toContain(EXECUTION_HANDOFF_AUTHORIZATION_NOTICE)
    expect(first).toContain('## Repository evidence boundary')
    expect(first).toContain('has not inspected or run the target repository')
    expect(first).not.toMatch(/create codex task|deploy now|run migration/i)
  })
})
