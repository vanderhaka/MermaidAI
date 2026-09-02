import { describe, expect, it } from 'vitest'

import { compareArchitectureSources } from '@/lib/planning/source-comparison'
import type { ArchitectureSnapshotContent } from '@/types/planning'

function architecture(): ArchitectureSnapshotContent {
  return {
    objective: 'Let customers book.',
    outcomes: ['A booking is confirmed.'],
    actors: ['Customer'],
    capabilities: [
      {
        id: 'booking',
        name: 'Booking',
        purpose: 'Confirm appointments.',
        responsibilities: ['Reserve a slot.'],
        boundaries: ['Does not charge.'],
      },
    ],
    connections: [],
    important_flows: [
      {
        id: 'book',
        actor: 'Customer',
        outcome: 'A booking is confirmed.',
        capability_ids: ['booking'],
      },
    ],
    assumptions: [],
    blockers: [],
  }
}

describe('compareArchitectureSources', () => {
  it('summarizes the material Architecture changes without implementation noise', () => {
    const before = architecture()
    const after: ArchitectureSnapshotContent = {
      ...before,
      capabilities: [
        { ...before.capabilities[0], responsibilities: ['Reserve exactly one slot.'] },
        {
          id: 'notification',
          name: 'Notification',
          purpose: 'Send confirmations.',
          responsibilities: ['Notify the customer.'],
          boundaries: ['Does not schedule.'],
        },
      ],
      connections: [
        {
          from_capability_id: 'booking',
          to_capability_id: 'notification',
          description: 'Trigger confirmation.',
        },
      ],
      assumptions: [
        {
          id: 'email',
          statement: 'Email is available.',
        },
      ],
    }

    expect(compareArchitectureSources({ fromVersion: 2, toVersion: 3, before, after })).toEqual({
      fromVersion: 2,
      toVersion: 3,
      capabilitiesAdded: 1,
      capabilitiesRemoved: 0,
      capabilitiesChanged: 1,
      connectionsAdded: 1,
      connectionsRemoved: 0,
      connectionsChanged: 0,
      decisionsChanged: 1,
    })
  })
})
