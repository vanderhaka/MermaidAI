import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import type { ArchitectureCommand, ArchitectureOperation } from '@/lib/schemas/planning-command'
import { architectureSnapshotContentSchema } from '@/lib/schemas/planning'
import { listModulesByProject } from '@/lib/services/module-service'
import {
  applyArchitectureCommand,
  type ArchitectureCommandReceipt,
} from '@/lib/services/planning-command-service'
import type { ChatToolReceipt, ChatTurnIdentity } from '@/types/chat'
import type { FlowNode, Module, ModuleConnection, OpenQuestion } from '@/types/graph'

const MAX_ARCHITECTURE_OPERATIONS = 64
const MODULE_COLOR = '#111827'
const QUESTION_COLOR = '#F59E0B'

const localKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/i, 'Use a short letter-led local key.')
const boundedTextSchema = z.string().trim().min(1).max(4_000)
const shortTextSchema = z.string().trim().min(1).max(200)
const textListSchema = z.array(boundedTextSchema).min(1).max(12)

const architectureModuleDraftSchema = z
  .object({
    key: localKeySchema,
    name: z.string().trim().min(1).max(100),
    domain: z.string().trim().min(1).max(80).nullable().optional(),
    purpose: boundedTextSchema,
    responsibilities: textListSchema,
    boundaries: textListSchema,
    entryPoints: z.array(shortTextSchema).max(12),
    exitPoints: z.array(shortTextSchema).max(12),
    disconnectedJustification: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict()

const architectureConnectionDraftSchema = z
  .object({
    sourceKey: localKeySchema,
    targetKey: localKeySchema,
    description: boundedTextSchema,
    sourceExitPoint: shortTextSchema,
    targetEntryPoint: shortTextSchema,
  })
  .strict()

const architectureFlowDraftSchema = z
  .object({
    key: z.string().trim().min(1).max(120),
    actor: boundedTextSchema,
    outcome: boundedTextSchema,
    capabilityKeys: z.array(localKeySchema).min(1).max(20),
  })
  .strict()

const architectureAssumptionDraftSchema = z
  .object({
    category: z.string().trim().min(1).max(100),
    statement: boundedTextSchema,
  })
  .strict()

const architectureQuestionDraftSchema = z
  .object({
    section: z.string().trim().min(1).max(100),
    question: z.string().trim().min(1).max(500),
    readinessImpact: z.enum(['blocking', 'non_blocking', 'deferred']),
    relatedModuleKey: localKeySchema,
  })
  .strict()

export const captureArchitectureMapInputSchema = z
  .object({
    objective: boundedTextSchema,
    outcomes: z.array(boundedTextSchema).min(1).max(12),
    actors: z.array(boundedTextSchema).min(1).max(12),
    modules: z.array(architectureModuleDraftSchema).min(1).max(20),
    connections: z.array(architectureConnectionDraftSchema).max(30),
    importantFlows: z.array(architectureFlowDraftSchema).min(1).max(12),
    assumptions: z.array(architectureAssumptionDraftSchema).max(8),
    questions: z.array(architectureQuestionDraftSchema).max(4),
  })
  .strict()
  .superRefine((input, ctx) => {
    const moduleKeys = new Set<string>()
    const moduleNames = new Set<string>()
    for (const [index, capability] of input.modules.entries()) {
      if (moduleKeys.has(capability.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['modules', index, 'key'],
          message: `Duplicate local module key "${capability.key}".`,
        })
      }
      moduleKeys.add(capability.key)

      const normalizedName = capability.name.toLocaleLowerCase()
      if (moduleNames.has(normalizedName)) {
        ctx.addIssue({
          code: 'custom',
          path: ['modules', index, 'name'],
          message: `Duplicate module name "${capability.name}".`,
        })
      }
      moduleNames.add(normalizedName)
    }

    const adjacency = new Map(
      input.modules.map((capability) => [capability.key, new Set<string>()]),
    )
    const connectionKeys = new Set<string>()
    for (const [index, connection] of input.connections.entries()) {
      if (!moduleKeys.has(connection.sourceKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['connections', index, 'sourceKey'],
          message: 'Connection source must reference a local module key.',
        })
      }
      if (!moduleKeys.has(connection.targetKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['connections', index, 'targetKey'],
          message: 'Connection target must reference a local module key.',
        })
      }
      if (connection.sourceKey === connection.targetKey) {
        ctx.addIssue({
          code: 'custom',
          path: ['connections', index, 'targetKey'],
          message: 'Architecture connections cannot link a module to itself.',
        })
      }

      const connectionKey = [
        connection.sourceKey,
        connection.targetKey,
        connection.sourceExitPoint,
        connection.targetEntryPoint,
      ].join('\u0000')
      if (connectionKeys.has(connectionKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['connections', index],
          message: 'Duplicate Architecture connection.',
        })
      }
      connectionKeys.add(connectionKey)
      if (
        connection.sourceKey !== connection.targetKey &&
        moduleKeys.has(connection.sourceKey) &&
        moduleKeys.has(connection.targetKey)
      ) {
        adjacency.get(connection.sourceKey)?.add(connection.targetKey)
        adjacency.get(connection.targetKey)?.add(connection.sourceKey)
      }
    }

    if (input.modules.length > 1) {
      const visited = new Set<string>()
      const components: string[][] = []
      for (const capability of input.modules) {
        if (visited.has(capability.key)) continue
        const component: string[] = []
        const pending = [capability.key]
        visited.add(capability.key)
        while (pending.length > 0) {
          const current = pending.pop()!
          component.push(current)
          for (const neighbor of adjacency.get(current) ?? []) {
            if (visited.has(neighbor)) continue
            visited.add(neighbor)
            pending.push(neighbor)
          }
        }
        components.push(component)
      }

      const primaryComponent = components.reduce((largest, component) =>
        component.length > largest.length ? component : largest,
      )
      const primaryKeys = new Set(primaryComponent)
      for (const [index, capability] of input.modules.entries()) {
        if (!primaryKeys.has(capability.key) && !capability.disconnectedJustification) {
          ctx.addIssue({
            code: 'custom',
            path: ['modules', index, 'disconnectedJustification'],
            message:
              'Every capability outside the primary connected Architecture must explicitly justify its isolation.',
          })
        }
      }
    }

    const actorKeys = new Set(input.actors.map((actor) => actor.toLocaleLowerCase()))
    const flowKeys = new Set<string>()
    for (const [index, flow] of input.importantFlows.entries()) {
      if (flowKeys.has(flow.key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['importantFlows', index, 'key'],
          message: `Duplicate important-flow key "${flow.key}".`,
        })
      }
      flowKeys.add(flow.key)
      if (!actorKeys.has(flow.actor.toLocaleLowerCase())) {
        ctx.addIssue({
          code: 'custom',
          path: ['importantFlows', index, 'actor'],
          message: 'Important-flow actors must be listed in the Architecture actors.',
        })
      }
      for (const capabilityKey of flow.capabilityKeys) {
        if (!moduleKeys.has(capabilityKey)) {
          ctx.addIssue({
            code: 'custom',
            path: ['importantFlows', index, 'capabilityKeys'],
            message: 'Important flows must reference local module keys.',
          })
        }
      }
    }

    for (const [index, question] of input.questions.entries()) {
      if (!moduleKeys.has(question.relatedModuleKey)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'relatedModuleKey'],
          message: 'Each material question must reference a local module key.',
        })
      }
    }

    const disconnectedAssumptionCount = input.modules.filter(
      (capability) => capability.disconnectedJustification,
    ).length
    const operationCount =
      input.modules.length +
      input.connections.length +
      input.assumptions.length +
      disconnectedAssumptionCount +
      input.questions.length * 2
    if (operationCount > MAX_ARCHITECTURE_OPERATIONS) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: `Architecture capture requires ${operationCount} operations; the turn limit is ${MAX_ARCHITECTURE_OPERATIONS}.`,
      })
    }
  })

