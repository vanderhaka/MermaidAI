import { describe, expect, it } from 'vitest'

import { applyWorkPlanEdits, workPlanEditBatchSchema } from '@/lib/services/planning-tools'
import type { WorkPlanContent } from '@/types/planning'

function plan(): WorkPlanContent {
  return {
    source_architecture_version: {
      id: 'architecture-v1',
      artifact_kind: 'architecture',
      version: 1,
    },
    objective: 'Ship booking.',
    non_goals: ['Payments'],
    phases: [{ id: 'phase-one', title: 'Booking', objective: 'Book.', slice_ids: ['book'] }],
    slices: [
      {
        id: 'book',
        title: 'Book a slot',
        actor_or_trigger: 'Customer chooses a slot.',
        observable_outcome: 'Booking is confirmed.',
        protected_invariant: 'No double booking.',
        dependencies: [],
        source_capability_ids: ['booking'],
        acceptance_criteria: ['Booking exists once.'],
        verification: [{ command: 'npm test -- booking' }],
        likely_targets: { files: [], api: [], data: [] },
        risks: ['Concurrency'],
        rollback_notes: ['Disable writes'],
        assumption_ids: [],
        unresolved_blocker_ids: [],
      },
    ],
    assumptions: [],
    unresolved_blockers: [],
  }
}

describe('Work Plan finite edit commands', () => {
  it('updates summary and adds a dependency-ordered slice without changing the source', () => {
    const current = plan()
    const batch = workPlanEditBatchSchema.parse({
      summary: 'Added confirmation delivery.',
      commands: [
        { type: 'update_summary', objective: 'Ship booking and confirmation.' },
        {
          type: 'add_slice',
          phase_id: 'phase-one',
          after_slice_id: 'book',
          slice: {
            ...current.slices[0],
            id: 'confirm',
            title: 'Send confirmation',
            dependencies: ['book'],
          },
        },
      ],
    })

    const result = applyWorkPlanEdits(current, batch)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.source_architecture_version).toEqual(current.source_architecture_version)
    expect(result.data.objective).toBe('Ship booking and confirmation.')
    expect(result.data.phases[0].slice_ids).toEqual(['book', 'confirm'])
  })

  it('refuses to remove a slice that a later slice still depends on', () => {
    const current = plan()
    current.slices.push({ ...current.slices[0], id: 'confirm', dependencies: ['book'] })
    current.phases[0].slice_ids.push('confirm')

    const result = applyWorkPlanEdits(current, {
      summary: 'Remove booking.',
      commands: [{ type: 'remove_slice', slice_id: 'book' }],
    })

    expect(result).toEqual({
      success: false,
      error: 'Slice book is still required by confirm. Update dependencies first.',
    })
  })

  it('rejects dangling assumption references after an edit', () => {
    const current = plan()
    current.slices[0].assumption_ids = ['timezone']

    const result = applyWorkPlanEdits(current, {
      summary: 'Keep a missing assumption.',
      commands: [{ type: 'update_summary', objective: 'Still invalid.' }],
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain('assumption reference')
  })
})
