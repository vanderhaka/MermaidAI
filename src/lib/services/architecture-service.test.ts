// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ArchitectureCommand, ArchitectureOperation } from '@/lib/schemas/planning-command'
import type { ChatTurnIdentity } from '@/types/chat'

vi.mock('server-only', () => ({}))

const { applyArchitectureCommandMock, listModulesByProjectMock } = vi.hoisted(() => ({
  applyArchitectureCommandMock: vi.fn(),
  listModulesByProjectMock: vi.fn(),
}))

vi.mock('@/lib/services/planning-command-service', () => ({
  applyArchitectureCommand: applyArchitectureCommandMock,
}))

vi.mock('@/lib/services/module-service', () => ({
  listModulesByProject: listModulesByProjectMock,
}))

import {
  buildInitialArchitectureCommand,
  captureArchitectureMap,
  captureArchitectureMapInputSchema,
} from '@/lib/services/architecture-service'

const projectId = '11111111-1111-4111-8111-111111111111'
const changeSetId = '22222222-2222-4222-8222-222222222222'
const turnId = '33333333-3333-4333-8333-333333333333'
const architectureVersionId = '44444444-4444-4444-8444-444444444444'
const now = '2026-09-02T00:00:00.000Z'

function operationId(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
}

const turnIdentity: ChatTurnIdentity = {
  turnId,
  userMessageKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  assistantMessageKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  changeSetId,
  expectedRevision: 0,
  operationIds: Array.from({ length: 64 }, (_, index) => operationId(index)),
  planningStage: 'architecture',
  artifactId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  artifactVersionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
}

const salonInput = {
  objective: 'Let a salon manage bookings from customer request through follow-up.',
  outcomes: [
    'Customers can book an available service time.',
    'Staff can deliver confirmed appointments without clashes.',
  ],
  actors: ['Customer', 'Salon staff'],
  modules: [
    {
      key: 'customers',
      name: 'Customer Profiles',
      domain: 'Customer experience',
      purpose: 'Keep the customer identity and contact details used during booking.',
      responsibilities: ['Identify the customer', 'Provide booking contact details'],
      boundaries: ['Does not decide staff availability'],
      entryPoints: ['customer details'],
      exitPoints: ['identified customer'],
    },
    {
      key: 'staff',
      name: 'Staff',
      domain: 'Salon operations',
      purpose: 'Represent the people who can deliver salon services.',
      responsibilities: ['Maintain service eligibility', 'Receive assigned appointments'],
      boundaries: ['Does not take customer payments'],
      entryPoints: ['staff updates'],
      exitPoints: ['eligible staff'],
    },
    {
      key: 'availability',
      name: 'Availability',
      domain: 'Scheduling',
      purpose: 'Expose service times that can actually be booked.',
      responsibilities: ['Combine working hours and existing commitments'],
      boundaries: ['Does not own the customer booking'],
      entryPoints: ['eligible staff'],
      exitPoints: ['available slot'],
    },
    {
      key: 'bookings',
      name: 'Bookings',
      domain: 'Scheduling',
      purpose: 'Own the appointment from request through confirmation.',
      responsibilities: ['Reserve a slot', 'Track booking status'],
      boundaries: ['Does not settle a deposit'],
      entryPoints: ['identified customer', 'available slot'],
      exitPoints: ['booking awaiting deposit', 'confirmed booking'],
    },
    {
      key: 'payments',
      name: 'Deposits and Payments',
      domain: 'Commerce',
      purpose: 'Record and settle money required to confirm appointments.',
      responsibilities: ['Collect a deposit', 'Report payment outcome'],
      boundaries: ['Does not select appointment times'],
      entryPoints: ['booking awaiting deposit'],
      exitPoints: ['deposit outcome'],
    },
    {
      key: 'communications',
      name: 'Communications',
      domain: 'Customer experience',
      purpose: 'Keep customers and staff informed about appointments.',
      responsibilities: ['Send confirmations', 'Send reminders and changes'],
      boundaries: ['Does not change booking state by itself'],
      entryPoints: ['confirmed booking'],
      exitPoints: ['customer notification'],
    },
  ],
  connections: [
    {
      sourceKey: 'customers',
      targetKey: 'bookings',
      description: 'An identified customer starts a booking.',
      sourceExitPoint: 'identified customer',
      targetEntryPoint: 'identified customer',
    },
    {
      sourceKey: 'staff',
      targetKey: 'availability',
      description: 'Eligible staff contribute working availability.',
      sourceExitPoint: 'eligible staff',
      targetEntryPoint: 'eligible staff',
    },
    {
      sourceKey: 'availability',
      targetKey: 'bookings',
      description: 'A valid slot can be reserved by a booking.',
      sourceExitPoint: 'available slot',
      targetEntryPoint: 'available slot',
    },
    {
      sourceKey: 'bookings',
      targetKey: 'payments',
      description: 'A booking requests its required deposit.',
      sourceExitPoint: 'booking awaiting deposit',
      targetEntryPoint: 'booking awaiting deposit',
    },
    {
      sourceKey: 'payments',
      targetKey: 'bookings',
      description: 'The deposit outcome determines confirmation.',
      sourceExitPoint: 'deposit outcome',
      targetEntryPoint: 'deposit outcome',
    },
    {
      sourceKey: 'bookings',
      targetKey: 'communications',
      description: 'A confirmed booking triggers customer and staff communication.',
      sourceExitPoint: 'confirmed booking',
      targetEntryPoint: 'confirmed booking',
    },
  ],
  importantFlows: [
    {
      key: 'customer-books',
      actor: 'Customer',
      outcome: 'Book an available service and receive confirmation.',
      capabilityKeys: ['customers', 'availability', 'bookings', 'payments', 'communications'],
    },
    {
      key: 'staff-delivers',
      actor: 'Salon staff',
      outcome: 'See confirmed appointments without scheduling clashes.',
      capabilityKeys: ['staff', 'availability', 'bookings', 'communications'],
    },
  ],
  assumptions: [
    {
      category: 'Booking policy',
      statement: 'A deposit is required before a booking is confirmed.',
    },
  ],
  questions: [
    {
      section: 'Deposits and Payments',
      question: 'What deposit rule should apply when a customer reschedules?',
      readinessImpact: 'blocking' as const,
      relatedModuleKey: 'payments',
    },
  ],
}

