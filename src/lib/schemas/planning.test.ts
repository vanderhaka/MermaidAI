// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  architectureSnapshotContentSchema,
  executionHandoffContentSchema,
  workPlanContentSchema,
} from '@/lib/schemas/planning'

const architectureVersion = {
  id: 'architecture-version-1',
  artifact_kind: 'architecture',
  version: 1,
}

const workPlanVersion = {
  id: 'work-plan-version-1',
  artifact_kind: 'work_plan',
  version: 1,
}

const architectureSnapshot = {
  objective: 'Let customers book appointments without staff coordination.',
  outcomes: ['Customers can confirm a booking.', 'Staff can manage availability.'],
  actors: ['Customer', 'Staff'],
  capabilities: [
    {
      id: 'booking',
      name: 'Booking',
      purpose: 'Capture an appointment request.',
      responsibilities: ['Collect appointment details'],
      boundaries: ['Does not charge a payment'],
    },
    {
      id: 'availability',
      name: 'Availability',
      purpose: 'Expose staff availability.',
      responsibilities: ['Provide selectable appointment times'],
      boundaries: ['Does not send customer reminders'],
    },
  ],
  connections: [
    {
      from_capability_id: 'booking',
      to_capability_id: 'availability',
      description: 'Booking asks availability for valid times.',
    },
  ],
  important_flows: [
    {
      id: 'customer-books',
      actor: 'Customer',
      outcome: 'A confirmed appointment.',
      capability_ids: ['availability', 'booking'],
    },
  ],
  assumptions: [
    { id: 'assumption-timezone', statement: 'All appointments use the salon timezone.' },
  ],
  blockers: [],
}

const workPlan = {
  source_architecture_version: architectureVersion,
  objective: 'Deliver a booking flow.',
  non_goals: ['Recurring bookings'],
  phases: [
    {
      id: 'foundation',
      title: 'Foundation',
      objective: 'Make time slots available.',
      slice_ids: ['availability-slice'],
    },
    {
      id: 'booking',
      title: 'Booking',
      objective: 'Let a customer reserve a slot.',
      slice_ids: ['booking-slice'],
    },
  ],
  slices: [
    {
      id: 'availability-slice',
      title: 'Available times',
      actor_or_trigger: 'Staff publishes availability',
      observable_outcome: 'Customers can see available appointment times.',
      protected_invariant: 'Unavailable times cannot be selected.',
      dependencies: [],
      source_capability_ids: ['availability'],
      acceptance_criteria: ['Only available times are returned.'],
      verification: [{ command: 'npm test -- availability' }],
      likely_targets: {
        files: ['src/lib/availability.ts'],
        api: ['/api/availability'],
        data: ['slots'],
      },
      risks: ['Timezone conversion'],
      rollback_notes: ['Disable the availability endpoint.'],
      assumption_ids: ['assumption-timezone'],
      unresolved_blocker_ids: [],
    },
    {
      id: 'booking-slice',
      title: 'Reserve appointment',
      actor_or_trigger: 'Customer selects a time',
      observable_outcome: 'A customer receives a booking confirmation.',
      protected_invariant: 'A slot cannot be double-booked.',
      dependencies: ['availability-slice'],
      source_capability_ids: ['booking', 'availability'],
      acceptance_criteria: ['A valid time creates one booking.'],
      verification: [{ command: 'npm test -- booking' }],
      likely_targets: { files: ['src/lib/booking.ts'], api: ['/api/bookings'], data: ['bookings'] },
      risks: ['Concurrent booking'],
      rollback_notes: ['Disable new booking creation.'],
      assumption_ids: ['assumption-timezone'],
      unresolved_blocker_ids: [],
    },
  ],
  assumptions: [
    { id: 'assumption-timezone', statement: 'All appointments use the salon timezone.' },
  ],
  unresolved_blockers: [],
}

