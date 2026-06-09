import { useGraphStore } from '@/store/graph-store'
import type { FlowEdge, FlowNode, Module, ModuleConnection, OpenQuestion } from '@/types/graph'

type ToolEventOptions = {
  recordToolCall: (label: string) => void
}

type ScopeToolEventOptions = ToolEventOptions & {
  activeResolutionQuestionId?: string | null
  clearActiveResolutionQuestion?: () => void
  markPendingRefresh?: () => void
}

function applyOpenQuestionPayload(data: Record<string, unknown>): number {
  const nodes = data.nodes as FlowNode[] | undefined
  const questions = data.questions as OpenQuestion[] | undefined
  const edges = data.edges as FlowEdge[] | undefined
  const store = useGraphStore.getState()

  if (nodes) {
    for (const node of nodes) store.addNode(node)
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

export function applyScopeToolEvent(
  tool: string,
  data: Record<string, unknown>,
  options: ScopeToolEventOptions,
): void {
  const store = useGraphStore.getState()

  switch (tool) {
    case 'create_node': {
      const node = data.node as FlowNode | undefined
      if (node) {
        store.addNode(node)
        options.recordToolCall('Created node')
      }
      break
    }
    case 'update_node': {
      const node = data.node as FlowNode | undefined
      if (node) {
        store.updateNode(node.id, node)
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
    case 'delete_edge': {
      const deletedEdgeId = data.deletedEdgeId as string | undefined
      if (deletedEdgeId) {
        store.removeEdge(deletedEdgeId)
        options.recordToolCall('Deleted edge')
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
      options.recordToolCall('Switched to Full Design')
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
  }
}

export function applyProjectToolEvent(
  tool: string,
  data: Record<string, unknown>,
  options: ToolEventOptions,
): void {
  const store = useGraphStore.getState()

  switch (tool) {
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
  }
}
