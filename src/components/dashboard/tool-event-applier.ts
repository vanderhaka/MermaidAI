import { useGraphStore } from '@/store/graph-store'
import { readChatToolReceipt } from '@/lib/chat-turn'
import type { ChatToolReceipt } from '@/types/chat'
import type { FlowEdge, FlowNode, Module, ModuleConnection, OpenQuestion } from '@/types/graph'

type ToolEventOptions = {
  recordToolCall: (label: string) => void
}

type ScopeToolEventOptions = ToolEventOptions & {
  activeResolutionQuestionId?: string | null
  clearActiveResolutionQuestion?: () => void
  markPendingRefresh?: () => void
}

/**
 * Tools whose events change persisted graph state. When a turn ends early the
 * workspace refreshes so the canvas matches what actually landed on the server.
 */
export const GRAPH_MUTATION_TOOLS = new Set([
  'capture_scope_flow',
  'create_node',
  'update_node',
  'delete_node',
  'create_edge',
  'update_edge',
  'delete_edge',
  'insert_node_between',
  'add_open_questions',
  'resolve_open_question',
  'capture_architecture_map',
  'refine_architecture_map',
  'refine_architecture_flow',
  'create_module',
  'update_module',
  'delete_module',
  'connect_modules',
])

/** Keep receipt parsing independent from applying compatibility graph payloads. */
export function readToolEventReceipt(data: Record<string, unknown>): ChatToolReceipt | null {
  return readChatToolReceipt(data)
}

function applyOpenQuestionPayload(data: Record<string, unknown>): number {
  const nodes = data.nodes as FlowNode[] | undefined
  const questions = data.questions as OpenQuestion[] | undefined
  const edges = data.edges as FlowEdge[] | undefined
  const store = useGraphStore.getState()

  if (nodes) {
    for (const node of nodes) store.addNode(node)
    store.markTurnChanged(nodes.map((node) => node.id))
  }
  if (questions) {
    for (const question of questions) store.addOpenQuestion(question)
  }
  if (edges) {
    for (const edge of edges) store.addEdge(edge)
  }

  return questions?.length ?? 0
}

function formatQuestionCount(count: number): string {
  return count === 1 ? 'Flagged 1 question' : `Flagged ${count} questions`
}