describe('planning content schemas', () => {
  it('accepts a connected high-level Architecture snapshot', () => {
    expect(architectureSnapshotContentSchema.safeParse(architectureSnapshot).success).toBe(true)
  })

  it('rejects Architecture connections that reference an unknown capability', () => {
    const result = architectureSnapshotContentSchema.safeParse({
      ...architectureSnapshot,
      connections: [
        {
          from_capability_id: 'booking',
          to_capability_id: 'missing',
          description: 'Broken connection.',
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('accepts a dependency-ordered Work Plan', () => {
    expect(workPlanContentSchema.safeParse(workPlan).success).toBe(true)
  })

  it('rejects a Work Plan with a cyclic dependency', () => {
    const result = workPlanContentSchema.safeParse({
      ...workPlan,
      slices: workPlan.slices.map((slice) =>
        slice.id === 'availability-slice' ? { ...slice, dependencies: ['booking-slice'] } : slice,
      ),
    })

    expect(result.success).toBe(false)
  })

  it('rejects a Work Plan when a phase does not account for every slice', () => {
    const result = workPlanContentSchema.safeParse({
      ...workPlan,
      phases: [workPlan.phases[0]],
    })

    expect(result.success).toBe(false)
  })

  it('accepts an execution handoff packet with exact immutable source versions', () => {
    const result = executionHandoffContentSchema.safeParse({
      source_architecture_version: architectureVersion,
      source_work_plan_version: workPlanVersion,
      objective: workPlan.objective,
      non_goals: workPlan.non_goals,
      dependency_order: ['availability-slice', 'booking-slice'],
      slices: workPlan.slices.map((slice) => ({
        id: slice.id,
        title: slice.title,
        dependencies: slice.dependencies,
        acceptance_criteria: slice.acceptance_criteria,
        verification: slice.verification,
        risks: slice.risks,
        rollback_notes: slice.rollback_notes,
      })),
      assumptions: workPlan.assumptions,
      unresolved_blockers: [],
      out_of_scope: workPlan.non_goals,
      authorization_notice:
        'This packet is for review, copy, or download only. It does not authorize or start implementation.',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a handoff dependency order that places a slice before its dependency', () => {
    const result = executionHandoffContentSchema.safeParse({
      source_architecture_version: architectureVersion,
      source_work_plan_version: workPlanVersion,
      objective: workPlan.objective,
      non_goals: workPlan.non_goals,
      dependency_order: ['booking-slice', 'availability-slice'],
      slices: workPlan.slices.map((slice) => ({
        id: slice.id,
        title: slice.title,
        dependencies: slice.dependencies,
        acceptance_criteria: slice.acceptance_criteria,
        verification: slice.verification,
        risks: slice.risks,
        rollback_notes: slice.rollback_notes,
      })),
      assumptions: workPlan.assumptions,
      unresolved_blockers: [],
      out_of_scope: workPlan.non_goals,
      authorization_notice:
        'This packet is for review, copy, or download only. It does not authorize or start implementation.',
    })

    expect(result.success).toBe(false)
  })

  it('rejects every unrecognised Stage 3 field, including execution actions', () => {
    const result = executionHandoffContentSchema.safeParse({
      source_architecture_version: architectureVersion,
      source_work_plan_version: workPlanVersion,
      objective: workPlan.objective,
      non_goals: workPlan.non_goals,
      dependency_order: ['availability-slice', 'booking-slice'],
      slices: workPlan.slices.map((slice) => ({
        id: slice.id,
        title: slice.title,
        dependencies: slice.dependencies,
        acceptance_criteria: slice.acceptance_criteria,
        verification: slice.verification,
        risks: slice.risks,
        rollback_notes: slice.rollback_notes,
      })),
      assumptions: workPlan.assumptions,
      unresolved_blockers: [],
      out_of_scope: workPlan.non_goals,
      authorization_notice:
        'This packet is for review, copy, or download only. It does not authorize or start implementation.',
      action: 'create_codex_task',
    })

    expect(result.success).toBe(false)
  })
})
