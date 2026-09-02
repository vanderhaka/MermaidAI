// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { buildWorkPlanPrompt } from '@/lib/services/prompt-builder-work-plan'

const architectureVersion = {
  id: '11111111-1111-4111-8111-111111111111',
  artifact_id: '22222222-2222-4222-8222-222222222222',
  project_id: '33333333-3333-4333-8333-333333333333',
  artifact_kind: 'architecture' as const,
  version: 3,
  content_hash: 'hash',
  readiness_report: null,
  rendered_markdown: null,
  provenance: {},
  source_version_id: null,
  secondary_source_version_id: null,
  created_at: '2026-09-02T00:00:00.000Z',
  content_state: 'complete' as const,
  request_key: '44444444-4444-4444-8444-444444444444',
  request_hash: 'request-hash',
  content: {
    objective: 'Let customers book.',
    outcomes: ['A confirmed appointment.'],
    actors: ['Customer'],
    capabilities: [
      {
        id: 'booking',
        name: 'Booking',
        purpose: 'Confirm appointments.',
        responsibilities: ['Reserve a slot.'],
        boundaries: ['Does not take payment.'],
      },
    ],
    connections: [],
    important_flows: [
      {
        id: 'book',
        actor: 'Customer',
        outcome: 'Appointment confirmed.',
        capability_ids: ['booking'],
      },
    ],
    assumptions: [],
    blockers: [],
  },
}

describe('Work Plan prompt builder', () => {
  it('freezes the exact Architecture and prevents graph mutation or hidden blockers', () => {
    const prompt = buildWorkPlanPrompt({
      projectName: 'Salon',
      architectureVersion,
      decisions: [],
    })

    expect(prompt).toContain('Frozen source: Architecture v3')
    expect(prompt).toContain(architectureVersion.id)
    expect(prompt).toContain('Call submit_work_plan exactly once')
    expect(prompt).toContain('Do not edit it')
    expect(prompt).toContain('Never silently decide a blocker')
    expect(prompt).toContain('Cover every Architecture capability')
    expect(prompt).toContain('Never invent a repository script')
    expect(prompt).toContain('Confirm in target repository:')
  })
})
