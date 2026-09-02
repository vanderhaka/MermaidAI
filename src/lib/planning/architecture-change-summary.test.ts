import { describe, expect, it } from 'vitest'

import {
  mergeArchitectureChangeSummaries,
  readArchitectureChangeSummary,
  summarizeArchitectureOperations,
} from '@/lib/planning/architecture-change-summary'

describe('Architecture change summaries', () => {
  it('derives review counts from every committed Architecture operation kind', () => {
    expect(
      summarizeArchitectureOperations({
        operations: [
          { type: 'module.create' },
          { type: 'module_connection.create' },
          { type: 'module.update' },
          { type: 'flow_node.delete' },
          { type: 'decision.create' },
          { type: 'question.resolve' },
        ],
      }),
    ).toMatchObject({
      created: 2,
      updated: 1,
      deleted: 1,
      assumed: 1,
      resolved: 1,
      capabilitiesCreated: 1,
      connectionsCreated: 1,
    })
  })

  it('normalizes older persisted first-draft summaries without losing compatibility', () => {
    expect(
      readArchitectureChangeSummary({
        change_summary: {
          capabilitiesCreated: 3,
          connectionsCreated: 2,
          assumptionsRecorded: 1,
          questionsRecorded: 1,
          provisional: true,
        },
      }),
    ).toMatchObject({ created: 6, updated: 0, deleted: 0, assumed: 1, resolved: 0 })
  })

  it('aggregates multiple committed batches into one turn receipt', () => {
    const first = summarizeArchitectureOperations([{ type: 'module.create' }])
    const second = summarizeArchitectureOperations([
      { type: 'module.update' },
      { type: 'question.resolve' },
    ])

    expect(mergeArchitectureChangeSummaries(first, second)).toMatchObject({
      created: 1,
      updated: 1,
      resolved: 1,
    })
  })
})