function committedAfter(operation: ArchitectureOperation): Record<string, unknown> {
  switch (operation.type) {
    case 'module.create':
      return {
        modules: [
          {
            id: operation.module.id,
            project_id: projectId,
            domain: operation.module.domain,
            name: operation.module.name,
            description: operation.module.description,
            prd_content: '',
            position_x: operation.module.position.x,
            position_y: operation.module.position.y,
            color: operation.module.color,
            entry_points: operation.module.entryPoints,
            exit_points: operation.module.exitPoints,
            created_at: now,
            updated_at: now,
          },
        ],
      }
    case 'module_connection.create':
      return {
        module_connections: [
          {
            id: operation.connection.id,
            project_id: projectId,
            source_module_id: operation.connection.sourceModuleId,
            target_module_id: operation.connection.targetModuleId,
            source_exit_point: operation.connection.sourceExitPoint,
            target_entry_point: operation.connection.targetEntryPoint,
            created_at: now,
          },
        ],
      }
    case 'flow_node.create':
      return {
        flow_nodes: [
          {
            id: operation.node.id,
            module_id: operation.node.moduleId,
            node_type: operation.node.nodeType,
            label: operation.node.label,
            pseudocode: operation.node.pseudocode,
            position_x: operation.node.position.x,
            position_y: operation.node.position.y,
            color: operation.node.color,
            created_at: now,
            updated_at: now,
          },
        ],
      }
    case 'question.create':
      return {
        open_questions: [
          {
            id: operation.question.id,
            project_id: projectId,
            node_id: operation.question.nodeId,
            section: operation.question.section,
            question: operation.question.question,
            status: 'open',
            resolution: null,
            readiness_impact: operation.question.readinessImpact,
            provenance: operation.question.provenance,
            created_at: now,
            resolved_at: null,
          },
        ],
      }
    case 'decision.create':
      return {
        planning_decisions: [
          {
            ...operation.decision,
            project_id: projectId,
            created_at: now,
            updated_at: now,
          },
        ],
      }
    default:
      throw new Error(`Unexpected operation in fixture: ${operation.type}`)
  }
}

