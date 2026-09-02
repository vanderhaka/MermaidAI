import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import type { ArchitectureCommand, ArchitectureOperation } from '@/lib/schemas/planning-command'
import { architectureSnapshotContentSchema } from '@/lib/schemas/planning'
import { FLOW_NODE_TYPES } from '@/lib/schemas/flow-node'
import { getGraphForModule } from '@/lib/services/graph-service'
import { listConnectionsByProject } from '@/lib/services/module-connection-service'
import { listModulesByProject } from '@/lib/services/module-service'
import { listOpenOpenQuestions } from '@/lib/services/open-question-service'
import { getActivePlanningArtifactVersion } from '@/lib/services/planning-artifact-service'
import {
  applyArchitectureCommand,
  type ArchitectureCommandReceipt,
} from '@/lib/services/planning-command-service'
import {
  listPlanningDecisions,
  type PlanningDecision,
} from '@/lib/services/planning-decision-service'
import type { ChatToolReceipt, ChatTurnIdentity } from '@/types/chat'
import type { FlowEdge, FlowNode, Module, ModuleConnection, OpenQuestion } from '@/types/graph'
import type { ArchitectureSnapshotContent } from '@/types/planning'

const MODULE_COLOR = '#111827'

const createModuleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    domain: z.string().trim().max(80).optional(),
    description: z.string().trim().max(4_000).optional(),
    entry_points: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    exit_points: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  })
  .passthrough()

const updateModuleInputSchema = z
  .object({
    moduleId: z.uuid(),
    domain: z.string().trim().max(80).optional(),
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(4_000).optional(),
    entry_points: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    exit_points: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  })
  .passthrough()
  .refine(
    ({ moduleId: _moduleId, ...changes }) => Object.values(changes).some((value) => value != null),
    'At least one module field is required.',
  )

const deleteModuleInputSchema = z.object({ moduleId: z.uuid() }).passthrough()

const connectModulesInputSchema = z
  .object({
    sourceModuleId: z.uuid(),
    targetModuleId: z.uuid(),
    sourceExitPoint: z.string().trim().min(1).max(4_000),
    targetEntryPoint: z.string().trim().min(1).max(4_000),
  })
  .passthrough()
  .refine((input) => input.sourceModuleId !== input.targetModuleId, {
    message: 'Architecture connections cannot link a module to itself.',
  })

const createNodeInputSchema = z
  .object({
    moduleId: z.uuid(),
    label: z.string().trim().min(1).max(200),
    nodeType: z.enum(FLOW_NODE_TYPES),
    pseudocode: z.string().max(20_000).optional(),
  })
  .passthrough()

const updateNodeInputSchema = z
  .object({
    nodeId: z.uuid(),
    label: z.string().trim().min(1).max(200).optional(),
    nodeType: z.enum(FLOW_NODE_TYPES).optional(),
    pseudocode: z.string().max(20_000).optional(),
  })
  .passthrough()
  .refine(
    ({ nodeId: _nodeId, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    'At least one node field is required.',
  )

const deleteNodeInputSchema = z.object({ nodeId: z.uuid() }).passthrough()

const createEdgeInputSchema = z
  .object({
    moduleId: z.uuid(),
    sourceNodeId: z.uuid(),
    targetNodeId: z.uuid(),
    label: z.string().trim().max(4_000).optional(),
    condition: z.string().trim().max(4_000).optional(),
  })
  .passthrough()
  .refine((input) => input.sourceNodeId !== input.targetNodeId, {
    message: 'Flow edges cannot link a node to itself.',
  })

const updateEdgeInputSchema = z
  .object({
    edgeId: z.uuid(),
    label: z.string().trim().max(4_000).optional(),
    condition: z.string().trim().max(4_000).optional(),
  })
  .passthrough()
  .refine(
    ({ edgeId: _edgeId, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    'At least one edge field is required.',
  )

const deleteEdgeInputSchema = z.object({ edgeId: z.uuid() }).passthrough()

const insertNodeBetweenInputSchema = z
  .object({
    moduleId: z.uuid(),
    sourceNodeId: z.uuid(),
    targetNodeId: z.uuid(),
    label: z.string().trim().min(1).max(200),
    nodeType: z.enum(FLOW_NODE_TYPES),
    pseudocode: z.string().max(20_000).optional(),
    incomingEdgeLabel: z.string().trim().max(4_000).optional(),
    outgoingEdgeLabel: z.string().trim().max(4_000).optional(),
  })
  .passthrough()

const localKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i, 'Use a short alphanumeric local key.')

const architectureMapRefinementInputSchema = z
  .object({
    objective: z.string().trim().min(1).max(4_000).optional(),
    outcomes: z.array(z.string().trim().min(1).max(4_000)).min(1).max(100).optional(),
    actors: z.array(z.string().trim().min(1).max(4_000)).min(1).max(100).optional(),
    importantFlows: z
      .array(
        z.object({
          key: localKeySchema,
          actor: z.string().trim().min(1).max(4_000),
          outcome: z.string().trim().min(1).max(4_000),
          capabilityRefs: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
        }),
      )
      .min(1)
      .max(100)
      .optional(),
    createModules: z
      .array(
        z.object({
          key: localKeySchema,
          name: z.string().trim().min(1).max(100),
          domain: z.string().trim().max(80).optional(),
          description: z.string().trim().min(1).max(4_000),
          responsibilities: z.array(z.string().trim().min(1).max(4_000)).min(1).max(100).optional(),
          boundaries: z.array(z.string().trim().min(1).max(4_000)).min(1).max(100).optional(),
          entryPoints: z.array(z.string().trim().min(1).max(200)).max(100),
          exitPoints: z.array(z.string().trim().min(1).max(200)).max(100),
        }),
      )
      .max(30)
      .default([]),
    updateModules: z
      .array(
        z
          .object({
            moduleId: z.uuid(),
            name: z.string().trim().min(1).max(100).optional(),
            domain: z.string().trim().max(80).optional(),
            description: z.string().trim().max(4_000).optional(),
            responsibilities: z
              .array(z.string().trim().min(1).max(4_000))
              .min(1)
              .max(100)
              .optional(),
            boundaries: z.array(z.string().trim().min(1).max(4_000)).min(1).max(100).optional(),
            entryPoints: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
            exitPoints: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
          })
          .refine(
            ({ moduleId: _moduleId, ...changes }) =>
              Object.values(changes).some((value) => value !== undefined),
            'At least one module field is required.',
          ),
      )
      .max(30)
      .default([]),
    deleteModuleIds: z.array(z.uuid()).max(30).default([]),
    connectModules: z
      .array(
        z.object({
          source: z.string().trim().min(1).max(100),
          target: z.string().trim().min(1).max(100),
          sourceExitPoint: z.string().trim().min(1).max(200),
          targetEntryPoint: z.string().trim().min(1).max(200),
        }),
      )
      .max(60)
      .default([]),
    disconnectModules: z
      .array(z.object({ sourceModuleId: z.uuid(), targetModuleId: z.uuid() }))
      .max(60)
      .default([]),
    resolveQuestions: z
      .array(
        z.object({
          questionId: z.uuid(),
          resolution: z.string().trim().min(1).max(1_000),
          supersedesDecisionId: z.uuid().optional(),
        }),
      )
      .max(30)
      .default([]),
    decisionActions: z
      .array(
        z.object({
          decisionId: z.uuid(),
          action: z.enum(['accept', 'reject']),
          reason: z.string().trim().min(1).max(2_000),
        }),
      )
      .max(30)
      .default([]),
    decisionReplacements: z
      .array(
        z
          .object({
            decisionId: z.uuid(),
            supersedesDecisionId: z.uuid(),
            reason: z.string().trim().min(1).max(2_000),
          })
          .refine(
            (replacement) => replacement.decisionId !== replacement.supersedesDecisionId,
            'A decision cannot supersede itself.',
          ),
      )
      .max(30)
      .default([]),
    recordDecisions: z
      .array(
        z.object({
          key: localKeySchema,
          category: z.string().trim().min(1).max(100),
          statement: z.string().trim().min(1).max(4_000),
          provenance: z.enum(['user', 'assistant']),
          readinessImpact: z.enum(['blocking', 'non_blocking', 'deferred']),
          reason: z.string().trim().min(1).max(2_000),
          supersedesDecisionId: z.uuid().optional(),
        }),
      )
      .max(30)
      .default([]),
  })
  .strict()
  .superRefine((input, context) => {
    const durableMutationCount =
      input.createModules.length +
      input.updateModules.length +
      input.deleteModuleIds.length +
      input.connectModules.length +
      input.disconnectModules.length +
      input.resolveQuestions.length +
      input.decisionActions.length +
      input.decisionReplacements.length +
      input.recordDecisions.length
    if (durableMutationCount === 0) {
      context.addIssue({
        code: 'custom',
        message:
          'A brief-only rewrite is not enough. Include the capability, question, or decision change that justifies it.',
      })
    }

    const createKeys = input.createModules.map((module) => module.key)
    if (new Set(createKeys).size !== createKeys.length) {
      context.addIssue({ code: 'custom', message: 'New module local keys must be unique.' })
    }
    const updatedIds = input.updateModules.map((module) => module.moduleId)
    if (new Set(updatedIds).size !== updatedIds.length) {
      context.addIssue({ code: 'custom', message: 'Each module may be updated only once.' })
    }
    if (new Set(input.deleteModuleIds).size !== input.deleteModuleIds.length) {
      context.addIssue({ code: 'custom', message: 'Each module may be deleted only once.' })
    }
    const flowKeys = input.importantFlows?.map((flow) => flow.key) ?? []
    if (new Set(flowKeys).size !== flowKeys.length) {
      context.addIssue({ code: 'custom', message: 'Important flow local keys must be unique.' })
    }
    const questionIds = input.resolveQuestions.map((question) => question.questionId)
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({ code: 'custom', message: 'Each question may be resolved only once.' })
    }
    const decisionIds = input.decisionActions.map((decision) => decision.decisionId)
    if (new Set(decisionIds).size !== decisionIds.length) {
      context.addIssue({ code: 'custom', message: 'Each decision may be reviewed only once.' })
    }
    const decisionKeys = input.recordDecisions.map((decision) => decision.key)
    if (new Set(decisionKeys).size !== decisionKeys.length) {
      context.addIssue({ code: 'custom', message: 'New decision local keys must be unique.' })
    }
    const supersededDecisionIds = [
      ...input.resolveQuestions.flatMap((question) =>
        question.supersedesDecisionId ? [question.supersedesDecisionId] : [],
      ),
      ...input.recordDecisions.flatMap((decision) =>
        decision.supersedesDecisionId ? [decision.supersedesDecisionId] : [],
      ),
      ...input.decisionReplacements.map((replacement) => replacement.supersedesDecisionId),
    ]
    if (new Set(supersededDecisionIds).size !== supersededDecisionIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Each prior decision may be superseded only once per refinement.',
      })
    }
    if (supersededDecisionIds.some((decisionId) => decisionIds.includes(decisionId))) {
      context.addIssue({
        code: 'custom',
        message: 'A decision cannot be reviewed and superseded in the same refinement.',
      })
    }
    const replacementDecisionIds = input.decisionReplacements.map(
      (replacement) => replacement.decisionId,
    )
    if (new Set(replacementDecisionIds).size !== replacementDecisionIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Each replacement decision may be linked only once per refinement.',
      })
    }
    if (replacementDecisionIds.some((decisionId) => decisionIds.includes(decisionId))) {
      context.addIssue({
        code: 'custom',
        message: 'A replacement decision cannot be reviewed in the same refinement.',
      })
    }
    if (replacementDecisionIds.some((decisionId) => supersededDecisionIds.includes(decisionId))) {
      context.addIssue({
        code: 'custom',
        message: 'A decision cannot be both a replacement and superseded in one refinement.',
      })
    }
  })

