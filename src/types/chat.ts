import type { PlanningArtifactKind } from '@/types/planning'

export type ChatRole = 'user' | 'assistant' | 'system'

export const AI_PROVIDERS = ['cerebras', 'anthropic', 'codex', 'gemini'] as const

export type AIProvider = (typeof AI_PROVIDERS)[number]

export const CHAT_MODES = [
  'discovery',
  'module_map',
  'module_detail',
  'scope_build',
  'flowchart_build',
  'brainstorm_build',
] as const

export type ChatMode = (typeof CHAT_MODES)[number]

export type GraphOperationType =
  | 'create_module'
  | 'update_module'
  | 'delete_module'
  | 'create_node'
  | 'update_node'
  | 'delete_node'
  | 'create_edge'
  | 'update_edge'
  | 'delete_edge'
  | 'connect_modules'

export type CreateModuleOperation = {
  type: 'create_module'
  payload: {
    name: string
    description?: string
  }
}

export type UpdateModuleOperation = {
  type: 'update_module'
  payload: {
    moduleId: string
    name?: string
    description?: string
  }
}

export type DeleteModuleOperation = {
  type: 'delete_module'
  payload: {
    moduleId: string
  }
}

export type CreateNodeOperation = {
  type: 'create_node'
  payload: {
    moduleId: string
    label: string
    nodeType: string
    pseudocode?: string
  }
}

export type UpdateNodeOperation = {
  type: 'update_node'
  payload: {
    nodeId: string
    label?: string
    nodeType?: string
    pseudocode?: string
  }
}

export type DeleteNodeOperation = {
  type: 'delete_node'
  payload: {
    nodeId: string
  }
}

export type CreateEdgeOperation = {
  type: 'create_edge'
  payload: {
    moduleId: string
    sourceNodeId: string
    targetNodeId: string
    label?: string
    condition?: string
  }
}

export type UpdateEdgeOperation = {
  type: 'update_edge'
  payload: {
    edgeId: string
    label?: string
    condition?: string
  }
}

export type DeleteEdgeOperation = {
  type: 'delete_edge'
  payload: {
    edgeId: string
  }
}

export type ConnectModulesOperation = {
  type: 'connect_modules'
  payload: {
    sourceModuleId: string
    targetModuleId: string
    sourceExitPoint: string
    targetEntryPoint: string
  }
}

export type GraphOperation =
  | CreateModuleOperation
  | UpdateModuleOperation
  | DeleteModuleOperation
  | CreateNodeOperation
  | UpdateNodeOperation
  | DeleteNodeOperation
  | CreateEdgeOperation
  | UpdateEdgeOperation
  | DeleteEdgeOperation
  | ConnectModulesOperation

export type ModuleSummary = {
  id: string
  name: string
}

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  operations: GraphOperation[]
  createdAt: string
  /**
   * Canvas tools this turn ran, in order. Populated client-side for the current
   * session only — it is never persisted, so messages loaded from history omit it.
   */
  toolCalls?: string[]
  turnId?: string | null
  messageKey?: string | null
  planningStage?: PlanningArtifactKind | null
  artifactId?: string | null
  artifactVersionId?: string | null
  changeSetId?: string | null
  metadata?: Record<string, unknown> | null
}

export type ChatPlanningLink = {
  stage: PlanningArtifactKind
  artifactId: string
  artifactVersionId: string
  expectedRevision: number
}

/**
 * Durable logical identity for one user turn. Retry keeps every field except
 * assistantMessageKey: each streamed assistant attempt is its own immutable row.
 */
export type ChatTurnIdentity = {
  turnId: string
  userMessageKey: string
  assistantMessageKey: string
  changeSetId: string
  expectedRevision: number
  operationIds: string[]
  planningStage: PlanningArtifactKind | null
  artifactId: string | null
  artifactVersionId: string | null
}

export const CHAT_TURN_OPERATION_LIMIT = 64
export const CHAT_TOOL_RECEIPT_KEY = '__chatTurnReceipt'

export type ChatToolReceiptStatus = 'committed' | 'failed' | 'legacy_direct'

export type ChatToolReceipt = {
  turnId: string
  changeSetId: string
  operationId: string
  sequence: number
  status: ChatToolReceiptStatus
  expectedRevision: number
  committedRevision?: number
  artifactVersionId?: string | null
}

export type ArchitectureChangeSummary = {
  created: number
  updated: number
  deleted: number
  assumed: number
  resolved: number
  capabilitiesCreated: number
  connectionsCreated: number
  assumptionsRecorded: number
  questionsRecorded: number
  provisional: true
}

export type ChatContext = {
  projectId: string
  projectName: string
  activeModuleId: string | null
  mode: ChatMode
  modules: ModuleSummary[]
  provider?: AIProvider
  resolvingOpenQuestion?: {
    id: string
    section: string
    question: string
  }
}

export type CreateChatMessageInput = {
  project_id: string
  role: ChatRole
  content: string
  turn_id?: string | null
  message_key?: string | null
  planning_stage?: PlanningArtifactKind | null
  artifact_id?: string | null
  artifact_version_id?: string | null
  change_set_id?: string | null
  metadata?: Record<string, unknown> | null
}
