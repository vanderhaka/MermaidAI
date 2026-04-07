import type { GraphOperation } from '@/types/chat'
import { createModule, updateModule, deleteModule } from '@/lib/services/module-service'
import { connectModules } from '@/lib/services/module-connection-service'
import { addNode, updateNode, removeNode, addEdge, removeEdge } from '@/lib/services/graph-service'
import type { FlowNode } from '@/types/graph'

export type OperationResult = {
  operation: string
  success: boolean
  error?: string
}

export type ExecutionResult = {
  success: boolean
  results: OperationResult[]
  error?: string
}

export type ExecutionContext = {
  projectId: string
}

const DEFAULT_MODULE_COLOR = '#111827'
const DEFAULT_NODE_COLOR = '#2563eb'

async function executeOne(op: GraphOperation, context: ExecutionContext): Promise<OperationResult> {
  switch (op.type) {
    case 'create_module': {
      const result = await createModule({
        project_id: context.projectId,
        name: op.payload.name,
        description: op.payload.description,
        position: { x: 0, y: 0 },
        color: DEFAULT_MODULE_COLOR,
        entry_points: [],
        exit_points: [],
      })
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'update_module': {
      const { moduleId, ...fields } = op.payload
      const result = await updateModule(moduleId, fields)
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'delete_module': {
      const result = await deleteModule(op.payload.moduleId)
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'create_node': {
      const result = await addNode({
        module_id: op.payload.moduleId,
        label: op.payload.label,
        node_type: op.payload.nodeType,
        pseudocode: op.payload.pseudocode ?? '',
        position: { x: 0, y: 0 },
        color: DEFAULT_NODE_COLOR,
      })
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'update_node': {
      const { nodeId, nodeType, ...fields } = op.payload
      const result = await updateNode(nodeId, {
        ...fields,
        ...(nodeType ? { node_type: nodeType as FlowNode['node_type'] } : {}),
      })
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'delete_node': {
      const result = await removeNode(op.payload.nodeId)
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'create_edge': {
      const result = await addEdge({
        module_id: op.payload.moduleId,
        source_node_id: op.payload.sourceNodeId,
        target_node_id: op.payload.targetNodeId,
        label: op.payload.label,
        condition: op.payload.condition,
      })
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'delete_edge': {
      const result = await removeEdge(op.payload.edgeId)
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    case 'connect_modules': {
      const result = await connectModules({
        project_id: context.projectId,
        source_module_id: op.payload.sourceModuleId,
        target_module_id: op.payload.targetModuleId,
        source_exit_point: op.payload.sourceExitPoint,
        target_entry_point: op.payload.targetEntryPoint,
      })
      return result.success
        ? { operation: op.type, success: true }
        : { operation: op.type, success: false, error: result.error }
    }

    default: {
      const unknownOp = op as { type: string }
      return {
        operation: unknownOp.type,
        success: false,
        error: `Unsupported operation type: ${unknownOp.type}`,
      }
    }
  }
}

export async function executeOperations(
  operations: GraphOperation[],
  context: ExecutionContext,
): Promise<ExecutionResult> {
  const results: OperationResult[] = []

  for (const op of operations) {
    const result = await executeOne(op, context)
    results.push(result)
  }

  const failed = results.filter((r) => !r.success)
  const allSucceeded = failed.length === 0

  return {
    success: allSucceeded,
    results,
    ...(allSucceeded ? {} : { error: `${failed.length} of ${results.length} operations failed` }),
  }
}
