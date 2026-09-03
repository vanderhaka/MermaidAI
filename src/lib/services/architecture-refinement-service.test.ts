// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  applyArchitectureCommandMock,
  getActivePlanningArtifactVersionMock,
  listConnectionsByProjectMock,
  getGraphForModuleMock,
  listModulesByProjectMock,
  listOpenOpenQuestionsMock,
  listPlanningDecisionsMock,
} = vi.hoisted(() => ({
  applyArchitectureCommandMock: vi.fn(),
  getActivePlanningArtifactVersionMock: vi.fn(),
  listConnectionsByProjectMock: vi.fn(),
  getGraphForModuleMock: vi.fn(),
  listModulesByProjectMock: vi.fn(),
  listOpenOpenQuestionsMock: vi.fn(),
  listPlanningDecisionsMock: vi.fn(),
}))

vi.mock('@/lib/services/planning-command-service', () => ({
  applyArchitectureCommand: (...args: unknown[]) => applyArchitectureCommandMock(...args),
}))
vi.mock('@/lib/services/planning-artifact-service', () => ({
  getActivePlanningArtifactVersion: (...args: unknown[]) =>
    getActivePlanningArtifactVersionMock(...args),
}))
vi.mock('@/lib/services/module-service', () => ({
  listModulesByProject: (...args: unknown[]) => listModulesByProjectMock(...args),
}))
vi.mock('@/lib/services/module-connection-service', () => ({
  listConnectionsByProject: (...args: unknown[]) => listConnectionsByProjectMock(...args),
}))
vi.mock('@/lib/services/open-question-service', () => ({
  listOpenOpenQuestions: (...args: unknown[]) => listOpenOpenQuestionsMock(...args),
}))
vi.mock('@/lib/services/planning-decision-service', () => ({
  listPlanningDecisions: (...args: unknown[]) => listPlanningDecisionsMock(...args),
}))
vi.mock('@/lib/services/graph-service', () => ({
  getGraphForModule: (...args: unknown[]) => getGraphForModuleMock(...args),
}))

import { applyArchitectureRefinement } from '@/lib/services/architecture-refinement-service'
import type { ArchitectureCommand } from '@/lib/schemas/planning-command'
import type { Module } from '@/types/graph'

const projectId = '11111111-1111-4111-8111-111111111111'
const sourceModuleId = '22222222-2222-4222-8222-222222222222'
const targetModuleId = '33333333-3333-4333-8333-333333333333'
const changeSetId = '44444444-4444-4444-8444-444444444444'
const turnId = '55555555-5555-4555-8555-555555555555'
const artifactVersionId = '66666666-6666-4666-8666-666666666666'
const committedArtifactVersionId = '77777777-7777-4777-8777-777777777777'
const operationIds = [
  '88888888-8888-4888-8888-888888888881',
  '88888888-8888-4888-8888-888888888882',
  '88888888-8888-4888-8888-888888888883',
]

const sourceModule: Module = {
  id: sourceModuleId,
  project_id: projectId,
  domain: 'Customers',
  name: 'Customers',
  description: 'Owns customer identity.',
  prd_content: '',
  position: { x: 0, y: 0 },
  color: '#111827',
  entry_points: [],
  exit_points: [],
  created_at: '2026-09-02T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
}

const targetModule = {
  ...sourceModule,
  id: targetModuleId,
  domain: 'Bookings',
  name: 'Bookings',
  description: 'Coordinates bookings.',
  position: { x: 320, y: 0 },
}

const architectureContent = {
  objective: 'Coordinate customer bookings.',
  outcomes: ['Customers can complete a booking.'],
  actors: ['Customer'],
  capabilities: [
    {
      id: sourceModuleId,
      name: 'Customers',
      purpose: 'Own customer identity.',
      responsibilities: ['Maintain customer identity.'],
      boundaries: ['Does not coordinate bookings.'],
    },
    {
      id: targetModuleId,
      name: 'Bookings',
      purpose: 'Coordinate bookings.',
      responsibilities: ['Manage booking lifecycle.'],
      boundaries: ['Does not own customer identity.'],
    },
  ],
  connections: [],
  important_flows: [
    {
      id: 'booking-flow',
      actor: 'Customer',
      outcome: 'A booking is created.',
      capability_ids: [sourceModuleId, targetModuleId],
    },
  ],
  assumptions: [],
  blockers: [],
}

