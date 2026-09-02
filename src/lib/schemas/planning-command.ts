import { z } from 'zod'

import { architectureSnapshotContentSchema } from '@/lib/schemas/planning'
import { FLOW_NODE_TYPES } from '@/lib/schemas/flow-node'
import { PLANNING_DECISION_STATES } from '@/types/planning'

export const SEMANTIC_ARCHITECTURE_OPERATION_TYPES = [
  'module.create',
  'module.update',
  'module.delete',
  'module_connection.create',
  'module_connection.delete',
  'flow_node.create',
  'flow_node.update',
  'flow_node.delete',
  'flow_edge.create',
  'flow_edge.update',
  'flow_edge.delete',
  'question.create',
  'question.resolve',
  'question.delete',
  'decision.create',
  'decision.update',
] as const

export const PRESENTATION_ARCHITECTURE_OPERATION_TYPES = [
  'module.move',
  'module.recolor',
  'flow_node.move',
  'flow_node.recolor',
  'architecture.viewport.set',
] as const

export const ARCHITECTURE_OPERATION_TYPES = [
  ...SEMANTIC_ARCHITECTURE_OPERATION_TYPES,
  ...PRESENTATION_ARCHITECTURE_OPERATION_TYPES,
] as const

export type SemanticArchitectureOperationType =
  (typeof SEMANTIC_ARCHITECTURE_OPERATION_TYPES)[number]
export type PresentationArchitectureOperationType =
  (typeof PRESENTATION_ARCHITECTURE_OPERATION_TYPES)[number]
export type ArchitectureOperationType = (typeof ARCHITECTURE_OPERATION_TYPES)[number]
export type ArchitectureOperationClassification = 'semantic' | 'presentation'

const semanticOperationTypes = new Set<string>(SEMANTIC_ARCHITECTURE_OPERATION_TYPES)

export function getArchitectureOperationClassification(
  operationType: ArchitectureOperationType,
): ArchitectureOperationClassification {
  return semanticOperationTypes.has(operationType) ? 'semantic' : 'presentation'
}

const uuidSchema = z.uuid()
const boundedTextSchema = z.string().trim().min(1).max(4_000)
const optionalTextSchema = z.string().trim().max(4_000).nullable()
const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
const operationBase = { operationId: uuidSchema }

const createModuleOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('module.create'),
    module: z
      .object({
        id: uuidSchema,
        name: z.string().trim().min(1).max(100),
        domain: z.string().trim().max(80).nullable(),
        description: optionalTextSchema,
        position: pointSchema,
        color: z.string().trim().max(100),
        entryPoints: z.array(z.string().trim().min(1).max(200)).max(100),
        exitPoints: z.array(z.string().trim().min(1).max(200)).max(100),
      })
      .strict(),
  })
  .strict()

const updateModuleOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('module.update'),
    moduleId: uuidSchema,
    changes: z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        domain: z.string().trim().max(80).nullable().optional(),
        description: optionalTextSchema.optional(),
        responsibilities: z.array(boundedTextSchema).min(1).max(100).optional(),
        boundaries: z.array(boundedTextSchema).min(1).max(100).optional(),
        entryPoints: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
        exitPoints: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
      })
      .strict()
      .refine((changes) => Object.keys(changes).length > 0, 'At least one field is required.'),
  })
  .strict()

const deleteModuleOperationSchema = z
  .object({ ...operationBase, type: z.literal('module.delete'), moduleId: uuidSchema })
  .strict()

const moveModuleOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('module.move'),
    moduleId: uuidSchema,
    position: pointSchema,
  })
  .strict()

const recolorModuleOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('module.recolor'),
    moduleId: uuidSchema,
    color: z.string().trim().max(100),
  })
  .strict()

const createModuleConnectionOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('module_connection.create'),
    connection: z
      .object({
        id: uuidSchema,
        sourceModuleId: uuidSchema,
        targetModuleId: uuidSchema,
        sourceExitPoint: boundedTextSchema,
        targetEntryPoint: boundedTextSchema,
      })
      .strict()
      .refine((connection) => connection.sourceModuleId !== connection.targetModuleId, {
        path: ['targetModuleId'],
        message: 'Source and target modules must be different.',
      }),
  })
  .strict()

const deleteModuleConnectionOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('module_connection.delete'),
    connectionId: uuidSchema,
  })
  .strict()

const createFlowNodeOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('flow_node.create'),
    node: z
      .object({
        id: uuidSchema,
        moduleId: uuidSchema,
        nodeType: z.enum(FLOW_NODE_TYPES),
        label: z.string().trim().min(1).max(200),
        pseudocode: z.string().max(20_000),
        position: pointSchema,
        color: z.string().trim().max(100),
      })
      .strict(),
  })
  .strict()

const updateFlowNodeOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('flow_node.update'),
    nodeId: uuidSchema,
    changes: z
      .object({
        nodeType: z.enum(FLOW_NODE_TYPES).optional(),
        label: z.string().trim().min(1).max(200).optional(),
        pseudocode: z.string().max(20_000).optional(),
      })
      .strict()
      .refine((changes) => Object.keys(changes).length > 0, 'At least one field is required.'),
  })
  .strict()

const deleteFlowNodeOperationSchema = z
  .object({ ...operationBase, type: z.literal('flow_node.delete'), nodeId: uuidSchema })
  .strict()

const moveFlowNodeOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('flow_node.move'),
    nodeId: uuidSchema,
    position: pointSchema,
  })
  .strict()

const recolorFlowNodeOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('flow_node.recolor'),
    nodeId: uuidSchema,
    color: z.string().trim().max(100),
  })
  .strict()

const createFlowEdgeOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('flow_edge.create'),
    edge: z
      .object({
        id: uuidSchema,
        moduleId: uuidSchema,
        sourceNodeId: uuidSchema,
        targetNodeId: uuidSchema,
        label: optionalTextSchema,
        condition: optionalTextSchema,
      })
      .strict()
      .refine((edge) => edge.sourceNodeId !== edge.targetNodeId, {
        path: ['targetNodeId'],
        message: 'Source and target nodes must be different.',
      }),
  })
  .strict()

const updateFlowEdgeOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('flow_edge.update'),
    edgeId: uuidSchema,
    changes: z
      .object({ label: optionalTextSchema.optional(), condition: optionalTextSchema.optional() })
      .strict()
      .refine((changes) => Object.keys(changes).length > 0, 'At least one field is required.'),
  })
  .strict()

const deleteFlowEdgeOperationSchema = z
  .object({ ...operationBase, type: z.literal('flow_edge.delete'), edgeId: uuidSchema })
  .strict()

export const planningReadinessImpactSchema = z.enum(['blocking', 'non_blocking', 'deferred'])
export const planningDecisionProvenanceSchema = z.enum(['user', 'assistant', 'system'])
export const planningDecisionActorSchema = z
  .object({
    type: planningDecisionProvenanceSchema,
    userId: uuidSchema.optional(),
    label: z.string().trim().min(1).max(200),
  })
  .strict()
export const planningDecisionEvidenceSchema = z
  .object({
    type: z.string().trim().min(1).max(100),
    reference: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(1_000),
  })
  .strict()

const decisionAuditFields = {
  actor: planningDecisionActorSchema.optional(),
  reason: z.string().trim().min(1).max(2_000).optional(),
  evidence: z.array(planningDecisionEvidenceSchema).min(1).max(100).optional(),
}

function hasCompleteDecisionAudit(input: {
  actor?: unknown
  reason?: unknown
  evidence?: unknown
}): boolean {
  const supplied =
    input.actor !== undefined || input.reason !== undefined || input.evidence !== undefined
  return (
    !supplied ||
    (input.actor !== undefined && input.reason !== undefined && input.evidence !== undefined)
  )
}

const createQuestionOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('question.create'),
    question: z
      .object({
        id: uuidSchema,
        nodeId: uuidSchema,
        section: z.string().trim().min(1).max(100),
        question: z.string().trim().min(1).max(500),
        readinessImpact: planningReadinessImpactSchema,
        provenance: planningDecisionProvenanceSchema,
      })
      .strict(),
  })
  .strict()

const resolveQuestionOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('question.resolve'),
    questionId: uuidSchema,
    resolution: z.string().trim().min(1).max(1_000),
  })
  .strict()

const deleteQuestionOperationSchema = z
  .object({ ...operationBase, type: z.literal('question.delete'), questionId: uuidSchema })
  .strict()

const createDecisionOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('decision.create'),
    decision: z
      .object({
        id: uuidSchema,
        category: z.string().trim().min(1).max(100),
        statement: boundedTextSchema,
        state: z.enum(PLANNING_DECISION_STATES),
        provenance: planningDecisionProvenanceSchema,
        readinessImpact: planningReadinessImpactSchema.default('non_blocking'),
        supersedesDecisionId: uuidSchema.nullable(),
        ...decisionAuditFields,
      })
      .strict()
      .refine(hasCompleteDecisionAudit, {
        message: 'Decision actor, reason, and evidence must be supplied together.',
      }),
  })
  .strict()

const updateDecisionOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('decision.update'),
    decisionId: uuidSchema,
    changes: z
      .object({
        statement: boundedTextSchema.optional(),
        state: z.enum(PLANNING_DECISION_STATES).optional(),
        supersedesDecisionId: uuidSchema.nullable().optional(),
        readinessImpact: planningReadinessImpactSchema.optional(),
        ...decisionAuditFields,
      })
      .strict()
      .refine((changes) => Object.keys(changes).length > 0, 'At least one field is required.')
      .refine(hasCompleteDecisionAudit, {
        message: 'Decision actor, reason, and evidence must be supplied together.',
      }),
  })
  .strict()

const setArchitectureViewportOperationSchema = z
  .object({
    ...operationBase,
    type: z.literal('architecture.viewport.set'),
    viewport: z
      .object({
        x: z.number().finite(),
        y: z.number().finite(),
        zoom: z.number().finite().positive().max(10),
      })
      .strict(),
  })
  .strict()

export const architectureOperationSchema = z.discriminatedUnion('type', [
  createModuleOperationSchema,
  updateModuleOperationSchema,
  deleteModuleOperationSchema,
  moveModuleOperationSchema,
  recolorModuleOperationSchema,
  createModuleConnectionOperationSchema,
  deleteModuleConnectionOperationSchema,
  createFlowNodeOperationSchema,
  updateFlowNodeOperationSchema,
  deleteFlowNodeOperationSchema,
  moveFlowNodeOperationSchema,
  recolorFlowNodeOperationSchema,
  createFlowEdgeOperationSchema,
  updateFlowEdgeOperationSchema,
  deleteFlowEdgeOperationSchema,
  createQuestionOperationSchema,
  resolveQuestionOperationSchema,
  deleteQuestionOperationSchema,
  createDecisionOperationSchema,
  updateDecisionOperationSchema,
  setArchitectureViewportOperationSchema,
])

export const architectureCommandSchema = z
  .object({
    projectId: uuidSchema,
    changeSetId: uuidSchema,
    turnId: uuidSchema.nullable().optional(),
    expectedRevision: z.number().int().nonnegative(),
    operations: z.array(architectureOperationSchema).min(1).max(100),
    architectureContent: architectureSnapshotContentSchema.optional(),
  })
  .strict()
  .superRefine((command, ctx) => {
    const operationIds = command.operations.map((operation) => operation.operationId)
    if (new Set(operationIds).size !== operationIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['operations'],
        message: 'Operation IDs must be unique within a command.',
      })
    }

    const hasSemanticOperation = command.operations.some(
      (operation) => getArchitectureOperationClassification(operation.type) === 'semantic',
    )
    if (hasSemanticOperation && command.architectureContent === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['architectureContent'],
        message: 'Semantic Architecture commands require a complete Architecture snapshot.',
      })
    }
    if (!hasSemanticOperation && command.architectureContent !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['architectureContent'],
        message: 'Presentation-only commands cannot create an Architecture snapshot.',
      })
    }

    for (const [index, capability] of command.architectureContent?.capabilities.entries() ?? []) {
      if (!uuidSchema.safeParse(capability.id).success) {
        ctx.addIssue({
          code: 'custom',
          path: ['architectureContent', 'capabilities', index, 'id'],
          message: 'Command snapshots must use persisted module UUIDs as capability IDs.',
        })
      }
    }
  })

export type ArchitectureOperation = z.infer<typeof architectureOperationSchema>
export type ArchitectureCommand = z.infer<typeof architectureCommandSchema>