/** Fallback label so a tool the client does not know about is still visible. */
function formatUnknownTool(tool: string): string {
  const label = tool.replace(/_/g, ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Node and edge mutations behave identically in every mode, so both appliers
 * share them. Returns true when the tool belongs to this set — even if its
 * payload was empty — so callers know not to fall through to their own cases.
 */
function applyGraphElementEvent(
  tool: string,
  data: Record<string, unknown>,
  options: ToolEventOptions,
): boolean {
  const store = useGraphStore.getState()

  switch (tool) {
    case 'create_node': {
      const node = data.node as FlowNode | undefined
      if (node) {
        store.addNode(node)
        store.markTurnChanged([node.id])
        options.recordToolCall('Created node')
      }
      break
    }
    case 'update_node': {
      const node = data.node as FlowNode | undefined
      if (node) {
        store.updateNode(node.id, node)
        store.markTurnChanged([node.id])
        options.recordToolCall('Updated node')
      }
      break
    }
    case 'delete_node': {
      const deletedNodeId = data.deletedNodeId as string | undefined
      if (deletedNodeId) {
        store.removeNode(deletedNodeId)
        options.recordToolCall('Deleted node')
      }
      break
    }
    case 'create_edge': {
      const edge = data.edge as FlowEdge | undefined
      if (edge) {
        store.addEdge(edge)
        options.recordToolCall('Created edge')
      }
      break
    }
    case 'update_edge': {
      const edge = data.edge as FlowEdge | undefined
      if (edge) {
        store.updateEdge(edge)
        options.recordToolCall('Updated edge')
      }
      break
    }
    case 'delete_edge': {
      const deletedEdgeId = data.deletedEdgeId as string | undefined
      if (deletedEdgeId) {
        store.removeEdge(deletedEdgeId)
        options.recordToolCall('Deleted edge')
      }
      break
    }
    case 'insert_node_between': {
      const removedEdgeIds = data.removedEdgeIds as string[] | undefined
      const node = data.node as FlowNode | undefined
      const edges = data.edges as FlowEdge[] | undefined
      for (const edgeId of removedEdgeIds ?? []) store.removeEdge(edgeId)
      if (node) {
        store.addNode(node)
        store.markTurnChanged([node.id])
      }
      for (const edge of edges ?? []) store.addEdge(edge)
      if (node) options.recordToolCall(`Inserted ${node.label}`)
      break
    }
    default:
      return false
  }

  return true
}

export function applyScopeToolEvent(
  tool: string,
  data: Record<string, unknown>,
  options: ScopeToolEventOptions,
): void {
  if (applyGraphElementEvent(tool, data, options)) return

  const store = useGraphStore.getState()

  switch (tool) {
    case 'capture_scope_flow': {
      const nodes = data.nodes as FlowNode[] | undefined
      const stepCount = (nodes ?? []).filter((node) => node.node_type !== 'question').length
      const questionCount = applyOpenQuestionPayload(data)
      const stepLabel = stepCount === 1 ? 'step' : 'steps'
      const questionLabel = questionCount === 1 ? 'question' : 'questions'
      options.recordToolCall(
        `Captured ${stepCount} ${stepLabel} and ${questionCount} ${questionLabel}`,
      )
      break
    }
    case 'add_open_questions': {
      options.recordToolCall(formatQuestionCount(applyOpenQuestionPayload(data)))
      break
    }
    case 'resolve_open_question': {
      const question = data.question as OpenQuestion | undefined
      if (question) {
        store.removeNode(question.node_id)
        store.resolveOpenQuestion(question.id, question.resolution ?? '')
        if (options.activeResolutionQuestionId === question.id) {
          options.clearActiveResolutionQuestion?.()
        }
      }
      options.recordToolCall('Resolved question')
      break
    }
    case 'write_prd': {
      const mod = data.module as Module | undefined
      if (mod) {
        store.updateModule(mod.id, { prd_content: mod.prd_content })
        options.recordToolCall('Updated PRD')
      }
      break
    }
    case 'promote_project': {
      options.markPendingRefresh?.()
      options.recordToolCall(
        data.mode === 'scope' ? 'Switched to Quick Capture' : 'Switched to Full Design',
      )
      break
    }
    case 'create_module': {
      const mod = data.module as Module | undefined
      if (mod) {
        store.addModule(mod)
        options.recordToolCall(`Created ${mod.name}`)
      }
      break
    }
    case 'update_module': {
      const mod = data.module as Module | undefined
      if (mod) {
        store.updateModule(mod.id, mod)
        options.recordToolCall(`Updated ${mod.name}`)
      }
      break
    }
    case 'connect_modules': {
      const conn = data.connection as ModuleConnection | undefined
      if (conn) store.addConnection(conn)
      options.recordToolCall('Connected modules')
      break
    }
    case 'lookup_docs': {
      const lookup = data.lookup as { library: string; topic: string } | undefined
      if (lookup) {
        options.recordToolCall(`Looked up ${lookup.library} docs`)
      }
      break
    }
    default:
      options.recordToolCall(formatUnknownTool(tool))
  }
}

export function applyProjectToolEvent(
  tool: string,
  data: Record<string, unknown>,
  options: ToolEventOptions,
): void {
  if (applyGraphElementEvent(tool, data, options)) return

  const store = useGraphStore.getState()

  switch (tool) {
    case 'capture_architecture_map': {
      const receipt = readToolEventReceipt(data)
      if (receipt?.status !== 'committed') break

      const modules = data.modules as Module[] | undefined
      const connections = data.connections as ModuleConnection[] | undefined
      const nodes = data.nodes as FlowNode[] | undefined
      const questions = data.questions as OpenQuestion[] | undefined
      const hasCommittedRows =
        (modules?.length ?? 0) > 0 ||
        (connections?.length ?? 0) > 0 ||
        (nodes?.length ?? 0) > 0 ||
        (questions?.length ?? 0) > 0
      if (!hasCommittedRows) break

      for (const capabilityModule of modules ?? []) store.addModule(capabilityModule)
      for (const connection of connections ?? []) store.addConnection(connection)
      for (const node of nodes ?? []) store.addNode(node)
      for (const question of questions ?? []) store.addOpenQuestion(question)
      if (nodes?.length) store.markTurnChanged(nodes.map((node) => node.id))

      const moduleCount = modules?.length ?? 0
      const connectionCount = connections?.length ?? 0
      options.recordToolCall(
        `Built Architecture: ${moduleCount} ${moduleCount === 1 ? 'capability' : 'capabilities'}, ${connectionCount} ${connectionCount === 1 ? 'connection' : 'connections'}`,
      )
      break
    }
    case 'refine_architecture_map': {
      const receipt = readToolEventReceipt(data)
      if (receipt?.status !== 'committed') break
      const createdModules = (data.createdModules as Module[] | undefined) ?? []
      const updatedModules = (data.updatedModules as Module[] | undefined) ?? []
      const deletedModuleIds = (data.deletedModuleIds as string[] | undefined) ?? []
      const createdConnections = (data.createdConnections as ModuleConnection[] | undefined) ?? []
      const deletedConnectionIds = (data.deletedConnectionIds as string[] | undefined) ?? []

      for (const moduleId of deletedModuleIds) store.removeModule(moduleId)
      for (const architectureModule of createdModules) store.addModule(architectureModule)
      for (const architectureModule of updatedModules) {
        store.updateModule(architectureModule.id, architectureModule)
      }
      store.setConnections([
        ...store.connections.filter(
          (connection) =>
            !deletedConnectionIds.includes(connection.id) &&
            !deletedModuleIds.includes(connection.source_module_id) &&
            !deletedModuleIds.includes(connection.target_module_id),
        ),
        ...createdConnections,
      ])
      options.recordToolCall('Updated Architecture atomically')
      break
    }
    case 'refine_architecture_flow': {
      const receipt = readToolEventReceipt(data)
      if (receipt?.status !== 'committed') break
      const createdNodes = (data.createdNodes as FlowNode[] | undefined) ?? []
      const updatedNodes = (data.updatedNodes as FlowNode[] | undefined) ?? []
      const deletedNodeIds = (data.deletedNodeIds as string[] | undefined) ?? []
      const createdEdges = (data.createdEdges as FlowEdge[] | undefined) ?? []
      const updatedEdges = (data.updatedEdges as FlowEdge[] | undefined) ?? []
      const deletedEdgeIds = (data.deletedEdgeIds as string[] | undefined) ?? []

      for (const edgeId of deletedEdgeIds) store.removeEdge(edgeId)
      for (const nodeId of deletedNodeIds) store.removeNode(nodeId)
      for (const node of createdNodes) store.addNode(node)
      for (const node of updatedNodes) store.updateNode(node.id, node)
      for (const edge of createdEdges) store.addEdge(edge)
      for (const edge of updatedEdges) store.updateEdge(edge)
      if (createdNodes.length || updatedNodes.length) {
        store.markTurnChanged([
          ...createdNodes.map((node) => node.id),
          ...updatedNodes.map((node) => node.id),
        ])
      }
      options.recordToolCall('Updated Architecture flow atomically')
      break
    }
    case 'create_module': {
      const mod = data.module as Module | undefined
      if (mod) {
        options.recordToolCall(`Created ${mod.name} module`)
        store.addModule(mod)
      }
      break
    }
    case 'update_module': {
      const mod = data.module as Module | undefined
      if (mod) {
        options.recordToolCall(`Updated ${mod.name}`)
        store.updateModule(mod.id, mod)
      }
      break
    }
    case 'delete_module': {
      const deletedModuleId = data.deletedModuleId as string | undefined
      if (deletedModuleId) store.removeModule(deletedModuleId)
      options.recordToolCall('Removed module')
      break
    }
    case 'connect_modules': {
      const conn = data.connection as ModuleConnection | undefined
      if (conn) store.addConnection(conn)
      const sourceModule = data.sourceModule as Module | undefined
      if (sourceModule) store.updateModule(sourceModule.id, sourceModule)
      const targetModule = data.targetModule as Module | undefined
      if (targetModule) store.updateModule(targetModule.id, targetModule)
      options.recordToolCall(
        sourceModule && targetModule
          ? `Connected ${sourceModule.name} → ${targetModule.name}`
          : 'Connected modules',
      )
      break
    }
    case 'lookup_docs': {
      const lookup = data.lookup as { library: string; topic: string } | undefined
      if (lookup) {
        options.recordToolCall(`Looked up ${lookup.library} docs`)
      }
      break
    }
    case 'add_open_questions': {
      options.recordToolCall(formatQuestionCount(applyOpenQuestionPayload(data)))
      break
    }
    case 'resolve_open_question': {
      const question = data.question as OpenQuestion | undefined
      if (question) {
        store.removeNode(question.node_id)
        store.resolveOpenQuestion(question.id, question.resolution ?? '')
      }
      options.recordToolCall('Resolved question')
      break
    }
    case 'write_prd': {
      const mod = data.module as Module | undefined
      if (mod) {
        store.updateModule(mod.id, { prd_content: mod.prd_content })
        options.recordToolCall('Updated PRD')
      }
      break
    }
    default:
      options.recordToolCall(formatUnknownTool(tool))
  }
}