const architectureFlowRefinementInputSchema = z
  .object({
    moduleId: z.uuid(),
    createNodes: z
      .array(
        z.object({
          key: localKeySchema,
          label: z.string().trim().min(1).max(200),
          nodeType: z.enum(FLOW_NODE_TYPES),
          pseudocode: z.string().max(20_000).optional(),
        }),
      )
      .max(40),
    updateNodes: z
      .array(
        z
          .object({
            nodeId: z.uuid(),
            label: z.string().trim().min(1).max(200).optional(),
            nodeType: z.enum(FLOW_NODE_TYPES).optional(),
            pseudocode: z.string().max(20_000).optional(),
          })
          .refine(
            ({ nodeId: _nodeId, ...changes }) =>
              Object.values(changes).some((value) => value !== undefined),
            'At least one node field is required.',
          ),
      )
      .max(40),
    deleteNodeIds: z.array(z.uuid()).max(40),
    createEdges: z
      .array(
        z.object({
          source: z.string().trim().min(1).max(100),
          target: z.string().trim().min(1).max(100),
          label: z.string().trim().max(4_000).optional(),
          condition: z.string().trim().max(4_000).optional(),
        }),
      )
      .max(60),
    updateEdges: z
      .array(
        z
          .object({
            edgeId: z.uuid(),
            label: z.string().trim().max(4_000).optional(),
            condition: z.string().trim().max(4_000).optional(),
          })
          .refine(
            ({ edgeId: _edgeId, ...changes }) =>
              Object.values(changes).some((value) => value !== undefined),
            'At least one edge field is required.',
          ),
      )
      .max(60),
    deleteEdgeIds: z.array(z.uuid()).max(60),
  })
  .strict()
  .superRefine((input, context) => {
    const count =
      input.createNodes.length +
      input.updateNodes.length +
      input.deleteNodeIds.length +
      input.createEdges.length +
      input.updateEdges.length +
      input.deleteEdgeIds.length
    if (count === 0) {
      context.addIssue({ code: 'custom', message: 'At least one flow change is required.' })
    }
    const createKeys = input.createNodes.map((node) => node.key)
    if (new Set(createKeys).size !== createKeys.length) {
      context.addIssue({ code: 'custom', message: 'New node local keys must be unique.' })
    }
  })

export type ArchitectureRefinementRequest = {
  projectId: string
  authenticatedUserId?: string
  turnIdentity: ChatTurnIdentity
  startingSequence: number
  toolName: string
  input: unknown
  latestUserMessage?: string
}

type ArchitectureRefinementData = Record<string, unknown> & {
  architectureReceipt: ArchitectureCommandReceipt
  chatReceipt: ChatToolReceipt
  consumedOperationCount: number
}

export type ArchitectureRefinementResult =
  | { success: true; data: ArchitectureRefinementData }
  | { success: false; error: string }

function uuidToBytes(value: string): Buffer {
  return Buffer.from(value.replaceAll('-', ''), 'hex')
}

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

function operationIdsFor(
  turnIdentity: ChatTurnIdentity,
  startingSequence: number,
  count: number,
): string[] | null {
  const ids = turnIdentity.operationIds.slice(startingSequence, startingSequence + count)
  return ids.length === count ? ids : null
}

function moduleFromRow(input: unknown): Module | null {
  const parsed = z
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
    .safeParse(input)
  if (!parsed.success) return null
  return {
    id: parsed.data.id,
    project_id: parsed.data.project_id,
    domain: parsed.data.domain,
    name: parsed.data.name,
    description: parsed.data.description,
    prd_content: parsed.data.prd_content,
    position: { x: parsed.data.position_x ?? 0, y: parsed.data.position_y ?? 0 },
    color: parsed.data.color ?? '',
    entry_points: parsed.data.entry_points ?? [],
    exit_points: parsed.data.exit_points ?? [],
    created_at: parsed.data.created_at,
    updated_at: parsed.data.updated_at,
  }
}

function connectionFromRow(input: unknown): ModuleConnection | null {
  const parsed = z
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
    .safeParse(input)
  return parsed.success ? parsed.data : null
}

function nodeFromRow(input: unknown): FlowNode | null {
  const parsed = z
    .object({
      id: z.uuid(),
      module_id: z.uuid(),
      node_type: z.enum(FLOW_NODE_TYPES),
      label: z.string(),
      pseudocode: z.string(),
      position_x: z.number().nullable(),
      position_y: z.number().nullable(),
      color: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    })
    .passthrough()
    .safeParse(input)
  if (!parsed.success) return null
  return {
    id: parsed.data.id,
    module_id: parsed.data.module_id,
    node_type: parsed.data.node_type,
    label: parsed.data.label,
    pseudocode: parsed.data.pseudocode,
    position: { x: parsed.data.position_x ?? 0, y: parsed.data.position_y ?? 0 },
    color: parsed.data.color ?? '',
    created_at: parsed.data.created_at,
    updated_at: parsed.data.updated_at,
  }
}

function edgeFromRow(input: unknown): FlowEdge | null {
  const parsed = z
    .object({
      id: z.uuid(),
      module_id: z.uuid(),
      source_node_id: z.uuid(),
      target_node_id: z.uuid(),
      label: z.string().nullable(),
      condition: z.string().nullable(),
      created_at: z.string(),
    })
    .passthrough()
    .safeParse(input)
  return parsed.success ? parsed.data : null
}

function committedRow(
  receipt: ArchitectureCommandReceipt,
  operationIndex: number,
  collection: string,
): unknown {
  const after = receipt.operations[operationIndex]?.after
  if (after === null || typeof after !== 'object' || Array.isArray(after)) return undefined
  const rows = (after as Record<string, unknown>)[collection]
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : undefined
}

function capabilityDescription(name: string, description?: string | null): string {
  return description?.trim() || `Owns the ${name} capability.`
}

function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value]
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function connectionKey(input: {
  sourceModuleId: string
  targetModuleId: string
  sourceExitPoint: string
  targetEntryPoint: string
}): string {
  return [
    input.sourceModuleId,
    input.targetModuleId,
    input.sourceExitPoint,
    input.targetEntryPoint,
  ].join('\u0000')
}

function chatTurnEvidence(
  request: ArchitectureRefinementRequest,
  provenance: 'user' | 'assistant',
): { type: string; reference: string; summary: string }[] {
  const latestUserMessage = request.latestUserMessage?.trim()
  const userSummary = latestUserMessage
    ? `The project owner stated or confirmed this in the current chat turn: ${latestUserMessage}`
    : 'The project owner explicitly confirmed this in the current chat turn.'

  return [
    {
      type: 'chat_turn',
      reference: request.turnIdentity.turnId,
      summary:
        provenance === 'user'
          ? userSummary.slice(0, 1_000)
          : 'The assistant proposed this while refining the current Architecture in response to the current chat turn.',
    },
  ]
}