function makeCommittedReceipt(command: ArchitectureCommand) {
  return {
    changeSetId: command.changeSetId,
    projectId: command.projectId,
    expectedRevision: command.expectedRevision,
    committedRevision: command.expectedRevision + 1,
    semantic: true,
    previousArchitectureVersionId: null,
    architectureVersionId,
    operations: command.operations.map((operation, sequence) => ({
      operationId: operation.operationId,
      sequence,
      type: operation.type,
      semantic: true,
      before: null,
      after: committedAfter(operation),
    })),
    summary: {},
    replayed: false,
  }
}

describe('captureArchitectureMapInputSchema', () => {
  it('rejects duplicate local keys, missing references, self-links, and unjustified islands', () => {
    const duplicate = structuredClone(salonInput)
    duplicate.modules[1].key = duplicate.modules[0].key
    expect(captureArchitectureMapInputSchema.safeParse(duplicate).success).toBe(false)

    const missingReference = structuredClone(salonInput)
    missingReference.connections[0].targetKey = 'missing'
    expect(captureArchitectureMapInputSchema.safeParse(missingReference).success).toBe(false)

    const selfLink = structuredClone(salonInput)
    selfLink.connections[0].targetKey = selfLink.connections[0].sourceKey
    expect(captureArchitectureMapInputSchema.safeParse(selfLink).success).toBe(false)

    const island = structuredClone(salonInput)
    island.modules.push({
      key: 'reporting',
      name: 'Reporting',
      domain: 'Operations',
      purpose: 'Summarise salon performance.',
      responsibilities: ['Summarise operational outcomes'],
      boundaries: ['Does not operate bookings'],
      entryPoints: [],
      exitPoints: [],
    })
    expect(captureArchitectureMapInputSchema.safeParse(island).success).toBe(false)
  })

  it('allows an explicitly justified disconnected capability', () => {
    const input = structuredClone(salonInput)
    ;(input.modules as Array<Record<string, unknown>>).push({
      key: 'external-accounting',
      name: 'External Accounting',
      domain: 'External system',
      purpose: 'Represent a later accounting boundary.',
      responsibilities: ['Mark the future accounting boundary'],
      boundaries: ['No integration is in the first release'],
      entryPoints: [],
      exitPoints: [],
      disconnectedJustification: 'Accounting integration is explicitly outside the first release.',
    })

    expect(captureArchitectureMapInputSchema.safeParse(input).success).toBe(true)
  })

  it('rejects multiple internally connected but mutually disconnected capability groups', () => {
    const input = structuredClone(salonInput)
    input.connections = [
      input.connections[0],
      input.connections[3],
      input.connections[4],
      input.connections[1],
      {
        sourceKey: 'availability',
        targetKey: 'communications',
        description: 'Availability triggers an operational notice.',
        sourceExitPoint: 'available slot',
        targetEntryPoint: 'available slot',
      },
      {
        sourceKey: 'communications',
        targetKey: 'staff',
        description: 'Operational notices reach staff.',
        sourceExitPoint: 'customer notification',
        targetEntryPoint: 'staff updates',
      },
    ]

    expect(captureArchitectureMapInputSchema.safeParse(input).success).toBe(false)
  })
})