function turnIdentity(ids = operationIds) {
  return {
    turnId,
    userMessageKey: '99999999-9999-4999-8999-999999999991',
    assistantMessageKey: '99999999-9999-4999-8999-999999999992',
    changeSetId,
    expectedRevision: 3,
    operationIds: ids,
    planningStage: 'architecture' as const,
    artifactId: '99999999-9999-4999-8999-999999999993',
    artifactVersionId,
  }
}

function moduleRow(module: typeof sourceModule) {
  return {
    id: module.id,
    project_id: module.project_id,
    domain: module.domain,
    name: module.name,
    description: module.description,
    prd_content: module.prd_content,
    position_x: module.position.x,
    position_y: module.position.y,
    color: module.color,
    entry_points: module.entry_points,
    exit_points: module.exit_points,
    created_at: module.created_at,
    updated_at: module.updated_at,
  }
}

function nodeRow(id: string, label: string) {
  return {
    id,
    module_id: sourceModuleId,
    node_type: 'process',
    label,
    pseudocode: '',
    position_x: 0,
    position_y: 0,
    color: '#2563eb',
    created_at: '2026-09-02T00:00:00.000Z',
    updated_at: '2026-09-02T00:00:00.000Z',
  }
}

function graphNode(id: string, label: string) {
  return {
    id,
    module_id: sourceModuleId,
    node_type: 'process' as const,
    label,
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '#2563eb',
    created_at: '2026-09-02T00:00:00.000Z',
    updated_at: '2026-09-02T00:00:00.000Z',
  }
}

function edgeRow(id: string, sourceNodeId: string, targetNodeId: string) {
  return {
    id,
    module_id: sourceModuleId,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    label: null,
    condition: null,
    created_at: '2026-09-02T00:00:00.000Z',
  }
}

function committedReceipt(command: ArchitectureCommand, after: unknown[]) {
  return {
    changeSetId,
    projectId,
    expectedRevision: 3,
    committedRevision: 4,
    semantic: true,
    previousArchitectureVersionId: artifactVersionId,
    architectureVersionId: committedArtifactVersionId,
    operations: command.operations.map((operation, sequence) => ({
      operationId: operation.operationId,
      sequence,
      type: operation.type,
      semantic: true,
      before: {},
      after: after[sequence] ?? {},
    })),
    summary: {},
    replayed: false,
  }
}