function commandForArchitectureMapBatch(
  request: ArchitectureRefinementRequest,
  content: ArchitectureSnapshotContent,
  modules: Module[],
  connections: ModuleConnection[],
  decisions: PlanningDecision[],
  openQuestions: OpenQuestion[],
): ArchitectureCommand | { error: string } {
  const parsed = architectureMapRefinementInputSchema.safeParse(request.input)
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Invalid atomic Architecture refinement.',
    }
  }
  const input = parsed.data
  const authenticatedUserId = z.uuid().safeParse(request.authenticatedUserId)
  const requiresAuthenticatedUser =
    input.resolveQuestions.length > 0 ||
    input.decisionActions.length > 0 ||
    input.decisionReplacements.length > 0 ||
    input.recordDecisions.some((decision) => decision.provenance === 'user')
  if (requiresAuthenticatedUser && !authenticatedUserId.success) {
    return {
      error:
        'Authenticated project-owner identity is required to resolve questions or confirm decisions.',
    }
  }
  const existingById = new Map(modules.map((module) => [module.id, module]))
  const deletedIds = new Set(input.deleteModuleIds)
  const currentVersionId = request.turnIdentity.artifactVersionId

  const openQuestionsById = new Map(openQuestions.map((question) => [question.id, question]))
  for (const resolution of input.resolveQuestions) {
    const question = openQuestionsById.get(resolution.questionId)
    if (!question || question.status !== 'open') {
      return { error: 'Architecture question to resolve was not found or is already resolved.' }
    }
    if (currentVersionId && question.artifact_version_id !== currentVersionId) {
      return { error: 'Architecture question belongs to an older version.' }
    }
  }

  const decisionsById = new Map(decisions.map((decision) => [decision.id, decision]))
  for (const action of input.decisionActions) {
    const decision = decisionsById.get(action.decisionId)
    if (!decision || decision.state !== 'proposed') {
      return { error: 'Architecture decision to review was not found or is no longer proposed.' }
    }
    if (currentVersionId && decision.artifact_version_id !== currentVersionId) {
      return { error: 'Architecture decision belongs to an older version.' }
    }
  }

  const decisionsToSupersede = [
    ...input.resolveQuestions.flatMap((question) =>
      question.supersedesDecisionId ? [question.supersedesDecisionId] : [],
    ),
    ...input.recordDecisions.flatMap((decision) =>
      decision.supersedesDecisionId ? [decision.supersedesDecisionId] : [],
    ),
    ...input.decisionReplacements.map((replacement) => replacement.supersedesDecisionId),
  ]
  for (const decisionId of decisionsToSupersede) {
    const decision = decisionsById.get(decisionId)
    if (!decision || !['proposed', 'accepted'].includes(decision.state)) {
      return { error: 'Architecture decision to supersede was not found or is no longer active.' }
    }
    if (currentVersionId && decision.artifact_version_id !== currentVersionId) {
      return { error: 'Architecture decision to supersede belongs to an older version.' }
    }
  }
  for (const replacement of input.decisionReplacements) {
    const decision = decisionsById.get(replacement.decisionId)
    if (!decision || !['proposed', 'accepted'].includes(decision.state)) {
      return { error: 'Replacement Architecture decision was not found or is no longer active.' }
    }
    if (currentVersionId && decision.artifact_version_id !== currentVersionId) {
      return { error: 'Replacement Architecture decision belongs to an older version.' }
    }
    if (decision.supersedes_decision_id !== null && decision.supersedes_decision_id !== undefined) {
      return { error: 'Replacement Architecture decision already supersedes another decision.' }
    }
  }

  const knownAssumptionStatements = new Set(
    content.assumptions.map((assumption) => assumption.statement.trim().toLocaleLowerCase()),
  )
  for (const decision of input.recordDecisions) {
    const statementKey = decision.statement.trim().toLocaleLowerCase()
    if (knownAssumptionStatements.has(statementKey)) {
      return {
        error:
          'That Architecture decision is already recorded. Review its exact decision ID instead of duplicating it.',
      }
    }
    knownAssumptionStatements.add(statementKey)
  }

  for (const moduleId of deletedIds) {
    if (!existingById.has(moduleId))
      return { error: 'Architecture module to delete was not found.' }
  }
  for (const update of input.updateModules) {
    if (!existingById.has(update.moduleId)) {
      return { error: 'Architecture module to update was not found.' }
    }
    if (deletedIds.has(update.moduleId)) {
      return { error: 'One Architecture refinement cannot update and delete the same module.' }
    }
  }

  const localModules = new Map(
    input.createModules.map((module, index) => [
      module.key,
      {
        ...module,
        id: deterministicEntityId(
          request.turnIdentity.changeSetId,
          `module:${request.startingSequence}:${index}:${module.key}`,
        ),
      },
    ]),
  )
  const resolveModule = (reference: string) =>
    localModules.get(reference)?.id ?? existingById.get(reference)?.id ?? null

  const disconnectPairs = new Set<string>()
  const disconnectedConnectionIds = new Set<string>()
  for (const disconnect of input.disconnectModules) {
    if (
      !existingById.has(disconnect.sourceModuleId) ||
      !existingById.has(disconnect.targetModuleId)
    ) {
      return { error: 'Both modules in a disconnection must already exist.' }
    }
    const pairKey = `${disconnect.sourceModuleId}\u0000${disconnect.targetModuleId}`
    if (disconnectPairs.has(pairKey)) {
      return { error: 'Each Architecture module pair may be disconnected only once.' }
    }
    disconnectPairs.add(pairKey)
    const matching = connections.filter(
      (connection) =>
        connection.source_module_id === disconnect.sourceModuleId &&
        connection.target_module_id === disconnect.targetModuleId,
    )
    if (matching.length === 0) {
      return { error: 'The requested Architecture connection does not exist.' }
    }
    for (const connection of matching) disconnectedConnectionIds.add(connection.id)
  }

  const survivingConnections = connections.filter(
    (connection) =>
      !disconnectedConnectionIds.has(connection.id) &&
      !deletedIds.has(connection.source_module_id) &&
      !deletedIds.has(connection.target_module_id),
  )
  const knownConnectionKeys = new Set(
    survivingConnections.map((connection) =>
      connectionKey({
        sourceModuleId: connection.source_module_id,
        targetModuleId: connection.target_module_id,
        sourceExitPoint: connection.source_exit_point,
        targetEntryPoint: connection.target_entry_point,
      }),
    ),
  )
  const requestedConnections: Array<{
    id: string
    sourceModuleId: string
    targetModuleId: string
    sourceExitPoint: string
    targetEntryPoint: string
  }> = []
  for (const [index, requested] of input.connectModules.entries()) {
    const sourceModuleId = resolveModule(requested.source)
    const targetModuleId = resolveModule(requested.target)
    if (!sourceModuleId || !targetModuleId) {
      return {
        error: 'Every Architecture connection must reference an existing ID or new local key.',
      }
    }
    if (sourceModuleId === targetModuleId) {
      return { error: 'Architecture connections cannot link a module to itself.' }
    }
    if (deletedIds.has(sourceModuleId) || deletedIds.has(targetModuleId)) {
      return {
        error: 'An Architecture connection cannot use a module deleted in the same refinement.',
      }
    }
    const nextConnection = {
      id: deterministicEntityId(
        request.turnIdentity.changeSetId,
        `connection:${request.startingSequence}:${index}:${sourceModuleId}:${targetModuleId}:${requested.sourceExitPoint}:${requested.targetEntryPoint}`,
      ),
      sourceModuleId,
      targetModuleId,
      sourceExitPoint: requested.sourceExitPoint,
      targetEntryPoint: requested.targetEntryPoint,
    }
    const key = connectionKey(nextConnection)
    if (knownConnectionKeys.has(key)) {
      return { error: 'That Architecture connection already exists.' }
    }
    knownConnectionKeys.add(key)
    requestedConnections.push(nextConnection)
  }

  type DesiredModule = {
    id: string
    name: string
    domain: string | null
    description: string | null
    responsibilities: string[]
    boundaries: string[]
    entryPoints: string[]
    exitPoints: string[]
  }
  const desiredById = new Map<string, DesiredModule>()
  for (const architectureModule of modules) {
    const capability = content.capabilities.find(
      (candidate) => candidate.id === architectureModule.id,
    )
    desiredById.set(architectureModule.id, {
      id: architectureModule.id,
      name: architectureModule.name,
      domain: architectureModule.domain,
      description: architectureModule.description,
      responsibilities: capability ? [...capability.responsibilities] : [],
      boundaries: capability ? [...capability.boundaries] : [],
      entryPoints: [...architectureModule.entry_points],
      exitPoints: [...architectureModule.exit_points],
    })
  }
  for (const created of localModules.values()) {
    desiredById.set(created.id, {
      id: created.id,
      name: created.name,
      domain: created.domain?.trim() || null,
      description: created.description,
      responsibilities: created.responsibilities ?? [created.description],
      boundaries: created.boundaries ?? ['Implementation detail is deferred to the Work Plan.'],
      entryPoints: [...created.entryPoints],
      exitPoints: [...created.exitPoints],
    })
  }
  for (const update of input.updateModules) {
    const desired = desiredById.get(update.moduleId)
    if (!desired) return { error: 'Architecture module to update was not found.' }
    if (update.name !== undefined) desired.name = update.name
    if (update.domain !== undefined) desired.domain = update.domain.trim() || null
    if (update.description !== undefined) desired.description = update.description.trim() || null
    if (update.responsibilities !== undefined) {
      desired.responsibilities = [...update.responsibilities]
    }
    if (update.boundaries !== undefined) desired.boundaries = [...update.boundaries]
    if (update.entryPoints !== undefined) desired.entryPoints = [...update.entryPoints]
    if (update.exitPoints !== undefined) desired.exitPoints = [...update.exitPoints]
  }
  for (const connection of requestedConnections) {
    const source = desiredById.get(connection.sourceModuleId)
    const target = desiredById.get(connection.targetModuleId)
    if (!source || !target) return { error: 'Architecture connection module was not found.' }
    source.exitPoints = appendUnique(source.exitPoints, connection.sourceExitPoint)
    target.entryPoints = appendUnique(target.entryPoints, connection.targetEntryPoint)
  }

  const capabilities = content.capabilities
    .filter((capability) => !deletedIds.has(capability.id))
    .map((capability) => {
      const desired = desiredById.get(capability.id)
      if (!desired) return capability
      const explicit = input.updateModules.find((update) => update.moduleId === capability.id)
      return {
        ...capability,
        name: desired.name,
        ...(explicit?.description !== undefined
          ? { purpose: capabilityDescription(desired.name, desired.description) }
          : {}),
        ...(explicit?.responsibilities !== undefined
          ? { responsibilities: desired.responsibilities }
          : {}),
        ...(explicit?.boundaries !== undefined ? { boundaries: desired.boundaries } : {}),
      }
    })
  for (const created of localModules.values()) {
    capabilities.push({
      id: created.id,
      name: created.name,
      purpose: created.description,
      responsibilities: created.responsibilities ?? [created.description],
      boundaries: created.boundaries ?? ['Implementation detail is deferred to the Work Plan.'],
    })
  }
  if (capabilities.length === 0) {
    return { error: 'Architecture must keep at least one capability.' }
  }

  let importantFlows = content.important_flows
    .map((flow) => ({
      ...flow,
      capability_ids: flow.capability_ids.filter((id) => !deletedIds.has(id)),
    }))
    .filter((flow) => flow.capability_ids.length > 0)
  if (input.importantFlows) {
    importantFlows = []
    for (const flow of input.importantFlows) {
      const capabilityIds = flow.capabilityRefs.map((reference) => resolveModule(reference))
      if (capabilityIds.some((capabilityId) => !capabilityId || deletedIds.has(capabilityId))) {
        return {
          error: 'Every important flow must reference an existing capability ID or new local key.',
        }
      }
      importantFlows.push({
        id: flow.key,
        actor: flow.actor,
        outcome: flow.outcome,
        capability_ids: capabilityIds as string[],
      })
    }
  }
  if (content.important_flows.length > 0 && importantFlows.length === 0) {
    return { error: 'Architecture must keep at least one important flow.' }
  }

  let operationIndex = 0
  const takeOperationId = (): string | null =>
    request.turnIdentity.operationIds[request.startingSequence + operationIndex++] ?? null
  const operations: ArchitectureOperation[] = []
  const maxX = Math.max(-320, ...modules.map((module) => module.position.x))

  for (const [index, created] of [...localModules.values()].entries()) {
    const desired = desiredById.get(created.id)
    const operationId = takeOperationId()
    if (!desired || !operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({
      operationId,
      type: 'module.create',
      module: {
        id: desired.id,
        name: desired.name,
        domain: desired.domain,
        description: desired.description,
        position: { x: maxX + 320 * (index + 1), y: 0 },
        color: MODULE_COLOR,
        entryPoints: desired.entryPoints,
        exitPoints: desired.exitPoints,
      },
    })
  }

  for (const architectureModule of modules) {
    if (deletedIds.has(architectureModule.id)) continue
    const desired = desiredById.get(architectureModule.id)
    if (!desired) continue
    const changes = {
      ...(desired.name !== architectureModule.name ? { name: desired.name } : {}),
      ...(desired.domain !== architectureModule.domain ? { domain: desired.domain } : {}),
      ...(desired.description !== architectureModule.description
        ? { description: desired.description }
        : {}),
      ...(!sameStrings(
        desired.responsibilities,
        content.capabilities.find((capability) => capability.id === architectureModule.id)
          ?.responsibilities ?? [],
      )
        ? { responsibilities: desired.responsibilities }
        : {}),
      ...(!sameStrings(
        desired.boundaries,
        content.capabilities.find((capability) => capability.id === architectureModule.id)
          ?.boundaries ?? [],
      )
        ? { boundaries: desired.boundaries }
        : {}),
      ...(!sameStrings(desired.entryPoints, architectureModule.entry_points)
        ? { entryPoints: desired.entryPoints }
        : {}),
      ...(!sameStrings(desired.exitPoints, architectureModule.exit_points)
        ? { exitPoints: desired.exitPoints }
        : {}),
    }
    if (Object.keys(changes).length === 0) continue
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({
      operationId,
      type: 'module.update',
      moduleId: architectureModule.id,
      changes,
    })
  }

  for (const connection of connections) {
    if (!disconnectedConnectionIds.has(connection.id)) continue
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({
      operationId,
      type: 'module_connection.delete',
      connectionId: connection.id,
    })
  }

  for (const moduleId of input.deleteModuleIds) {
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({ operationId, type: 'module.delete', moduleId })
  }

  for (const connection of requestedConnections) {
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({
      operationId,
      type: 'module_connection.create',
      connection,
    })
  }

  const userActor = {
    type: 'user' as const,
    ...(authenticatedUserId.success ? { userId: authenticatedUserId.data } : {}),
    label: 'Project owner',
  }
  const assistantActor = { type: 'assistant' as const, label: 'MermaidAI assistant' }
  const userEvidence = chatTurnEvidence(request, 'user')
  const assistantEvidence = chatTurnEvidence(request, 'assistant')
  const resolvedDecisionIds = new Map<string, string>()

  for (const resolution of input.resolveQuestions) {
    const question = openQuestionsById.get(resolution.questionId)
    if (!question) return { error: 'Architecture question to resolve was not found.' }
    const reason = `The project owner answered the open Architecture question in this chat turn.`
    if (resolution.supersedesDecisionId) {
      const supersedeOperationId = takeOperationId()
      if (!supersedeOperationId) {
        return { error: 'No durable operation ID remains for this Architecture refinement.' }
      }
      operations.push({
        operationId: supersedeOperationId,
        type: 'decision.update',
        decisionId: resolution.supersedesDecisionId,
        changes: {
          state: 'superseded',
          actor: userActor,
          reason,
          evidence: userEvidence,
        },
      })
    }
    const questionOperationId = takeOperationId()
    const createDecisionOperationId = takeOperationId()
    const acceptDecisionOperationId = takeOperationId()
    if (!questionOperationId || !createDecisionOperationId || !acceptDecisionOperationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    const decisionId = deterministicEntityId(
      request.turnIdentity.changeSetId,
      `question-resolution:${resolution.questionId}`,
    )
    resolvedDecisionIds.set(resolution.questionId, decisionId)
    operations.push({
      operationId: questionOperationId,
      type: 'question.resolve',
      questionId: resolution.questionId,
      resolution: resolution.resolution,
    })
    operations.push({
      operationId: createDecisionOperationId,
      type: 'decision.create',
      decision: {
        id: decisionId,
        category: question.section,
        statement: resolution.resolution,
        state: 'proposed',
        provenance: 'user',
        readinessImpact: 'non_blocking',
        supersedesDecisionId: resolution.supersedesDecisionId ?? null,
        actor: userActor,
        reason,
        evidence: userEvidence,
      },
    })
    operations.push({
      operationId: acceptDecisionOperationId,
      type: 'decision.update',
      decisionId,
      changes: {
        state: 'accepted',
        actor: userActor,
        reason,
        evidence: userEvidence,
      },
    })
  }

  for (const action of input.decisionActions) {
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({
      operationId,
      type: 'decision.update',
      decisionId: action.decisionId,
      changes: {
        state: action.action === 'accept' ? 'accepted' : 'rejected',
        actor: userActor,
        reason: action.reason,
        evidence: userEvidence,
      },
    })
  }

  for (const replacement of input.decisionReplacements) {
    const supersedeOperationId = takeOperationId()
    const linkOperationId = takeOperationId()
    if (!supersedeOperationId || !linkOperationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({
      operationId: supersedeOperationId,
      type: 'decision.update',
      decisionId: replacement.supersedesDecisionId,
      changes: {
        state: 'superseded',
        actor: userActor,
        reason: replacement.reason,
        evidence: userEvidence,
      },
    })
    operations.push({
      operationId: linkOperationId,
      type: 'decision.update',
      decisionId: replacement.decisionId,
      changes: {
        supersedesDecisionId: replacement.supersedesDecisionId,
        actor: userActor,
        reason: replacement.reason,
        evidence: userEvidence,
      },
    })
  }

  const recordedDecisionIds = new Map<string, string>()
  for (const decision of input.recordDecisions) {
    if (decision.supersedesDecisionId) {
      const supersedeOperationId = takeOperationId()
      if (!supersedeOperationId) {
        return { error: 'No durable operation ID remains for this Architecture refinement.' }
      }
      operations.push({
        operationId: supersedeOperationId,
        type: 'decision.update',
        decisionId: decision.supersedesDecisionId,
        changes: {
          state: 'superseded',
          actor: userActor,
          reason: decision.reason,
          evidence: userEvidence,
        },
      })
    }
    const createOperationId = takeOperationId()
    if (!createOperationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    const decisionId = deterministicEntityId(
      request.turnIdentity.changeSetId,
      `decision:${request.startingSequence}:${decision.key}`,
    )
    recordedDecisionIds.set(decision.key, decisionId)
    const actor = decision.provenance === 'user' ? userActor : assistantActor
    const evidence = decision.provenance === 'user' ? userEvidence : assistantEvidence
    operations.push({
      operationId: createOperationId,
      type: 'decision.create',
      decision: {
        id: decisionId,
        category: decision.category,
        statement: decision.statement,
        state: 'proposed',
        provenance: decision.provenance,
        readinessImpact: decision.readinessImpact,
        supersedesDecisionId: decision.supersedesDecisionId ?? null,
        actor,
        reason: decision.reason,
        evidence,
      },
    })
    if (decision.provenance === 'user') {
      const acceptOperationId = takeOperationId()
      if (!acceptOperationId) {
        return { error: 'No durable operation ID remains for this Architecture refinement.' }
      }
      operations.push({
        operationId: acceptOperationId,
        type: 'decision.update',
        decisionId,
        changes: {
          state: 'accepted',
          actor: userActor,
          reason: decision.reason,
          evidence: userEvidence,
        },
      })
    }
  }
  if (operations.length === 0) {
    return { error: 'The Architecture already matches that refinement.' }
  }

  const removedPairs = new Set(
    input.disconnectModules.map(
      (disconnect) => `${disconnect.sourceModuleId}\u0000${disconnect.targetModuleId}`,
    ),
  )
  const contentConnections = content.connections.filter(
    (connection) =>
      !deletedIds.has(connection.from_capability_id) &&
      !deletedIds.has(connection.to_capability_id) &&
      !removedPairs.has(`${connection.from_capability_id}\u0000${connection.to_capability_id}`),
  )
  for (const connection of requestedConnections) {
    const source = desiredById.get(connection.sourceModuleId)
    const target = desiredById.get(connection.targetModuleId)
    contentConnections.push({
      from_capability_id: connection.sourceModuleId,
      to_capability_id: connection.targetModuleId,
      description: `${source?.name ?? 'Source'} sends ${connection.sourceExitPoint} to ${target?.name ?? 'target'} as ${connection.targetEntryPoint}.`,
    })
  }

  const rejectedDecisionIds = new Set(
    input.decisionActions
      .filter((action) => action.action === 'reject')
      .map((action) => action.decisionId),
  )
  const supersededDecisionIds = new Set(decisionsToSupersede)
  const assumptions = content.assumptions.filter(
    (assumption) =>
      !rejectedDecisionIds.has(assumption.id) && !supersededDecisionIds.has(assumption.id),
  )
  for (const resolution of input.resolveQuestions) {
    assumptions.push({
      id: resolvedDecisionIds.get(resolution.questionId)!,
      statement: resolution.resolution,
    })
  }
  for (const decision of input.recordDecisions) {
    assumptions.push({ id: recordedDecisionIds.get(decision.key)!, statement: decision.statement })
  }
  const resolvedQuestionIds = new Set(
    input.resolveQuestions.map((resolution) => resolution.questionId),
  )

  return {
    projectId: request.projectId,
    changeSetId: request.turnIdentity.changeSetId,
    turnId: request.turnIdentity.turnId,
    expectedRevision: request.turnIdentity.expectedRevision,
    operations,
    architectureContent: architectureSnapshotContentSchema.parse({
      ...content,
      ...(input.objective !== undefined ? { objective: input.objective } : {}),
      ...(input.outcomes !== undefined ? { outcomes: input.outcomes } : {}),
      ...(input.actors !== undefined ? { actors: input.actors } : {}),
      capabilities,
      connections: contentConnections,
      important_flows: importantFlows,
      assumptions,
      blockers: content.blockers.filter((blocker) => !resolvedQuestionIds.has(blocker.id)),
    }),
  }
}

async function commandForArchitectureFlowBatch(
  request: ArchitectureRefinementRequest,
  content: ArchitectureSnapshotContent,
  modules: Module[],
): Promise<ArchitectureCommand | { error: string }> {
  const parsed = architectureFlowRefinementInputSchema.safeParse(request.input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid atomic flow refinement.' }
  }
  const input = parsed.data
  if (!modules.some((module) => module.id === input.moduleId)) {
    return { error: 'The target Architecture module does not exist.' }
  }

  const graphResult = await getGraphForModule(input.moduleId)
  if (!graphResult.success) return graphResult
  const existingNodes = graphResult.data.nodes
  const existingEdges = graphResult.data.edges
  const existingNodeIds = new Set(existingNodes.map((node) => node.id))
  const existingEdgeIds = new Set(existingEdges.map((edge) => edge.id))
  const deletedNodeIds = new Set(input.deleteNodeIds)
  const deletedEdgeIds = new Set(input.deleteEdgeIds)

  if (new Set(input.updateNodes.map((node) => node.nodeId)).size !== input.updateNodes.length) {
    return { error: 'Each flow node may be updated only once.' }
  }
  if (deletedNodeIds.size !== input.deleteNodeIds.length) {
    return { error: 'Each flow node may be deleted only once.' }
  }
  if (new Set(input.updateEdges.map((edge) => edge.edgeId)).size !== input.updateEdges.length) {
    return { error: 'Each flow edge may be updated only once.' }
  }
  if (deletedEdgeIds.size !== input.deleteEdgeIds.length) {
    return { error: 'Each flow edge may be deleted only once.' }
  }

  for (const update of input.updateNodes) {
    if (!existingNodeIds.has(update.nodeId)) return { error: 'Flow node to update was not found.' }
    if (deletedNodeIds.has(update.nodeId)) {
      return { error: 'One Architecture refinement cannot update and delete the same flow node.' }
    }
  }
  for (const nodeId of deletedNodeIds) {
    if (!existingNodeIds.has(nodeId)) return { error: 'Flow node to delete was not found.' }
  }
  for (const update of input.updateEdges) {
    if (!existingEdgeIds.has(update.edgeId)) return { error: 'Flow edge to update was not found.' }
    if (deletedEdgeIds.has(update.edgeId)) {
      return { error: 'One Architecture refinement cannot update and delete the same flow edge.' }
    }
    const edge = existingEdges.find((candidate) => candidate.id === update.edgeId)
    if (
      edge &&
      (deletedNodeIds.has(edge.source_node_id) || deletedNodeIds.has(edge.target_node_id))
    ) {
      return { error: 'A flow edge attached to a deleted node cannot be updated.' }
    }
  }
  for (const edgeId of deletedEdgeIds) {
    if (!existingEdgeIds.has(edgeId)) return { error: 'Flow edge to delete was not found.' }
  }

  const localNodes = new Map(
    input.createNodes.map((node, index) => [
      node.key,
      {
        ...node,
        id: deterministicEntityId(
          request.turnIdentity.changeSetId,
          `node:${request.startingSequence}:${index}:${node.key}`,
        ),
      },
    ]),
  )
  const resolveNode = (reference: string) =>
    localNodes.get(reference)?.id ?? (existingNodeIds.has(reference) ? reference : null)
  const requestedEdges: Array<{
    id: string
    moduleId: string
    sourceNodeId: string
    targetNodeId: string
    label: string | null
    condition: string | null
  }> = []
  const edgeUpdates = new Map(input.updateEdges.map((update) => [update.edgeId, update]))
  const knownEdgeKeys = new Set<string>()
  for (const edge of existingEdges) {
    if (
      deletedEdgeIds.has(edge.id) ||
      deletedNodeIds.has(edge.source_node_id) ||
      deletedNodeIds.has(edge.target_node_id)
    ) {
      continue
    }
    const update = edgeUpdates.get(edge.id)
    const edgeKey = [
      edge.source_node_id,
      edge.target_node_id,
      update?.label === undefined ? (edge.label ?? '') : update.label.trim(),
      update?.condition === undefined ? (edge.condition ?? '') : update.condition.trim(),
    ].join('\u0000')
    if (knownEdgeKeys.has(edgeKey)) {
      return { error: 'The flow edge updates would create a duplicate edge.' }
    }
    knownEdgeKeys.add(edgeKey)
  }
  for (const [index, requested] of input.createEdges.entries()) {
    const sourceNodeId = resolveNode(requested.source)
    const targetNodeId = resolveNode(requested.target)
    if (!sourceNodeId || !targetNodeId) {
      return { error: 'Every flow edge must reference an existing node ID or new local key.' }
    }
    if (sourceNodeId === targetNodeId) return { error: 'Flow edges cannot link a node to itself.' }
    if (deletedNodeIds.has(sourceNodeId) || deletedNodeIds.has(targetNodeId)) {
      return { error: 'A flow edge cannot use a node deleted in the same refinement.' }
    }
    const edgeKey = [
      sourceNodeId,
      targetNodeId,
      requested.label?.trim() ?? '',
      requested.condition?.trim() ?? '',
    ].join('\u0000')
    if (knownEdgeKeys.has(edgeKey)) return { error: 'That flow edge already exists.' }
    knownEdgeKeys.add(edgeKey)
    requestedEdges.push({
      id: deterministicEntityId(
        request.turnIdentity.changeSetId,
        `edge:${request.startingSequence}:${index}:${sourceNodeId}:${targetNodeId}`,
      ),
      moduleId: input.moduleId,
      sourceNodeId,
      targetNodeId,
      label: requested.label?.trim() || null,
      condition: requested.condition?.trim() || null,
    })
  }

  let operationIndex = 0
  const takeOperationId = (): string | null =>
    request.turnIdentity.operationIds[request.startingSequence + operationIndex++] ?? null
  const operations: ArchitectureOperation[] = []
  const maxX = Math.max(-240, ...existingNodes.map((node) => node.position.x))

  for (const [index, node] of [...localNodes.values()].entries()) {
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({
      operationId,
      type: 'flow_node.create',
      node: {
        id: node.id,
        moduleId: input.moduleId,
        nodeType: node.nodeType,
        label: node.label,
        pseudocode: node.pseudocode ?? '',
        position: { x: maxX + 240 * (index + 1), y: 0 },
        color: '#2563eb',
      },
    })
  }
  for (const update of input.updateNodes) {
    const current = existingNodes.find((node) => node.id === update.nodeId)
    if (!current) return { error: 'Flow node to update was not found.' }
    const changes = {
      ...(update.label !== undefined && update.label !== current.label
        ? { label: update.label }
        : {}),
      ...(update.nodeType !== undefined && update.nodeType !== current.node_type
        ? { nodeType: update.nodeType }
        : {}),
      ...(update.pseudocode !== undefined && update.pseudocode !== current.pseudocode
        ? { pseudocode: update.pseudocode }
        : {}),
    }
    if (Object.keys(changes).length === 0) continue
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({ operationId, type: 'flow_node.update', nodeId: update.nodeId, changes })
  }
  for (const edgeId of input.deleteEdgeIds) {
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({ operationId, type: 'flow_edge.delete', edgeId })
  }
  for (const nodeId of input.deleteNodeIds) {
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({ operationId, type: 'flow_node.delete', nodeId })
  }
  for (const update of input.updateEdges) {
    const current = existingEdges.find((edge) => edge.id === update.edgeId)
    if (!current) return { error: 'Flow edge to update was not found.' }
    const nextLabel = update.label === undefined ? undefined : update.label.trim() || null
    const nextCondition =
      update.condition === undefined ? undefined : update.condition.trim() || null
    const changes = {
      ...(nextLabel !== undefined && nextLabel !== current.label ? { label: nextLabel } : {}),
      ...(nextCondition !== undefined && nextCondition !== current.condition
        ? { condition: nextCondition }
        : {}),
    }
    if (Object.keys(changes).length === 0) continue
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({ operationId, type: 'flow_edge.update', edgeId: update.edgeId, changes })
  }
  for (const edge of requestedEdges) {
    const operationId = takeOperationId()
    if (!operationId) {
      return { error: 'No durable operation ID remains for this Architecture refinement.' }
    }
    operations.push({ operationId, type: 'flow_edge.create', edge })
  }
  if (operations.length === 0) return { error: 'The flow already matches that refinement.' }

  return {
    projectId: request.projectId,
    changeSetId: request.turnIdentity.changeSetId,
    turnId: request.turnIdentity.turnId,
    expectedRevision: request.turnIdentity.expectedRevision,
    operations,
    architectureContent: content,
  }
}

function commandForModuleTool(
  request: ArchitectureRefinementRequest,
  content: ArchitectureSnapshotContent,
  modules: Module[],
): ArchitectureCommand | { error: string } {
  const { turnIdentity, startingSequence, toolName } = request

  if (toolName === 'create_module') {
    const parsed = createModuleInputSchema.safeParse(request.input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid module.' }
    const operationIds = operationIdsFor(turnIdentity, startingSequence, 1)
    if (!operationIds) return { error: 'No durable operation ID remains for this refinement.' }
    const moduleId = deterministicEntityId(turnIdentity.changeSetId, `module:${startingSequence}`)
    const description = capabilityDescription(parsed.data.name, parsed.data.description)
    const maxX = Math.max(-320, ...modules.map((module) => module.position.x))
    const operation: ArchitectureOperation = {
      operationId: operationIds[0],
      type: 'module.create',
      module: {
        id: moduleId,
        name: parsed.data.name,
        domain: parsed.data.domain?.trim() || null,
        description,
        position: { x: maxX + 320, y: 0 },
        color: MODULE_COLOR,
        entryPoints: parsed.data.entry_points ?? [],
        exitPoints: parsed.data.exit_points ?? [],
      },
    }
    return {
      projectId: request.projectId,
      changeSetId: turnIdentity.changeSetId,
      turnId: turnIdentity.turnId,
      expectedRevision: turnIdentity.expectedRevision,
      operations: [operation],
      architectureContent: architectureSnapshotContentSchema.parse({
        ...content,
        capabilities: [
          ...content.capabilities,
          {
            id: moduleId,
            name: parsed.data.name,
            purpose: description,
            responsibilities: [description],
            boundaries: ['Implementation detail is deferred to the Work Plan.'],
          },
        ],
      }),
    }
  }

  if (toolName === 'update_module') {
    const parsed = updateModuleInputSchema.safeParse(request.input)
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Invalid module update.' }
    if (!modules.some((module) => module.id === parsed.data.moduleId)) {
      return { error: 'Architecture module not found.' }
    }
    const operationIds = operationIdsFor(turnIdentity, startingSequence, 1)
    if (!operationIds) return { error: 'No durable operation ID remains for this refinement.' }
    const changes = {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.domain !== undefined ? { domain: parsed.data.domain.trim() || null } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description.trim() || null }
        : {}),
      ...(parsed.data.entry_points !== undefined ? { entryPoints: parsed.data.entry_points } : {}),
      ...(parsed.data.exit_points !== undefined ? { exitPoints: parsed.data.exit_points } : {}),
    }
    return {
      projectId: request.projectId,
      changeSetId: turnIdentity.changeSetId,
      turnId: turnIdentity.turnId,
      expectedRevision: turnIdentity.expectedRevision,
      operations: [
        {
          operationId: operationIds[0],
          type: 'module.update',
          moduleId: parsed.data.moduleId,
          changes,
        },
      ],
      architectureContent: architectureSnapshotContentSchema.parse({
        ...content,
        capabilities: content.capabilities.map((capability) =>
          capability.id === parsed.data.moduleId
            ? {
                ...capability,
                ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
                ...(parsed.data.description !== undefined
                  ? {
                      purpose: capabilityDescription(
                        parsed.data.name ?? capability.name,
                        parsed.data.description,
                      ),
                    }
                  : {}),
              }
            : capability,
        ),
      }),
    }
  }

  if (toolName === 'delete_module') {
    const parsed = deleteModuleInputSchema.safeParse(request.input)
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? 'Invalid module delete.' }
    if (!modules.some((module) => module.id === parsed.data.moduleId)) {
      return { error: 'Architecture module not found.' }
    }
    const capabilities = content.capabilities.filter(
      (capability) => capability.id !== parsed.data.moduleId,
    )
    if (capabilities.length === 0) {
      return { error: 'Architecture must keep at least one capability.' }
    }
    const importantFlows = content.important_flows
      .map((flow) => ({
        ...flow,
        capability_ids: flow.capability_ids.filter((id) => id !== parsed.data.moduleId),
      }))
      .filter((flow) => flow.capability_ids.length > 0)
    if (importantFlows.length === 0) {
      return { error: 'Architecture must keep at least one important flow.' }
    }
    const operationIds = operationIdsFor(turnIdentity, startingSequence, 1)
    if (!operationIds) return { error: 'No durable operation ID remains for this refinement.' }
    return {
      projectId: request.projectId,
      changeSetId: turnIdentity.changeSetId,
      turnId: turnIdentity.turnId,
      expectedRevision: turnIdentity.expectedRevision,
      operations: [
        {
          operationId: operationIds[0],
          type: 'module.delete',
          moduleId: parsed.data.moduleId,
        },
      ],
      architectureContent: architectureSnapshotContentSchema.parse({
        ...content,
        capabilities,
        connections: content.connections.filter(
          (connection) =>
            connection.from_capability_id !== parsed.data.moduleId &&
            connection.to_capability_id !== parsed.data.moduleId,
        ),
        important_flows: importantFlows,
      }),
    }
  }

  return { error: `Unsupported Architecture refinement tool "${toolName}".` }
}

function commandForConnectionTool(
  request: ArchitectureRefinementRequest,
  content: ArchitectureSnapshotContent,
  modules: Module[],
  connections: ModuleConnection[],
): ArchitectureCommand | { error: string } {
  const parsed = connectModulesInputSchema.safeParse(request.input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid connection.' }
  const source = modules.find((module) => module.id === parsed.data.sourceModuleId)
  const target = modules.find((module) => module.id === parsed.data.targetModuleId)
  if (!source || !target) return { error: 'Both Architecture modules must exist in this project.' }
  if (
    connections.some(
      (connection) =>
        connection.source_module_id === source.id &&
        connection.target_module_id === target.id &&
        connection.source_exit_point === parsed.data.sourceExitPoint &&
        connection.target_entry_point === parsed.data.targetEntryPoint,
    )
  ) {
    return { error: 'That Architecture connection already exists.' }
  }

  const needsSourceHandle = !source.exit_points.includes(parsed.data.sourceExitPoint)
  const needsTargetHandle = !target.entry_points.includes(parsed.data.targetEntryPoint)
  const operationCount = Number(needsSourceHandle) + Number(needsTargetHandle) + 1
  const operationIds = operationIdsFor(
    request.turnIdentity,
    request.startingSequence,
    operationCount,
  )
  if (!operationIds) {
    return { error: `Architecture connection needs ${operationCount} durable operation IDs.` }
  }

  let index = 0
  const operations: ArchitectureOperation[] = []
  if (needsSourceHandle) {
    operations.push({
      operationId: operationIds[index++],
      type: 'module.update',
      moduleId: source.id,
      changes: { exitPoints: [...source.exit_points, parsed.data.sourceExitPoint] },
    })
  }
  if (needsTargetHandle) {
    operations.push({
      operationId: operationIds[index++],
      type: 'module.update',
      moduleId: target.id,
      changes: { entryPoints: [...target.entry_points, parsed.data.targetEntryPoint] },
    })
  }
  operations.push({
    operationId: operationIds[index],
    type: 'module_connection.create',
    connection: {
      id: deterministicEntityId(
        request.turnIdentity.changeSetId,
        `connection:${request.startingSequence}:${source.id}:${target.id}:${parsed.data.sourceExitPoint}:${parsed.data.targetEntryPoint}`,
      ),
      sourceModuleId: source.id,
      targetModuleId: target.id,
      sourceExitPoint: parsed.data.sourceExitPoint,
      targetEntryPoint: parsed.data.targetEntryPoint,
    },
  })

  return {
    projectId: request.projectId,
    changeSetId: request.turnIdentity.changeSetId,
    turnId: request.turnIdentity.turnId,
    expectedRevision: request.turnIdentity.expectedRevision,
    operations,
    architectureContent: architectureSnapshotContentSchema.parse({
      ...content,
      connections: [
        ...content.connections,
        {
          from_capability_id: source.id,
          to_capability_id: target.id,
          description: `${source.name} sends ${parsed.data.sourceExitPoint} to ${target.name} as ${parsed.data.targetEntryPoint}.`,
        },
      ],
    }),
  }
}

async function commandForFlowTool(
  request: ArchitectureRefinementRequest,
  content: ArchitectureSnapshotContent,
  modules: Module[],
): Promise<ArchitectureCommand | { error: string }> {
  const commandBase = {
    projectId: request.projectId,
    changeSetId: request.turnIdentity.changeSetId,
    turnId: request.turnIdentity.turnId,
    expectedRevision: request.turnIdentity.expectedRevision,
    architectureContent: content,
  }
  const singleOperationId = () =>
    operationIdsFor(request.turnIdentity, request.startingSequence, 1)?.[0] ?? null

  if (request.toolName === 'create_node') {
    const parsed = createNodeInputSchema.safeParse(request.input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid flow node.' }
    if (!modules.some((module) => module.id === parsed.data.moduleId)) {
      return { error: 'The target Architecture module does not exist.' }
    }
    const operationId = singleOperationId()
    if (!operationId) return { error: 'No durable operation ID remains for this refinement.' }
    return {
      ...commandBase,
      operations: [
        {
          operationId,
          type: 'flow_node.create',
          node: {
            id: deterministicEntityId(
              request.turnIdentity.changeSetId,
              `node:${request.startingSequence}`,
            ),
            moduleId: parsed.data.moduleId,
            nodeType: parsed.data.nodeType,
            label: parsed.data.label,
            pseudocode: parsed.data.pseudocode ?? '',
            position: { x: 0, y: 0 },
            color: '#2563eb',
          },
        },
      ],
    }
  }

  if (request.toolName === 'update_node') {
    const parsed = updateNodeInputSchema.safeParse(request.input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid node update.' }
    const operationId = singleOperationId()
    if (!operationId) return { error: 'No durable operation ID remains for this refinement.' }
    return {
      ...commandBase,
      operations: [
        {
          operationId,
          type: 'flow_node.update',
          nodeId: parsed.data.nodeId,
          changes: {
            ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
            ...(parsed.data.nodeType !== undefined ? { nodeType: parsed.data.nodeType } : {}),
            ...(parsed.data.pseudocode !== undefined ? { pseudocode: parsed.data.pseudocode } : {}),
          },
        },
      ],
    }
  }

  if (request.toolName === 'delete_node') {
    const parsed = deleteNodeInputSchema.safeParse(request.input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid node delete.' }
    const operationId = singleOperationId()
    if (!operationId) return { error: 'No durable operation ID remains for this refinement.' }
    return {
      ...commandBase,
      operations: [{ operationId, type: 'flow_node.delete', nodeId: parsed.data.nodeId }],
    }
  }

  if (request.toolName === 'create_edge') {
    const parsed = createEdgeInputSchema.safeParse(request.input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid flow edge.' }
    if (!modules.some((module) => module.id === parsed.data.moduleId)) {
      return { error: 'The target Architecture module does not exist.' }
    }
    const operationId = singleOperationId()
    if (!operationId) return { error: 'No durable operation ID remains for this refinement.' }
    return {
      ...commandBase,
      operations: [
        {
          operationId,
          type: 'flow_edge.create',
          edge: {
            id: deterministicEntityId(
              request.turnIdentity.changeSetId,
              `edge:${request.startingSequence}`,
            ),
            moduleId: parsed.data.moduleId,
            sourceNodeId: parsed.data.sourceNodeId,
            targetNodeId: parsed.data.targetNodeId,
            label: parsed.data.label ?? null,
            condition: parsed.data.condition ?? null,
          },
        },
      ],
    }
  }

  if (request.toolName === 'update_edge') {
    const parsed = updateEdgeInputSchema.safeParse(request.input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid edge update.' }
    const operationId = singleOperationId()
    if (!operationId) return { error: 'No durable operation ID remains for this refinement.' }
    return {
      ...commandBase,
      operations: [
        {
          operationId,
          type: 'flow_edge.update',
          edgeId: parsed.data.edgeId,
          changes: {
            ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
            ...(parsed.data.condition !== undefined ? { condition: parsed.data.condition } : {}),
          },
        },
      ],
    }
  }

  if (request.toolName === 'delete_edge') {
    const parsed = deleteEdgeInputSchema.safeParse(request.input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid edge delete.' }
    const operationId = singleOperationId()
    if (!operationId) return { error: 'No durable operation ID remains for this refinement.' }
    return {
      ...commandBase,
      operations: [{ operationId, type: 'flow_edge.delete', edgeId: parsed.data.edgeId }],
    }
  }

  if (request.toolName === 'insert_node_between') {
    const parsed = insertNodeBetweenInputSchema.safeParse(request.input)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid inserted flow node.' }
    }
    if (!modules.some((module) => module.id === parsed.data.moduleId)) {
      return { error: 'The target Architecture module does not exist.' }
    }
    const graph = await getGraphForModule(parsed.data.moduleId)
    if (!graph.success) return graph
    const nodeIds = new Set(graph.data.nodes.map((node) => node.id))
    if (!nodeIds.has(parsed.data.sourceNodeId) || !nodeIds.has(parsed.data.targetNodeId)) {
      return { error: 'Both surrounding flow nodes must exist in the target module.' }
    }
    const directEdges = graph.data.edges.filter(
      (edge) =>
        edge.source_node_id === parsed.data.sourceNodeId &&
        edge.target_node_id === parsed.data.targetNodeId,
    )
    const operationCount = directEdges.length + 3
    const operationIds = operationIdsFor(
      request.turnIdentity,
      request.startingSequence,
      operationCount,
    )
    if (!operationIds) {
      return { error: `Inserting this node needs ${operationCount} durable operation IDs.` }
    }
    const nodeId = deterministicEntityId(
      request.turnIdentity.changeSetId,
      `node:${request.startingSequence}:between`,
    )
    let index = 0
    const operations: ArchitectureOperation[] = directEdges.map((edge) => ({
      operationId: operationIds[index++],
      type: 'flow_edge.delete' as const,
      edgeId: edge.id,
    }))
    operations.push({
      operationId: operationIds[index++],
      type: 'flow_node.create',
      node: {
        id: nodeId,
        moduleId: parsed.data.moduleId,
        nodeType: parsed.data.nodeType,
        label: parsed.data.label,
        pseudocode: parsed.data.pseudocode ?? '',
        position: { x: 0, y: 0 },
        color: '#2563eb',
      },
    })
    operations.push({
      operationId: operationIds[index++],
      type: 'flow_edge.create',
      edge: {
        id: deterministicEntityId(request.turnIdentity.changeSetId, 'edge:between:incoming'),
        moduleId: parsed.data.moduleId,
        sourceNodeId: parsed.data.sourceNodeId,
        targetNodeId: nodeId,
        label: parsed.data.incomingEdgeLabel ?? directEdges[0]?.label ?? null,
        condition: directEdges[0]?.condition ?? null,
      },
    })
    operations.push({
      operationId: operationIds[index],
      type: 'flow_edge.create',
      edge: {
        id: deterministicEntityId(request.turnIdentity.changeSetId, 'edge:between:outgoing'),
        moduleId: parsed.data.moduleId,
        sourceNodeId: nodeId,
        targetNodeId: parsed.data.targetNodeId,
        label: parsed.data.outgoingEdgeLabel ?? null,
        condition: null,
      },
    })
    return { ...commandBase, operations }
  }

  return { error: `Unsupported Architecture refinement tool "${request.toolName}".` }
}

function dataFromReceipt(
  command: ArchitectureCommand,
  receipt: ArchitectureCommandReceipt,
): Record<string, unknown> | { error: string } {
  if (command.operations.length === 1) {
    const operation = command.operations[0]
    if (operation.type === 'module.create' || operation.type === 'module.update') {
      const architectureModule = moduleFromRow(committedRow(receipt, 0, 'modules'))
      return architectureModule
        ? { module: architectureModule }
        : { error: 'Committed Architecture receipt has no module row.' }
    }
    if (operation.type === 'module.delete') return { deletedModuleId: operation.moduleId }
    if (operation.type === 'flow_node.create' || operation.type === 'flow_node.update') {
      const node = nodeFromRow(committedRow(receipt, 0, 'flow_nodes'))
      return node
        ? { node, moduleId: node.module_id }
        : { error: 'Committed Architecture receipt has no flow-node row.' }
    }
    if (operation.type === 'flow_node.delete') {
      return { deletedNodeId: operation.nodeId }
    }
    if (operation.type === 'flow_edge.create' || operation.type === 'flow_edge.update') {
      const edge = edgeFromRow(committedRow(receipt, 0, 'flow_edges'))
      return edge
        ? { edge, moduleId: edge.module_id }
        : { error: 'Committed Architecture receipt has no flow-edge row.' }
    }
    if (operation.type === 'flow_edge.delete') return { deletedEdgeId: operation.edgeId }
  }

  const connectionIndex = command.operations.findIndex(
    (operation) => operation.type === 'module_connection.create',
  )
  if (connectionIndex >= 0) {
    const connection = connectionFromRow(
      committedRow(receipt, connectionIndex, 'module_connections'),
    )
    if (!connection) return { error: 'Committed Architecture receipt has no connection row.' }
    const moduleRows = command.operations.flatMap((operation, index) => {
      if (operation.type !== 'module.update') return []
      const architectureModule = moduleFromRow(committedRow(receipt, index, 'modules'))
      return architectureModule ? [architectureModule] : []
    })
    if (moduleRows.length !== command.operations.length - 1) {
      return { error: 'Committed Architecture receipt has incomplete handle updates.' }
    }
    const sourceModule = moduleRows.find((module) => module.id === connection.source_module_id)
    const targetModule = moduleRows.find((module) => module.id === connection.target_module_id)
    return {
      connection,
      ...(sourceModule ? { sourceModule } : {}),
      ...(targetModule ? { targetModule } : {}),
    }
  }

  const createdNodeIndex = command.operations.findIndex(
    (operation) => operation.type === 'flow_node.create',
  )
  const createdEdgeIndexes = command.operations.flatMap((operation, index) =>
    operation.type === 'flow_edge.create' ? [index] : [],
  )
  if (createdNodeIndex >= 0 && createdEdgeIndexes.length === 2) {
    const node = nodeFromRow(committedRow(receipt, createdNodeIndex, 'flow_nodes'))
    const edges = createdEdgeIndexes
      .map((index) => edgeFromRow(committedRow(receipt, index, 'flow_edges')))
      .filter((edge): edge is FlowEdge => edge !== null)
    if (!node || edges.length !== 2) {
      return { error: 'Committed Architecture receipt has incomplete inserted-node rows.' }
    }
    return {
      node,
      edges,
      moduleId: node.module_id,
      removedEdgeIds: command.operations.flatMap((operation) =>
        operation.type === 'flow_edge.delete' ? [operation.edgeId] : [],
      ),
    }
  }

  return { error: 'Committed Architecture receipt does not match the refinement.' }
}

function snapshotRows(value: unknown, collection: string): unknown[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
  const rows = (value as Record<string, unknown>)[collection]
  return Array.isArray(rows) ? rows : []
}

function batchDataFromReceipt(
  command: ArchitectureCommand,
  receipt: ArchitectureCommandReceipt,
): Record<string, unknown> | { error: string } {
  const createdModules: Module[] = []
  const updatedModules: Module[] = []
  const deletedModuleIds: string[] = []
  const createdConnections: ModuleConnection[] = []
  const deletedConnectionIds = new Set<string>()
  const createdNodes: FlowNode[] = []
  const updatedNodes: FlowNode[] = []
  const deletedNodeIds: string[] = []
  const createdEdges: FlowEdge[] = []
  const updatedEdges: FlowEdge[] = []
  const deletedEdgeIds = new Set<string>()

  for (const [index, operation] of command.operations.entries()) {
    const committedOperation = receipt.operations[index]
    if (!committedOperation || committedOperation.operationId !== operation.operationId) {
      return { error: 'Committed Architecture receipt does not match the atomic refinement.' }
    }

    if (operation.type === 'module.create' || operation.type === 'module.update') {
      const architectureModule = moduleFromRow(committedRow(receipt, index, 'modules'))
      if (!architectureModule) {
        return { error: 'Committed Architecture receipt has no module row.' }
      }
      ;(operation.type === 'module.create' ? createdModules : updatedModules).push(
        architectureModule,
      )
      continue
    }
    if (operation.type === 'module.delete') {
      deletedModuleIds.push(operation.moduleId)
      for (const row of snapshotRows(committedOperation.before, 'module_connections')) {
        const connection = connectionFromRow(row)
        if (connection) deletedConnectionIds.add(connection.id)
      }
      continue
    }
    if (operation.type === 'module_connection.create') {
      const connection = connectionFromRow(committedRow(receipt, index, 'module_connections'))
      if (!connection) return { error: 'Committed Architecture receipt has no connection row.' }
      createdConnections.push(connection)
      continue
    }
    if (operation.type === 'module_connection.delete') {
      deletedConnectionIds.add(operation.connectionId)
      continue
    }
    if (operation.type === 'flow_node.create' || operation.type === 'flow_node.update') {
      const node = nodeFromRow(committedRow(receipt, index, 'flow_nodes'))
      if (!node) return { error: 'Committed Architecture receipt has no flow-node row.' }
      ;(operation.type === 'flow_node.create' ? createdNodes : updatedNodes).push(node)
      continue
    }
    if (operation.type === 'flow_node.delete') {
      deletedNodeIds.push(operation.nodeId)
      for (const row of snapshotRows(committedOperation.before, 'flow_edges')) {
        const edge = edgeFromRow(row)
        if (edge) deletedEdgeIds.add(edge.id)
      }
      continue
    }
    if (operation.type === 'flow_edge.create' || operation.type === 'flow_edge.update') {
      const edge = edgeFromRow(committedRow(receipt, index, 'flow_edges'))
      if (!edge) return { error: 'Committed Architecture receipt has no flow-edge row.' }
      ;(operation.type === 'flow_edge.create' ? createdEdges : updatedEdges).push(edge)
      continue
    }
    if (operation.type === 'flow_edge.delete') deletedEdgeIds.add(operation.edgeId)
  }

  return {
    createdModules,
    updatedModules,
    deletedModuleIds,
    createdConnections,
    deletedConnectionIds: [...deletedConnectionIds],
    createdNodes,
    updatedNodes,
    deletedNodeIds,
    createdEdges,
    updatedEdges,
    deletedEdgeIds: [...deletedEdgeIds],
  }
}

export async function applyArchitectureRefinement(
  request: ArchitectureRefinementRequest,
): Promise<ArchitectureRefinementResult> {
  if (!z.uuid().safeParse(request.projectId).success) {
    return { success: false, error: 'Invalid Architecture project ID.' }
  }
  if (!Number.isInteger(request.startingSequence) || request.startingSequence < 0) {
    return { success: false, error: 'Invalid Architecture operation sequence.' }
  }
  if (request.turnIdentity.planningStage !== 'architecture') {
    return { success: false, error: 'Architecture refinement requires an Architecture turn.' }
  }

  const planningInputsPromise =
    request.toolName === 'refine_architecture_map'
      ? Promise.all([
          listPlanningDecisions(request.projectId),
          listOpenOpenQuestions(request.projectId),
        ])
      : Promise.resolve(null)
  const [activeVersion, modules, connections, planningInputs] = await Promise.all([
    getActivePlanningArtifactVersion(request.projectId, 'architecture'),
    listModulesByProject(request.projectId),
    listConnectionsByProject(request.projectId),
    planningInputsPromise,
  ])
  if (!activeVersion.success) return activeVersion
  if (!modules.success) return modules
  if (!connections.success) return connections
  if (planningInputs) {
    if (!planningInputs[0].success) return planningInputs[0]
    if (!planningInputs[1].success) return planningInputs[1]
  }
  if (!activeVersion.data || activeVersion.data.content_state !== 'complete') {
    return {
      success: false,
      error: 'A complete Architecture version is required before refinement.',
    }
  }
  if (
    request.turnIdentity.artifactVersionId &&
    activeVersion.data.id !== undefined &&
    activeVersion.data.id !== request.turnIdentity.artifactVersionId
  ) {
    return {
      success: false,
      error: 'Architecture changed before this refinement could be applied.',
    }
  }

  const isBatchRefinement =
    request.toolName === 'refine_architecture_map' ||
    request.toolName === 'refine_architecture_flow'
  const command =
    request.toolName === 'refine_architecture_map'
      ? commandForArchitectureMapBatch(
          request,
          activeVersion.data.content,
          modules.data,
          connections.data,
          planningInputs?.[0].success ? planningInputs[0].data : [],
          planningInputs?.[1].success ? planningInputs[1].data : [],
        )
      : request.toolName === 'refine_architecture_flow'
        ? await commandForArchitectureFlowBatch(request, activeVersion.data.content, modules.data)
        : request.toolName === 'connect_modules'
          ? commandForConnectionTool(
              request,
              activeVersion.data.content,
              modules.data,
              connections.data,
            )
          : ['create_module', 'update_module', 'delete_module'].includes(request.toolName)
            ? commandForModuleTool(request, activeVersion.data.content, modules.data)
            : await commandForFlowTool(request, activeVersion.data.content, modules.data)
  if ('error' in command) return { success: false, error: command.error }

  const result = await applyArchitectureCommand(command)
  if (!result.success) return result
  const committed = isBatchRefinement
    ? batchDataFromReceipt(command, result.data)
    : dataFromReceipt(command, result.data)
  if (typeof committed.error === 'string') return { success: false, error: committed.error }
  const firstOperationId = command.operations[0]?.operationId
  if (!firstOperationId || !result.data.architectureVersionId) {
    return { success: false, error: 'Committed Architecture refinement has no version identity.' }
  }

  return {
    success: true,
    data: {
      ...committed,
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