describe('captureArchitectureMap', () => {
  beforeEach(() => {
    applyArchitectureCommandMock.mockReset()
    listModulesByProjectMock.mockReset()
    listModulesByProjectMock.mockResolvedValue({ success: true, data: [] })
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => ({
      success: true,
      data: makeCommittedReceipt(command),
    }))
  })

  it('maps a complete salon Architecture into one ordered atomic command and committed payload', async () => {
    const result = await captureArchitectureMap({
      projectId,
      turnIdentity,
      startingSequence: 0,
      input: salonInput,
    })

    expect(result.success).toBe(true)
    expect(applyArchitectureCommandMock).toHaveBeenCalledTimes(1)

    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command).toMatchObject({ projectId, changeSetId, turnId, expectedRevision: 0 })
    expect(command.operations.map((operation) => operation.type)).toEqual([
      ...Array(6).fill('module.create'),
      ...Array(6).fill('module_connection.create'),
      'decision.create',
      'flow_node.create',
      'question.create',
    ])
    expect(command.operations.map((operation) => operation.operationId)).toEqual(
      turnIdentity.operationIds.slice(0, 15),
    )
    expect(command.architectureContent?.capabilities.map((capability) => capability.name)).toEqual([
      'Customer Profiles',
      'Staff',
      'Availability',
      'Bookings',
      'Deposits and Payments',
      'Communications',
    ])
    expect(command.architectureContent?.connections).toHaveLength(6)
    expect(command.architectureContent?.assumptions).toHaveLength(1)
    expect(command.architectureContent?.blockers).toEqual([
      expect.objectContaining({
        statement: 'What deposit rule should apply when a customer reschedules?',
      }),
    ])

    if (!result.success) throw new Error(result.error)
    expect(result.data.modules).toHaveLength(6)
    expect(result.data.connections).toHaveLength(6)
    expect(result.data.nodes).toHaveLength(1)
    expect(result.data.questions).toHaveLength(1)
    expect(result.data.consumedOperationCount).toBe(15)
    expect(result.data.chatReceipt).toEqual(
      expect.objectContaining({
        operationId: turnIdentity.operationIds[0],
        sequence: 0,
        status: 'committed',
        committedRevision: 1,
        artifactVersionId: architectureVersionId,
      }),
    )
  })

  it('uses deterministic standards-compliant UUIDs for replay-stable entities', async () => {
    await captureArchitectureMap({
      projectId,
      turnIdentity,
      startingSequence: 0,
      input: salonInput,
    })
    const firstCommand = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand

    await captureArchitectureMap({
      projectId,
      turnIdentity,
      startingSequence: 0,
      input: salonInput,
    })
    const secondCommand = applyArchitectureCommandMock.mock.calls[1][0] as ArchitectureCommand

    const entityIds = (command: ArchitectureCommand) =>
      command.operations.map((operation) => {
        if (operation.type === 'module.create') return operation.module.id
        if (operation.type === 'module_connection.create') return operation.connection.id
        if (operation.type === 'flow_node.create') return operation.node.id
        if (operation.type === 'question.create') return operation.question.id
        if (operation.type === 'decision.create') return operation.decision.id
        throw new Error(`Unexpected operation: ${operation.type}`)
      })

    expect(entityIds(secondCommand)).toEqual(entityIds(firstCommand))
    for (const id of entityIds(firstCommand)) expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('protects an existing map at runtime before invoking the command boundary', async () => {
    listModulesByProjectMock.mockResolvedValue({
      success: true,
      data: [{ id: 'existing-module' }],
    })

    const result = await captureArchitectureMap({
      projectId,
      turnIdentity,
      startingSequence: 0,
      input: salonInput,
    })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('existing Architecture'),
    })
    expect(applyArchitectureCommandMock).not.toHaveBeenCalled()
  })

  it('returns no graph payload when the atomic command fails', async () => {
    applyArchitectureCommandMock.mockResolvedValue({ success: false, error: 'revision conflict' })

    const result = await captureArchitectureMap({
      projectId,
      turnIdentity,
      startingSequence: 0,
      input: salonInput,
    })

    expect(result).toEqual({ success: false, error: 'revision conflict' })
  })

  it('keeps non-blocking questions out of Architecture blockers', async () => {
    const input = {
      ...structuredClone(salonInput),
      questions: [
        {
          ...structuredClone(salonInput.questions[0]),
          readinessImpact: 'non_blocking' as const,
        },
      ],
    }

    await captureArchitectureMap({ projectId, turnIdentity, startingSequence: 0, input })

    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command.architectureContent?.blockers).toEqual([])
  })
})

describe('buildInitialArchitectureCommand', () => {
  it('builds the same complete command for every retry of one frozen handoff', () => {
    const input = {
      projectId,
      changeSetId,
      turnId,
      expectedRevision: 0,
      capture: salonInput,
    }

    const first = buildInitialArchitectureCommand(input)
    const retry = buildInitialArchitectureCommand(input)

    expect(first.success).toBe(true)
    expect(retry).toEqual(first)
    if (!first.success) throw new Error(first.error)
    expect(first.data.operations).toHaveLength(15)
    expect(first.data.architectureContent?.capabilities).toHaveLength(6)
    expect(first.data.operations.every((operation) => zUuid(operation.operationId))).toBe(true)
  })

  it('rejects malformed generated capture before creating a command', () => {
    expect(
      buildInitialArchitectureCommand({
        projectId,
        changeSetId,
        turnId,
        expectedRevision: 0,
        capture: { ...salonInput, outcomes: [] },
      }),
    ).toEqual({ success: false, error: expect.stringContaining('Invalid Architecture capture') })
  })
})

function zUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