export type CaptureArchitectureMapInput = z.infer<typeof captureArchitectureMapInputSchema>

type CaptureArchitectureMapResult =
  | {
      success: true
      data: {
        modules: Module[]
        connections: ModuleConnection[]
        nodes: FlowNode[]
        questions: OpenQuestion[]
        architectureReceipt: ArchitectureCommandReceipt
        chatReceipt: ChatToolReceipt
        consumedOperationCount: number
      }
    }
  | { success: false; error: string }

type CaptureArchitectureMapRequest = {
  projectId: string
  turnIdentity: ChatTurnIdentity
  startingSequence: number
  input: unknown
}

type AssumptionDraft = CaptureArchitectureMapInput['assumptions'][number] & { key: string }

function uuidToBytes(value: string): Buffer {
  return Buffer.from(value.replaceAll('-', ''), 'hex')
}

/** RFC 9562 UUIDv5: deterministic across a retry of the same change set and local key. */
function deterministicEntityId(namespace: string, name: string): string {
  const digest = createHash('sha1')
    .update(uuidToBytes(namespace))
    .update(name.normalize('NFC'))
    .digest()
    .subarray(0, 16)
  digest[6] = (digest[6] & 0x0f) | 0x50
  digest[8] = (digest[8] & 0x3f) | 0x80
  const hex = digest.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function buildArchitectureCommand(
  projectId: string,
  turnIdentity: ChatTurnIdentity,
  startingSequence: number,
  input: CaptureArchitectureMapInput,
): ArchitectureCommand | { error: string } {
  const moduleIds = new Map(
    input.modules.map((capability) => [
      capability.key,
      deterministicEntityId(turnIdentity.changeSetId, `module:${capability.key}`),
    ]),
  )
  const assumptions: AssumptionDraft[] = [
    ...input.assumptions.map((assumption, index) => ({
      ...assumption,
      key: `assumption:${index}:${assumption.statement}`,
    })),
    ...input.modules.flatMap((capability) =>
      capability.disconnectedJustification
        ? [
            {
              key: `disconnected:${capability.key}`,
              category: 'Architecture boundary',
              statement: `${capability.name} is intentionally disconnected: ${capability.disconnectedJustification}`,
            },
          ]
        : [],
    ),
  ]
  const operationCount =
    input.modules.length +
    input.connections.length +
    assumptions.length +
    input.questions.length * 2
  const operationIds = turnIdentity.operationIds.slice(
    startingSequence,
    startingSequence + operationCount,
  )
  if (operationIds.length !== operationCount) {
    return {
      error: `Architecture capture needs ${operationCount} ordered operation IDs, but only ${operationIds.length} remain in this turn.`,
    }
  }

  let operationIndex = 0
  const operations: ArchitectureOperation[] = []
  for (const [index, capability] of input.modules.entries()) {
    const incomingPoints = input.connections
      .filter((connection) => connection.targetKey === capability.key)
      .map((connection) => connection.targetEntryPoint)
    const outgoingPoints = input.connections
      .filter((connection) => connection.sourceKey === capability.key)
      .map((connection) => connection.sourceExitPoint)
    operations.push({
      operationId: operationIds[operationIndex++],
      type: 'module.create',
      module: {
        id: moduleIds.get(capability.key)!,
        name: capability.name,
        domain: capability.domain ?? null,
        description: capability.purpose,
        position: { x: (index % 3) * 320, y: Math.floor(index / 3) * 220 },
        color: MODULE_COLOR,
        entryPoints: unique([...capability.entryPoints, ...incomingPoints]),
        exitPoints: unique([...capability.exitPoints, ...outgoingPoints]),
      },
    })
  }

  for (const [index, connection] of input.connections.entries()) {
    operations.push({
      operationId: operationIds[operationIndex++],
      type: 'module_connection.create',
      connection: {
        id: deterministicEntityId(
          turnIdentity.changeSetId,
          `connection:${index}:${connection.sourceKey}:${connection.targetKey}:${connection.sourceExitPoint}:${connection.targetEntryPoint}`,
        ),
        sourceModuleId: moduleIds.get(connection.sourceKey)!,
        targetModuleId: moduleIds.get(connection.targetKey)!,
        sourceExitPoint: connection.sourceExitPoint,
        targetEntryPoint: connection.targetEntryPoint,
      },
    })
  }

  const assumptionIds = new Map<string, string>()
  for (const assumption of assumptions) {
    const id = deterministicEntityId(turnIdentity.changeSetId, assumption.key)
    assumptionIds.set(assumption.key, id)
    operations.push({
      operationId: operationIds[operationIndex++],
      type: 'decision.create',
      decision: {
        id,
        category: assumption.category,
        statement: assumption.statement,
        state: 'proposed',
        provenance: 'assistant',
        readinessImpact: 'non_blocking',
        supersedesDecisionId: null,
      },
    })
  }

  const questionIds = new Map<number, string>()
  for (const [index, question] of input.questions.entries()) {
    const nodeId = deterministicEntityId(
      turnIdentity.changeSetId,
      `question-node:${index}:${question.question}`,
    )
    const questionId = deterministicEntityId(
      turnIdentity.changeSetId,
      `question:${index}:${question.question}`,
    )
    questionIds.set(index, questionId)
    operations.push({
      operationId: operationIds[operationIndex++],
      type: 'flow_node.create',
      node: {
        id: nodeId,
        moduleId: moduleIds.get(question.relatedModuleKey)!,
        nodeType: 'question',
        label:
          question.question.length > 200
            ? `${question.question.slice(0, 197)}...`
            : question.question,
        pseudocode: question.question,
        position: { x: 40 + index * 40, y: 40 + index * 40 },
        color: QUESTION_COLOR,
      },
    })
    operations.push({
      operationId: operationIds[operationIndex++],
      type: 'question.create',
      question: {
        id: questionId,
        nodeId,
        section: question.section,
        question: question.question,
        readinessImpact: question.readinessImpact,
        provenance: 'assistant',
      },
    })
  }

  const architectureContent = architectureSnapshotContentSchema.parse({
    objective: input.objective,
    outcomes: input.outcomes,
    actors: input.actors,
    capabilities: input.modules.map((capability) => ({
      id: moduleIds.get(capability.key)!,
      name: capability.name,
      purpose: capability.purpose,
      responsibilities: capability.responsibilities,
      boundaries: capability.disconnectedJustification
        ? [
            ...capability.boundaries,
            `Intentionally separate: ${capability.disconnectedJustification}`,
          ]
        : capability.boundaries,
    })),
    connections: input.connections.map((connection) => ({
      from_capability_id: moduleIds.get(connection.sourceKey)!,
      to_capability_id: moduleIds.get(connection.targetKey)!,
      description: connection.description,
    })),
    important_flows: input.importantFlows.map((flow) => ({
      id: flow.key,
      actor: flow.actor,
      outcome: flow.outcome,
      capability_ids: flow.capabilityKeys.map((key) => moduleIds.get(key)!),
    })),
    assumptions: assumptions.map((assumption) => ({
      id: assumptionIds.get(assumption.key)!,
      statement: assumption.statement,
    })),
    blockers: input.questions.flatMap((question, index) =>
      question.readinessImpact === 'blocking'
        ? [{ id: questionIds.get(index)!, statement: question.question }]
        : [],
    ),
  })

  return {
    projectId,
    changeSetId: turnIdentity.changeSetId,
    turnId: turnIdentity.turnId,
    expectedRevision: turnIdentity.expectedRevision,
    operations,
    architectureContent,
  }
}

export function buildInitialArchitectureCommand(input: {
  projectId: string
  changeSetId: string
  turnId: string
  expectedRevision: number
  capture: unknown
}): { success: true; data: ArchitectureCommand } | { success: false; error: string } {
  const identity = z
    .object({
      projectId: z.uuid(),
      changeSetId: z.uuid(),
      turnId: z.uuid(),
      expectedRevision: z.number().int().nonnegative(),
    })
    .safeParse(input)
  if (!identity.success) {
    return {
      success: false,
      error: `Invalid initial Architecture identity: ${identity.error.issues[0]?.message ?? 'unknown input'}`,
    }
  }
  const capture = captureArchitectureMapInputSchema.safeParse(input.capture)
  if (!capture.success) {
    return {
      success: false,
      error: `Invalid Architecture capture: ${capture.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  const stableId = (name: string) => deterministicEntityId(identity.data.changeSetId, name)
  const command = buildArchitectureCommand(
    identity.data.projectId,
    {
      turnId: identity.data.turnId,
      userMessageKey: stableId('scope-handoff:user-message'),
      assistantMessageKey: stableId('scope-handoff:assistant-message'),
      changeSetId: identity.data.changeSetId,
      expectedRevision: identity.data.expectedRevision,
      operationIds: Array.from({ length: MAX_ARCHITECTURE_OPERATIONS }, (_, index) =>
        stableId(`scope-handoff:operation:${index}`),
      ),
      planningStage: 'architecture',
      artifactId: null,
      artifactVersionId: null,
    },
    0,
    capture.data,
  )
  return 'error' in command
    ? { success: false, error: command.error }
    : { success: true, data: command }
}

const moduleRowSchema = z
  .object({
    id: z.uuid(),
    project_id: z.uuid(),
    domain: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    prd_content: z.string(),
    position_x: z.number().nullable(),
    position_y: z.number().nullable(),
    color: z.string().nullable(),
    entry_points: z.array(z.string()).nullable(),
    exit_points: z.array(z.string()).nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough()

const connectionRowSchema = z
  .object({
    id: z.uuid(),
    project_id: z.uuid(),
    source_module_id: z.uuid(),
    target_module_id: z.uuid(),
    source_exit_point: z.string(),
    target_entry_point: z.string(),
    created_at: z.string(),
  })
  .passthrough()

const nodeRowSchema = z
  .object({
    id: z.uuid(),
    module_id: z.uuid(),
    node_type: z.enum(['decision', 'process', 'entry', 'exit', 'start', 'end', 'question']),
    label: z.string(),
    pseudocode: z.string(),
    position_x: z.number().nullable(),
    position_y: z.number().nullable(),
    color: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough()

const questionRowSchema = z
  .object({
    id: z.uuid(),
    project_id: z.uuid(),
    node_id: z.uuid(),
    section: z.string(),
    question: z.string(),
    status: z.enum(['open', 'resolved']),
    resolution: z.string().nullable(),
    created_at: z.string(),
    resolved_at: z.string().nullable(),
  })
  .passthrough()

function singleCommittedRow(
  receipt: ArchitectureCommandReceipt,
  operationIndex: number,
  collection: 'modules' | 'module_connections' | 'flow_nodes' | 'open_questions',
): unknown {
  const after = receipt.operations[operationIndex]?.after
  if (!after || typeof after !== 'object' || Array.isArray(after)) return undefined
  const rows = (after as Record<string, unknown>)[collection]
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : undefined
}

function mapCommittedRows(
  command: ArchitectureCommand,
  receipt: ArchitectureCommandReceipt,
):
  | {
      success: true
      modules: Module[]
      connections: ModuleConnection[]
      nodes: FlowNode[]
      questions: OpenQuestion[]
    }
  | { success: false; error: string } {
  const modules: Module[] = []
  const connections: ModuleConnection[] = []
  const nodes: FlowNode[] = []
  const questions: OpenQuestion[] = []

  for (const [index, operation] of command.operations.entries()) {
    if (operation.type === 'module.create') {
      const row = moduleRowSchema.safeParse(singleCommittedRow(receipt, index, 'modules'))
      if (!row.success)
        return {
          success: false,
          error: 'Committed Architecture receipt has an invalid module row.',
        }
      modules.push({
        id: row.data.id,
        project_id: row.data.project_id,
        domain: row.data.domain,
        name: row.data.name,
        description: row.data.description,
        prd_content: row.data.prd_content,
        position: { x: row.data.position_x ?? 0, y: row.data.position_y ?? 0 },
        color: row.data.color ?? '',
        entry_points: row.data.entry_points ?? [],
        exit_points: row.data.exit_points ?? [],
        created_at: row.data.created_at,
        updated_at: row.data.updated_at,
      })
    } else if (operation.type === 'module_connection.create') {
      const row = connectionRowSchema.safeParse(
        singleCommittedRow(receipt, index, 'module_connections'),
      )
      if (!row.success) {
        return {
          success: false,
          error: 'Committed Architecture receipt has an invalid connection row.',
        }
      }
      connections.push(row.data)
    } else if (operation.type === 'flow_node.create') {
      const row = nodeRowSchema.safeParse(singleCommittedRow(receipt, index, 'flow_nodes'))
      if (!row.success)
        return {
          success: false,
          error: 'Committed Architecture receipt has an invalid question node row.',
        }
      nodes.push({
        id: row.data.id,
        module_id: row.data.module_id,
        node_type: row.data.node_type,
        label: row.data.label,
        pseudocode: row.data.pseudocode,
        position: { x: row.data.position_x ?? 0, y: row.data.position_y ?? 0 },
        color: row.data.color ?? '',
        created_at: row.data.created_at,
        updated_at: row.data.updated_at,
      })
    } else if (operation.type === 'question.create') {
      const row = questionRowSchema.safeParse(singleCommittedRow(receipt, index, 'open_questions'))
      if (!row.success)
        return {
          success: false,
          error: 'Committed Architecture receipt has an invalid open-question row.',
        }
      questions.push(row.data)
    }
  }

  return { success: true, modules, connections, nodes, questions }
}

export async function captureArchitectureMap(
  request: CaptureArchitectureMapRequest,
): Promise<CaptureArchitectureMapResult> {
  const projectIdResult = z.uuid().safeParse(request.projectId)
  if (!projectIdResult.success) return { success: false, error: 'Invalid Architecture project ID.' }
  if (!Number.isInteger(request.startingSequence) || request.startingSequence < 0) {
    return { success: false, error: 'Invalid Architecture operation sequence.' }
  }

  const parsed = captureArchitectureMapInputSchema.safeParse(request.input)
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid Architecture capture: ${parsed.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  const existingModules = await listModulesByProject(projectIdResult.data)
  if (!existingModules.success) return { success: false, error: existingModules.error }
  if (existingModules.data.length > 0) {
    return {
      success: false,
      error:
        'Cannot wholesale-capture an existing Architecture. Use the granular module and connection refinement tools.',
    }
  }

  const command = buildArchitectureCommand(
    projectIdResult.data,
    request.turnIdentity,
    request.startingSequence,
    parsed.data,
  )
  if ('error' in command) return { success: false, error: command.error }

  const result = await applyArchitectureCommand(command)
  if (!result.success) return result

  const committedRows = mapCommittedRows(command, result.data)
  if (!committedRows.success) return committedRows

  const firstOperationId = command.operations[0]?.operationId
  if (!firstOperationId || !result.data.architectureVersionId) {
    return {
      success: false,
      error: 'Committed Architecture receipt is missing its semantic identity.',
    }
  }

  return {
    success: true,
    data: {
      ...committedRows,
      architectureReceipt: result.data,
      consumedOperationCount: command.operations.length,
      chatReceipt: {
        turnId: request.turnIdentity.turnId,
        changeSetId: request.turnIdentity.changeSetId,
        operationId: firstOperationId,
        sequence: request.startingSequence,
        status: 'committed',
        expectedRevision: request.turnIdentity.expectedRevision,
        committedRevision: result.data.committedRevision,
        artifactVersionId: result.data.architectureVersionId,
      },
    },
  }
}