describe('applyArchitectureRefinement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getActivePlanningArtifactVersionMock.mockResolvedValue({
      success: true,
      data: { id: artifactVersionId, content_state: 'complete', content: architectureContent },
    })
    listModulesByProjectMock.mockResolvedValue({
      success: true,
      data: [sourceModule, targetModule],
    })
    listConnectionsByProjectMock.mockResolvedValue({ success: true, data: [] })
    listOpenOpenQuestionsMock.mockResolvedValue({ success: true, data: [] })
    listPlanningDecisionsMock.mockResolvedValue({ success: true, data: [] })
  })

  it('creates one capability through one expected-revision command and returns only its committed row', async () => {
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => {
      const created = command.operations[0]
      if (created.type !== 'module.create') throw new Error('unexpected operation')
      return {
        success: true,
        data: committedReceipt(command, [
          {
            modules: [
              moduleRow({
                ...sourceModule,
                id: created.module.id,
                domain: 'Payments',
                name: 'Payments',
                description: 'Owns deposits.',
                position: { x: 640, y: 0 },
              }),
            ],
          },
        ]),
      }
    })

    const result = await applyArchitectureRefinement({
      projectId,
      turnIdentity: turnIdentity([operationIds[0]]),
      startingSequence: 0,
      toolName: 'create_module',
      input: { name: 'Payments', domain: 'Payments', description: 'Owns deposits.' },
    })

    expect(result).toMatchObject({ success: true })
    expect(applyArchitectureCommandMock).toHaveBeenCalledTimes(1)
    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command).toEqual(
      expect.objectContaining({
        projectId,
        changeSetId,
        turnId,
        expectedRevision: 3,
        operations: [
          expect.objectContaining({ operationId: operationIds[0], type: 'module.create' }),
        ],
      }),
    )
    expect(command.architectureContent?.capabilities.map((item) => item.name)).toEqual([
      'Customers',
      'Bookings',
      'Payments',
    ])
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        module: expect.objectContaining({ name: 'Payments' }),
        consumedOperationCount: 1,
        chatReceipt: expect.objectContaining({
          status: 'committed',
          expectedRevision: 3,
          committedRevision: 4,
        }),
      }),
    })
  })

  it('adds missing handles and a connection in one atomic three-operation command', async () => {
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => {
      const updatedSource = { ...sourceModule, exit_points: ['customer_id'] }
      const updatedTarget = { ...targetModule, entry_points: ['customer_id'] }
      const connectionOperation = command.operations[2]
      if (connectionOperation.type !== 'module_connection.create') {
        throw new Error('unexpected operation')
      }
      return {
        success: true,
        data: committedReceipt(command, [
          { modules: [moduleRow(updatedSource)] },
          { modules: [moduleRow(updatedTarget)] },
          {
            module_connections: [
              {
                id: connectionOperation.connection.id,
                project_id: projectId,
                source_module_id: sourceModuleId,
                target_module_id: targetModuleId,
                source_exit_point: 'customer_id',
                target_entry_point: 'customer_id',
                created_at: '2026-09-02T00:01:00.000Z',
              },
            ],
          },
        ]),
      }
    })

    const result = await applyArchitectureRefinement({
      projectId,
      turnIdentity: turnIdentity(),
      startingSequence: 0,
      toolName: 'connect_modules',
      input: {
        sourceModuleId,
        targetModuleId,
        sourceExitPoint: 'customer_id',
        targetEntryPoint: 'customer_id',
      },
    })

    expect(applyArchitectureCommandMock).toHaveBeenCalledTimes(1)
    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command.operations.map((operation) => operation.type)).toEqual([
      'module.update',
      'module.update',
      'module_connection.create',
    ])
    expect(command.operations.map((operation) => operation.operationId)).toEqual(operationIds)
    expect(command.architectureContent?.connections).toEqual([
      expect.objectContaining({
        from_capability_id: sourceModuleId,
        to_capability_id: targetModuleId,
      }),
    ])
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        sourceModule: expect.objectContaining({ exit_points: ['customer_id'] }),
        targetModule: expect.objectContaining({ entry_points: ['customer_id'] }),
        connection: expect.objectContaining({ source_module_id: sourceModuleId }),
        consumedOperationCount: 3,
      }),
    })
  })

  it('creates and connects a new capability in one atomic map refinement', async () => {
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => {
      const createModule = command.operations[0]
      const updateSource = command.operations[1]
      const createConnection = command.operations[2]
      if (
        createModule.type !== 'module.create' ||
        updateSource.type !== 'module.update' ||
        createConnection.type !== 'module_connection.create'
      ) {
        throw new Error('unexpected operations')
      }
      return {
        success: true,
        data: committedReceipt(command, [
          {
            modules: [
              moduleRow({
                ...sourceModule,
                id: createModule.module.id,
                domain: 'Communications',
                name: 'Notifications',
                description: 'Owns customer notifications.',
                position: createModule.module.position,
                entry_points: ['booking_confirmed'],
              }),
            ],
          },
          { modules: [moduleRow({ ...sourceModule, exit_points: ['booking_confirmed'] })] },
          {
            module_connections: [
              {
                id: createConnection.connection.id,
                project_id: projectId,
                source_module_id: sourceModuleId,
                target_module_id: createModule.module.id,
                source_exit_point: 'booking_confirmed',
                target_entry_point: 'booking_confirmed',
                created_at: '2026-09-02T00:01:00.000Z',
              },
            ],
          },
        ]),
      }
    })

    const result = await applyArchitectureRefinement({
      projectId,
      turnIdentity: turnIdentity(),
      startingSequence: 0,
      toolName: 'refine_architecture_map',
      input: {
        createModules: [
          {
            key: 'notifications',
            name: 'Notifications',
            domain: 'Communications',
            description: 'Owns customer notifications.',
            entryPoints: [],
            exitPoints: [],
          },
        ],
        updateModules: [],
        deleteModuleIds: [],
        connectModules: [
          {
            source: sourceModuleId,
            target: 'notifications',
            sourceExitPoint: 'booking_confirmed',
            targetEntryPoint: 'booking_confirmed',
          },
        ],
        disconnectModules: [],
      },
    })

    expect(applyArchitectureCommandMock).toHaveBeenCalledTimes(1)
    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command.operations.map((operation) => operation.type)).toEqual([
      'module.create',
      'module.update',
      'module_connection.create',
    ])
    expect(command.operations.map((operation) => operation.operationId)).toEqual(operationIds)
    expect(command.architectureContent?.capabilities.map((capability) => capability.name)).toEqual([
      'Customers',
      'Bookings',
      'Notifications',
    ])
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        createdModules: [expect.objectContaining({ name: 'Notifications' })],
        updatedModules: [expect.objectContaining({ id: sourceModuleId })],
        createdConnections: [expect.objectContaining({ source_module_id: sourceModuleId })],
        consumedOperationCount: 3,
      }),
    })
  })

  it('returns no optimistic rows when the atomic command fails', async () => {
    applyArchitectureCommandMock.mockResolvedValue({ success: false, error: 'revision conflict' })

    await expect(
      applyArchitectureRefinement({
        projectId,
        turnIdentity: turnIdentity([operationIds[0]]),
        startingSequence: 0,
        toolName: 'update_module',
        input: { moduleId: sourceModuleId, name: 'Customer Accounts' },
      }),
    ).resolves.toEqual({ success: false, error: 'revision conflict' })
  })

  it('closes Architecture readiness gaps with exact questions, decisions, and actor flows in one command', async () => {
    const questionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const decisionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
    const ids = Array.from(
      { length: 7 },
      (_, index) => `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, '0')}`,
    )
    getActivePlanningArtifactVersionMock.mockResolvedValue({
      success: true,
      data: {
        id: artifactVersionId,
        content_state: 'complete',
        content: {
          ...architectureContent,
          actors: ['Customer and staff'],
          assumptions: [{ id: decisionId, statement: 'Any staff member may approve a booking.' }],
          blockers: [{ id: questionId, statement: 'Who can approve a booking?' }],
        },
      },
    })
    listOpenOpenQuestionsMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: questionId,
          status: 'open',
          section: 'Approval',
          artifact_version_id: artifactVersionId,
        },
      ],
    })
    listPlanningDecisionsMock.mockResolvedValue({
      success: true,
      data: [{ id: decisionId, state: 'accepted', artifact_version_id: artifactVersionId }],
    })
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => ({
      success: true,
      data: committedReceipt(
        command,
        command.operations.map((operation) =>
          operation.type === 'module.update' ? { modules: [moduleRow(targetModule)] } : {},
        ),
      ),
    }))

    const result = await applyArchitectureRefinement({
      projectId,
      authenticatedUserId: '99999999-9999-4999-8999-999999999999',
      turnIdentity: turnIdentity(ids),
      startingSequence: 0,
      toolName: 'refine_architecture_map',
      latestUserMessage:
        'A customer requests it, staff reviews it, and one account owner gives final approval.',
      input: {
        actors: ['Customer', 'Staff', 'Account owner'],
        importantFlows: [
          {
            key: 'customer-request',
            actor: 'Customer',
            outcome: 'A booking request is submitted.',
            capabilityRefs: [sourceModuleId, targetModuleId],
          },
          {
            key: 'staff-review',
            actor: 'Staff',
            outcome: 'A booking request is reviewed.',
            capabilityRefs: [targetModuleId],
          },
          {
            key: 'owner-approval',
            actor: 'Account owner',
            outcome: 'A booking request is approved.',
            capabilityRefs: [targetModuleId],
          },
        ],
        createModules: [],
        updateModules: [
          {
            moduleId: targetModuleId,
            responsibilities: ['Coordinate review and final approval.'],
            boundaries: ['Does not own customer identity or notification delivery.'],
          },
        ],
        deleteModuleIds: [],
        connectModules: [],
        disconnectModules: [],
        resolveQuestions: [
          {
            questionId,
            resolution: 'One account owner gives final approval.',
            supersedesDecisionId: decisionId,
          },
        ],
        decisionActions: [],
        recordDecisions: [
          {
            key: 'staff-review-required',
            category: 'Approval',
            statement: 'Staff review is required before final approval.',
            provenance: 'user',
            readinessImpact: 'non_blocking',
            reason: 'The project owner defined the approval flow.',
          },
        ],
      },
    })

    expect(result).toMatchObject({ success: true })
    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command.operations.map((operation) => operation.type)).toEqual([
      'module.update',
      'decision.update',
      'question.resolve',
      'decision.create',
      'decision.update',
      'decision.create',
      'decision.update',
    ])
    expect(command.operations.map((operation) => operation.operationId)).toEqual(ids)
    expect(command.operations[1]).toEqual(
      expect.objectContaining({
        type: 'decision.update',
        decisionId,
        changes: expect.objectContaining({ state: 'superseded' }),
      }),
    )
    expect(command.operations[4]).toEqual(
      expect.objectContaining({
        type: 'decision.update',
        changes: expect.objectContaining({
          state: 'accepted',
          actor: expect.objectContaining({
            type: 'user',
            userId: '99999999-9999-4999-8999-999999999999',
          }),
          evidence: expect.any(Array),
        }),
      }),
    )
    expect(command.architectureContent).toEqual(
      expect.objectContaining({
        actors: ['Customer', 'Staff', 'Account owner'],
        important_flows: [
          expect.objectContaining({ actor: 'Customer' }),
          expect.objectContaining({ actor: 'Staff' }),
          expect.objectContaining({ actor: 'Account owner' }),
        ],
        capabilities: expect.arrayContaining([
          expect.objectContaining({
            id: targetModuleId,
            responsibilities: ['Coordinate review and final approval.'],
            boundaries: ['Does not own customer identity or notification delivery.'],
          }),
        ]),
        blockers: [],
        assumptions: [
          expect.objectContaining({ statement: 'One account owner gives final approval.' }),
          expect.objectContaining({ statement: 'Staff review is required before final approval.' }),
        ],
      }),
    )
  })

  it('rejects a high-level brief rewrite that has no durable capability or planning input change', async () => {
    await expect(
      applyArchitectureRefinement({
        projectId,
        turnIdentity: turnIdentity(),
        startingSequence: 0,
        toolName: 'refine_architecture_map',
        input: { actors: ['Customer', 'Staff'] },
      }),
    ).resolves.toEqual({
      success: false,
      error:
        'A brief-only rewrite is not enough. Include the capability, question, or decision change that justifies it.',
    })
    expect(applyArchitectureCommandMock).not.toHaveBeenCalled()
  })

  it('links an existing current decision as the replacement without duplicating it', async () => {
    const oldDecisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const replacementDecisionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
    const ids = ['cccccccc-cccc-4ccc-8ccc-000000000001', 'cccccccc-cccc-4ccc-8ccc-000000000002']
    getActivePlanningArtifactVersionMock.mockResolvedValue({
      success: true,
      data: {
        id: artifactVersionId,
        content_state: 'complete',
        content: {
          ...architectureContent,
          assumptions: [
            { id: oldDecisionId, statement: 'Notification recipients remain open.' },
            {
              id: replacementDecisionId,
              statement: 'Notify the client on upload and the agency on comments.',
            },
          ],
        },
      },
    })
    listPlanningDecisionsMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: oldDecisionId,
          state: 'accepted',
          artifact_version_id: artifactVersionId,
          supersedes_decision_id: null,
        },
        {
          id: replacementDecisionId,
          state: 'accepted',
          artifact_version_id: artifactVersionId,
          supersedes_decision_id: null,
        },
      ],
    })
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => ({
      success: true,
      data: committedReceipt(
        command,
        command.operations.map(() => ({})),
      ),
    }))

    const result = await applyArchitectureRefinement({
      projectId,
      authenticatedUserId: '99999999-9999-4999-8999-999999999999',
      turnIdentity: turnIdentity(ids),
      startingSequence: 0,
      toolName: 'refine_architecture_map',
      latestUserMessage: 'Use the exact notification recipients we already confirmed.',
      input: {
        createModules: [],
        updateModules: [],
        deleteModuleIds: [],
        connectModules: [],
        disconnectModules: [],
        resolveQuestions: [],
        decisionActions: [],
        decisionReplacements: [
          {
            decisionId: replacementDecisionId,
            supersedesDecisionId: oldDecisionId,
            reason: 'The later accepted decision contains the exact confirmed recipients.',
          },
        ],
        recordDecisions: [],
      },
    })

    expect(result).toMatchObject({ success: true })
    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command.operations).toEqual([
      expect.objectContaining({
        operationId: ids[0],
        type: 'decision.update',
        decisionId: oldDecisionId,
        changes: expect.objectContaining({ state: 'superseded' }),
      }),
      expect.objectContaining({
        operationId: ids[1],
        type: 'decision.update',
        decisionId: replacementDecisionId,
        changes: expect.objectContaining({ supersedesDecisionId: oldDecisionId }),
      }),
    ])
    expect(command.architectureContent?.assumptions).toEqual([
      {
        id: replacementDecisionId,
        statement: 'Notify the client on upload and the agency on comments.',
      },
    ])
  })

  it('refuses user-confirmed planning mutations without authenticated owner identity', async () => {
    const questionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    listOpenOpenQuestionsMock.mockResolvedValue({
      success: true,
      data: [
        {
          id: questionId,
          status: 'open',
          section: 'Approval',
          artifact_version_id: artifactVersionId,
        },
      ],
    })

    await expect(
      applyArchitectureRefinement({
        projectId,
        turnIdentity: turnIdentity(),
        startingSequence: 0,
        toolName: 'refine_architecture_map',
        input: {
          createModules: [],
          updateModules: [],
          deleteModuleIds: [],
          connectModules: [],
          disconnectModules: [],
          resolveQuestions: [{ questionId, resolution: 'One owner gives final approval.' }],
          decisionActions: [],
          recordDecisions: [],
        },
      }),
    ).resolves.toEqual({
      success: false,
      error:
        'Authenticated project-owner identity is required to resolve questions or confirm decisions.',
    })
    expect(applyArchitectureCommandMock).not.toHaveBeenCalled()
  })

  it('creates a detailed flow node through the same revision-checked boundary', async () => {
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => {
      const operation = command.operations[0]
      if (operation.type !== 'flow_node.create') throw new Error('unexpected operation')
      return {
        success: true,
        data: committedReceipt(command, [
          { flow_nodes: [nodeRow(operation.node.id, operation.node.label)] },
        ]),
      }
    })

    const result = await applyArchitectureRefinement({
      projectId,
      turnIdentity: turnIdentity([operationIds[0]]),
      startingSequence: 0,
      toolName: 'create_node',
      input: { moduleId: sourceModuleId, label: 'Validate customer', nodeType: 'process' },
    })

    expect(result.success).toBe(true)
    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command.operations).toEqual([
      expect.objectContaining({ operationId: operationIds[0], type: 'flow_node.create' }),
    ])
    expect(command.architectureContent).toEqual(architectureContent)
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        node: expect.objectContaining({ label: 'Validate customer' }),
        consumedOperationCount: 1,
      }),
    })
  })

  it('enriches a blank staged route instead of creating a parallel edge', async () => {
    const sourceNodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const targetNodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    const existingEdgeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
    getGraphForModuleMock.mockResolvedValue({
      success: true,
      data: {
        nodes: [graphNode(sourceNodeId, 'Start'), graphNode(targetNodeId, 'Finish')],
        edges: [edgeRow(existingEdgeId, sourceNodeId, targetNodeId)],
      },
    })
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => ({
      success: true,
      data: committedReceipt(command, [
        {
          flow_edges: [
            {
              ...edgeRow(existingEdgeId, sourceNodeId, targetNodeId),
              label: 'Proceed',
            },
          ],
        },
      ]),
    }))

    const result = await applyArchitectureRefinement({
      projectId,
      turnIdentity: turnIdentity([operationIds[0]]),
      startingSequence: 0,
      toolName: 'create_edge',
      input: {
        moduleId: sourceModuleId,
        sourceNodeId,
        targetNodeId,
        label: 'Proceed',
      },
    })

    expect(result.success).toBe(true)
    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command.operations).toEqual([
      expect.objectContaining({
        type: 'flow_edge.update',
        edgeId: existingEdgeId,
        changes: { label: 'Proceed' },
      }),
    ])
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        edge: expect.objectContaining({ id: existingEdgeId, label: 'Proceed' }),
      }),
    })
  })

  it('creates a connected flow in one atomic locally keyed refinement', async () => {
    getGraphForModuleMock.mockResolvedValue({ success: true, data: { nodes: [], edges: [] } })
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => {
      const firstNode = command.operations[0]
      const secondNode = command.operations[1]
      const edge = command.operations[2]
      if (
        firstNode.type !== 'flow_node.create' ||
        secondNode.type !== 'flow_node.create' ||
        edge.type !== 'flow_edge.create'
      ) {
        throw new Error('unexpected operations')
      }
      return {
        success: true,
        data: committedReceipt(command, [
          { flow_nodes: [nodeRow(firstNode.node.id, firstNode.node.label)] },
          { flow_nodes: [nodeRow(secondNode.node.id, secondNode.node.label)] },
          {
            flow_edges: [edgeRow(edge.edge.id, edge.edge.sourceNodeId, edge.edge.targetNodeId)],
          },
        ]),
      }
    })

    const result = await applyArchitectureRefinement({
      projectId,
      turnIdentity: turnIdentity(),
      startingSequence: 0,
      toolName: 'refine_architecture_flow',
      input: {
        moduleId: sourceModuleId,
        createNodes: [
          { key: 'start', label: 'Request received', nodeType: 'start' },
          { key: 'validate', label: 'Validate request', nodeType: 'process' },
        ],
        updateNodes: [],
        deleteNodeIds: [],
        createEdges: [{ source: 'start', target: 'validate' }],
        updateEdges: [],
        deleteEdgeIds: [],
      },
    })

    expect(applyArchitectureCommandMock).toHaveBeenCalledTimes(1)
    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command.operations.map((operation) => operation.type)).toEqual([
      'flow_node.create',
      'flow_node.create',
      'flow_edge.create',
    ])
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        createdNodes: [
          expect.objectContaining({ label: 'Request received' }),
          expect.objectContaining({ label: 'Validate request' }),
        ],
        createdEdges: [expect.any(Object)],
        consumedOperationCount: 3,
      }),
    })
  })

  it('lets an atomic flow update free an old edge shape for a replacement edge', async () => {
    const sourceNodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const targetNodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    const existingEdgeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
    getGraphForModuleMock.mockResolvedValue({
      success: true,
      data: {
        nodes: [graphNode(sourceNodeId, 'Start'), graphNode(targetNodeId, 'Finish')],
        edges: [
          {
            ...edgeRow(existingEdgeId, sourceNodeId, targetNodeId),
            label: 'original',
          },
        ],
      },
    })
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => {
      const created = command.operations[1]
      if (created.type !== 'flow_edge.create') throw new Error('unexpected operation')
      return {
        success: true,
        data: committedReceipt(command, [
          {
            flow_edges: [
              {
                ...edgeRow(existingEdgeId, sourceNodeId, targetNodeId),
                label: 'revised',
              },
            ],
          },
          {
            flow_edges: [
              {
                ...edgeRow(created.edge.id, sourceNodeId, targetNodeId),
                label: 'original',
              },
            ],
          },
        ]),
      }
    })

    const result = await applyArchitectureRefinement({
      projectId,
      turnIdentity: turnIdentity([operationIds[0], operationIds[1]]),
      startingSequence: 0,
      toolName: 'refine_architecture_flow',
      input: {
        moduleId: sourceModuleId,
        createNodes: [],
        updateNodes: [],
        deleteNodeIds: [],
        createEdges: [{ source: sourceNodeId, target: targetNodeId, label: 'original' }],
        updateEdges: [{ edgeId: existingEdgeId, label: 'revised' }],
        deleteEdgeIds: [],
      },
    })

    expect(result.success).toBe(true)
    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command.operations.map((operation) => operation.type)).toEqual([
      'flow_edge.update',
      'flow_edge.create',
    ])
  })

  it('rejects atomic flow updates that converge on a duplicate edge', async () => {
    const sourceNodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const targetNodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    const firstEdgeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
    const secondEdgeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
    getGraphForModuleMock.mockResolvedValue({
      success: true,
      data: {
        nodes: [graphNode(sourceNodeId, 'Start'), graphNode(targetNodeId, 'Finish')],
        edges: [
          { ...edgeRow(firstEdgeId, sourceNodeId, targetNodeId), label: 'yes' },
          { ...edgeRow(secondEdgeId, sourceNodeId, targetNodeId), label: 'no' },
        ],
      },
    })

    await expect(
      applyArchitectureRefinement({
        projectId,
        turnIdentity: turnIdentity([operationIds[0]]),
        startingSequence: 0,
        toolName: 'refine_architecture_flow',
        input: {
          moduleId: sourceModuleId,
          createNodes: [],
          updateNodes: [],
          deleteNodeIds: [],
          createEdges: [],
          updateEdges: [{ edgeId: secondEdgeId, label: 'yes' }],
          deleteEdgeIds: [],
        },
      }),
    ).resolves.toEqual({
      success: false,
      error: 'The flow edge updates would create a duplicate edge.',
    })
    expect(applyArchitectureCommandMock).not.toHaveBeenCalled()
  })

  it('rejects a described copy of an existing blank route', async () => {
    const sourceNodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const targetNodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    const existingEdgeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
    getGraphForModuleMock.mockResolvedValue({
      success: true,
      data: {
        nodes: [graphNode(sourceNodeId, 'Start'), graphNode(targetNodeId, 'Finish')],
        edges: [edgeRow(existingEdgeId, sourceNodeId, targetNodeId)],
      },
    })

    await expect(
      applyArchitectureRefinement({
        projectId,
        turnIdentity: turnIdentity([operationIds[0]]),
        startingSequence: 0,
        toolName: 'refine_architecture_flow',
        input: {
          moduleId: sourceModuleId,
          createNodes: [],
          updateNodes: [],
          deleteNodeIds: [],
          createEdges: [{ source: sourceNodeId, target: targetNodeId, label: 'Proceed' }],
          updateEdges: [],
          deleteEdgeIds: [],
        },
      }),
    ).resolves.toEqual({
      success: false,
      error: 'That flow route already exists; update the existing edge instead.',
    })
    expect(applyArchitectureCommandMock).not.toHaveBeenCalled()
  })

  it('inserts a flow node and rewires the direct edge in one atomic command', async () => {
    const sourceNodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const targetNodeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    const directEdgeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
    const ids = [...operationIds, '88888888-8888-4888-8888-888888888884']
    getGraphForModuleMock.mockResolvedValue({
      success: true,
      data: {
        nodes: [nodeRow(sourceNodeId, 'Start'), nodeRow(targetNodeId, 'Finish')],
        edges: [edgeRow(directEdgeId, sourceNodeId, targetNodeId)],
      },
    })
    applyArchitectureCommandMock.mockImplementation(async (command: ArchitectureCommand) => {
      const createNode = command.operations[1]
      const firstEdge = command.operations[2]
      const secondEdge = command.operations[3]
      if (
        createNode.type !== 'flow_node.create' ||
        firstEdge.type !== 'flow_edge.create' ||
        secondEdge.type !== 'flow_edge.create'
      ) {
        throw new Error('unexpected operations')
      }
      return {
        success: true,
        data: committedReceipt(command, [
          { flow_edges: [] },
          { flow_nodes: [nodeRow(createNode.node.id, createNode.node.label)] },
          {
            flow_edges: [
              edgeRow(firstEdge.edge.id, firstEdge.edge.sourceNodeId, firstEdge.edge.targetNodeId),
            ],
          },
          {
            flow_edges: [
              edgeRow(
                secondEdge.edge.id,
                secondEdge.edge.sourceNodeId,
                secondEdge.edge.targetNodeId,
              ),
            ],
          },
        ]),
      }
    })

    const result = await applyArchitectureRefinement({
      projectId,
      turnIdentity: turnIdentity(ids),
      startingSequence: 0,
      toolName: 'insert_node_between',
      input: {
        moduleId: sourceModuleId,
        sourceNodeId,
        targetNodeId,
        label: 'Review request',
        nodeType: 'process',
      },
    })

    const command = applyArchitectureCommandMock.mock.calls[0][0] as ArchitectureCommand
    expect(command.operations.map((operation) => operation.type)).toEqual([
      'flow_edge.delete',
      'flow_node.create',
      'flow_edge.create',
      'flow_edge.create',
    ])
    expect(command.operations.map((operation) => operation.operationId)).toEqual(ids)
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        removedEdgeIds: [directEdgeId],
        node: expect.objectContaining({ label: 'Review request' }),
        edges: [expect.any(Object), expect.any(Object)],
        consumedOperationCount: 4,
      }),
    })
  })
})
