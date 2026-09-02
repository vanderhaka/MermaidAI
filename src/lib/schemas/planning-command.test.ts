// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  architectureCommandSchema,
  getArchitectureOperationClassification,
} from '@/lib/schemas/planning-command'

const projectId = '11111111-1111-4111-8111-111111111111'
const changeSetId = '22222222-2222-4222-8222-222222222222'
const operationId = '33333333-3333-4333-8333-333333333333'
const moduleId = '44444444-4444-4444-8444-444444444444'

const architectureContent = {
  objective: 'Let customers book appointments.',
  outcomes: ['Customers can confirm a booking.'],
  actors: ['Customer'],
  capabilities: [
    {
      id: moduleId,
      name: 'Booking',
      purpose: 'Capture an appointment request.',
      responsibilities: ['Collect appointment details'],
      boundaries: ['Does not charge a payment'],
    },
  ],
  connections: [],
  important_flows: [
    {
      id: 'customer-books',
      actor: 'Customer',
      outcome: 'A confirmed appointment.',
      capability_ids: [moduleId],
    },
  ],
  assumptions: [],
  blockers: [],
}

describe('Architecture command contract', () => {
  it('classifies semantics from the finite operation type, never client input', () => {
    expect(getArchitectureOperationClassification('module.create')).toBe('semantic')
    expect(getArchitectureOperationClassification('flow_node.move')).toBe('presentation')
    expect(getArchitectureOperationClassification('architecture.viewport.set')).toBe('presentation')

    const result = architectureCommandSchema.safeParse({
      projectId,
      changeSetId,
      expectedRevision: 0,
      operations: [
        {
          type: 'module.create',
          operationId,
          semantic: false,
          module: {
            id: moduleId,
            name: 'Booking',
            description: 'Book a time',
            domain: null,
            position: { x: 0, y: 0 },
            color: '#fff',
            entryPoints: [],
            exitPoints: [],
          },
        },
      ],
      architectureContent,
    })

    expect(result.success).toBe(false)
  })

  it('requires a complete Architecture snapshot for semantic work', () => {
    expect(
      architectureCommandSchema.safeParse({
        projectId,
        changeSetId,
        expectedRevision: 0,
        operations: [
          {
            type: 'module.create',
            operationId,
            module: {
              id: moduleId,
              name: 'Booking',
              description: 'Book a time',
              domain: null,
              position: { x: 0, y: 0 },
              color: '#fff',
              entryPoints: [],
              exitPoints: [],
            },
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('forbids semantic content on presentation-only work', () => {
    expect(
      architectureCommandSchema.safeParse({
        projectId,
        changeSetId,
        expectedRevision: 4,
        operations: [
          {
            type: 'module.move',
            operationId,
            moduleId,
            position: { x: 50, y: 80 },
          },
        ],
        architectureContent,
      }).success,
    ).toBe(false)
  })

  it('rejects duplicate operation IDs before reaching the database', () => {
    const result = architectureCommandSchema.safeParse({
      projectId,
      changeSetId,
      expectedRevision: 0,
      operations: [
        {
          type: 'module.move',
          operationId,
          moduleId,
          position: { x: 1, y: 2 },
        },
        {
          type: 'module.recolor',
          operationId,
          moduleId,
          color: '#112233',
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('accepts a presentation batch without an Architecture version payload', () => {
    const parsed = architectureCommandSchema.parse({
      projectId,
      changeSetId,
      expectedRevision: 4,
      operations: [
        {
          type: 'flow_node.move',
          operationId,
          nodeId: moduleId,
          position: { x: 50, y: 80 },
        },
      ],
    })

    expect(parsed).toEqual(expect.objectContaining({ projectId, expectedRevision: 4 }))
    expect(parsed).not.toHaveProperty('architectureContent')
  })

  it('accepts an atomic capability brief rewrite as a semantic module update', () => {
    const parsed = architectureCommandSchema.parse({
      projectId,
      changeSetId,
      expectedRevision: 4,
      operations: [
        {
          type: 'module.update',
          operationId,
          moduleId,
          changes: {
            responsibilities: ['Collect and validate appointment details'],
            boundaries: ['Does not decide payment policy'],
          },
        },
      ],
      architectureContent: {
        ...architectureContent,
        capabilities: [
          {
            ...architectureContent.capabilities[0],
            responsibilities: ['Collect and validate appointment details'],
            boundaries: ['Does not decide payment policy'],
          },
        ],
      },
    })

    expect(parsed.operations[0]).toMatchObject({
      type: 'module.update',
      changes: {
        responsibilities: ['Collect and validate appointment details'],
        boundaries: ['Does not decide payment policy'],
      },
    })
  })

  it('accepts a decision proposal with durable actor, reason, evidence, and readiness impact', () => {
    const parsed = architectureCommandSchema.parse({
      projectId,
      changeSetId,
      expectedRevision: 4,
      operations: [
        {
          type: 'decision.create',
          operationId,
          decision: {
            id: '55555555-5555-4555-8555-555555555555',
            category: 'Booking policy',
            statement: 'Hold a slot for ten minutes.',
            state: 'proposed',
            provenance: 'assistant',
            readinessImpact: 'non_blocking',
            supersedesDecisionId: null,
            actor: { type: 'assistant', label: 'MermaidAI assistant' },
            reason: 'Applied the common default and kept it visible for review.',
            evidence: [
              {
                type: 'chat_turn',
                reference: '66666666-6666-4666-8666-666666666666',
                summary: 'The brief did not specify a hold duration.',
              },
            ],
          },
        },
      ],
      architectureContent,
    })

    expect(parsed.operations[0]).toMatchObject({
      type: 'decision.create',
      decision: { readinessImpact: 'non_blocking' },
    })
  })

  it('rejects a decision transition without durable reason and evidence', () => {
    const result = architectureCommandSchema.safeParse({
      projectId,
      changeSetId,
      expectedRevision: 4,
      operations: [
        {
          type: 'decision.update',
          operationId,
          decisionId: '55555555-5555-4555-8555-555555555555',
          changes: {
            state: 'accepted',
            actor: { type: 'user', label: 'Project owner' },
          },
        },
      ],
      architectureContent,
    })

    expect(result.success).toBe(false)
  })
})
