import type Anthropic from '@anthropic-ai/sdk'

import { createModule, updateModule, deleteModule } from '@/lib/services/module-service'
import { connectModules } from '@/lib/services/module-connection-service'
import { addNode, updateNode, removeNode, addEdge, removeEdge } from '@/lib/services/graph-service'
import type { ToolResult } from '@/lib/services/llm-client'
import type { FlowNode } from '@/types/graph'
import type { PromptMode } from '@/lib/services/prompt-builder'

const DEFAULT_MODULE_COLOR = '#111827'
const DEFAULT_NODE_COLOR = '#2563eb'

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const createModuleTool: Anthropic.Tool = {
  name: 'create_module',
  description:
    'Create a new module in the project. Use when the user describes a feature or component that should become its own module.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Name of the module (e.g. "Auth", "Payments")' },
      description: { type: 'string', description: 'Brief description of what the module does' },
    },
    required: ['name'],
  },
}

const updateModuleTool: Anthropic.Tool = {
  name: 'update_module',
  description: 'Update an existing module name or description.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: { type: 'string', description: 'ID of the module to update' },
      name: { type: 'string', description: 'New name for the module' },
      description: { type: 'string', description: 'New description for the module' },
    },
    required: ['moduleId'],
  },
}

const deleteModuleTool: Anthropic.Tool = {
  name: 'delete_module',
  description: 'Delete a module from the project.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: { type: 'string', description: 'ID of the module to delete' },
    },
    required: ['moduleId'],
  },
}

const connectModulesTool: Anthropic.Tool = {
  name: 'connect_modules',
  description:
    'Create a connection between two modules, linking an exit point of one to an entry point of another.',
  input_schema: {
    type: 'object' as const,
    properties: {
      sourceModuleId: { type: 'string', description: 'ID of the source module' },
      targetModuleId: { type: 'string', description: 'ID of the target module' },
      sourceExitPoint: { type: 'string', description: 'Exit point name on the source module' },
      targetEntryPoint: { type: 'string', description: 'Entry point name on the target module' },
    },
    required: ['sourceModuleId', 'targetModuleId', 'sourceExitPoint', 'targetEntryPoint'],
  },
}

const createNodeTool: Anthropic.Tool = {
  name: 'create_node',
  description:
    'Create a new node inside a module. Node types: process, decision, entry, exit, start, end.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: { type: 'string', description: 'ID of the module to add the node to' },
      label: { type: 'string', description: 'Label for the node (e.g. "Validate Input")' },
      nodeType: {
        type: 'string',
        enum: ['process', 'decision', 'entry', 'exit', 'start', 'end'],
        description: 'Type of node',
      },
      pseudocode: {
        type: 'string',
        description:
          'Optional pseudocode for process nodes. Include a // file: <path> comment at the top.',
      },
    },
    required: ['moduleId', 'label', 'nodeType'],
  },
}

const updateNodeTool: Anthropic.Tool = {
  name: 'update_node',
  description: 'Update an existing node label, type, or pseudocode.',
  input_schema: {
    type: 'object' as const,
    properties: {
      nodeId: { type: 'string', description: 'ID of the node to update' },
      label: { type: 'string', description: 'New label for the node' },
      nodeType: {
        type: 'string',
        enum: ['process', 'decision', 'entry', 'exit', 'start', 'end'],
        description: 'New node type',
      },
      pseudocode: { type: 'string', description: 'Updated pseudocode' },
    },
    required: ['nodeId'],
  },
}

const deleteNodeTool: Anthropic.Tool = {
  name: 'delete_node',
  description: 'Delete a node from a module.',
  input_schema: {
    type: 'object' as const,
    properties: {
      nodeId: { type: 'string', description: 'ID of the node to delete' },
    },
    required: ['nodeId'],
  },
}

const createEdgeTool: Anthropic.Tool = {
  name: 'create_edge',
  description: 'Create an edge connecting two nodes within a module.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: { type: 'string', description: 'ID of the module containing the nodes' },
      sourceNodeId: { type: 'string', description: 'ID of the source node' },
      targetNodeId: { type: 'string', description: 'ID of the target node' },
      label: { type: 'string', description: 'Optional label for the edge' },
      condition: { type: 'string', description: 'Optional condition for decision edges' },
    },
    required: ['moduleId', 'sourceNodeId', 'targetNodeId'],
  },
}

const deleteEdgeTool: Anthropic.Tool = {
  name: 'delete_edge',
  description: 'Delete an edge from a module.',
  input_schema: {
    type: 'object' as const,
    properties: {
      edgeId: { type: 'string', description: 'ID of the edge to delete' },
    },
    required: ['edgeId'],
  },
}

// ---------------------------------------------------------------------------
// Tool sets per mode
// ---------------------------------------------------------------------------

const MODULE_TOOLS = [createModuleTool, updateModuleTool, deleteModuleTool, connectModulesTool]
const NODE_EDGE_TOOLS = [
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  deleteEdgeTool,
]
const ALL_TOOLS = [...MODULE_TOOLS, ...NODE_EDGE_TOOLS]

export function getToolsForMode(mode: PromptMode): Anthropic.Tool[] {
  switch (mode) {
    case 'discovery':
      return ALL_TOOLS
    case 'module_map':
      return MODULE_TOOLS
    case 'module_detail':
      return NODE_EDGE_TOOLS
  }
}

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

type ToolInput = Record<string, unknown>

function ok(content: string): ToolResult {
  return { content, isError: false }
}

function fail(message: string): ToolResult {
  return { content: message, isError: true }
}

export function createToolExecutor(projectId: string) {
  return async function executeTool(name: string, input: ToolInput): Promise<ToolResult> {
    try {
      switch (name) {
        case 'create_module': {
          const result = await createModule({
            project_id: projectId,
            name: input.name as string,
            description: input.description as string | undefined,
            position: { x: 0, y: 0 },
            color: DEFAULT_MODULE_COLOR,
            entry_points: [],
            exit_points: [],
          })
          if (!result.success) return fail(result.error)
          return ok(`Created module "${result.data.name}" (id: ${result.data.id})`)
        }

        case 'update_module': {
          const { moduleId, ...fields } = input as {
            moduleId: string
            name?: string
            description?: string
          }
          const result = await updateModule(moduleId, fields)
          if (!result.success) return fail(result.error)
          return ok(`Updated module "${result.data.name}" (id: ${result.data.id})`)
        }

        case 'delete_module': {
          const result = await deleteModule(input.moduleId as string)
          if (!result.success) return fail(result.error)
          return ok(`Deleted module ${input.moduleId}`)
        }

        case 'connect_modules': {
          const result = await connectModules({
            project_id: projectId,
            source_module_id: input.sourceModuleId as string,
            target_module_id: input.targetModuleId as string,
            source_exit_point: input.sourceExitPoint as string,
            target_entry_point: input.targetEntryPoint as string,
          })
          if (!result.success) return fail(result.error)
          return ok(`Connected modules ${input.sourceModuleId} → ${input.targetModuleId}`)
        }

        case 'create_node': {
          const result = await addNode({
            module_id: input.moduleId as string,
            label: input.label as string,
            node_type: input.nodeType as string,
            pseudocode: (input.pseudocode as string) ?? '',
            position: { x: 0, y: 0 },
            color: DEFAULT_NODE_COLOR,
          })
          if (!result.success) return fail(result.error)
          return ok(
            `Created node "${result.data.label}" (id: ${result.data.id}, type: ${result.data.node_type})`,
          )
        }

        case 'update_node': {
          const { nodeId, nodeType, ...fields } = input as {
            nodeId: string
            nodeType?: string
            label?: string
            pseudocode?: string
          }
          const result = await updateNode(nodeId, {
            ...fields,
            ...(nodeType ? { node_type: nodeType as FlowNode['node_type'] } : {}),
          })
          if (!result.success) return fail(result.error)
          return ok(`Updated node "${result.data.label}" (id: ${result.data.id})`)
        }

        case 'delete_node': {
          const result = await removeNode(input.nodeId as string)
          if (!result.success) return fail(result.error)
          return ok(`Deleted node ${input.nodeId}`)
        }

        case 'create_edge': {
          const result = await addEdge({
            module_id: input.moduleId as string,
            source_node_id: input.sourceNodeId as string,
            target_node_id: input.targetNodeId as string,
            label: input.label as string | undefined,
            condition: input.condition as string | undefined,
          })
          if (!result.success) return fail(result.error)
          return ok(
            `Created edge ${input.sourceNodeId} → ${input.targetNodeId} (id: ${result.data.id})`,
          )
        }

        case 'delete_edge': {
          const result = await removeEdge(input.edgeId as string)
          if (!result.success) return fail(result.error)
          return ok(`Deleted edge ${input.edgeId}`)
        }

        default:
          return fail(`Unknown tool "${name}"`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return fail(`Tool "${name}" threw an unexpected error: ${message}`)
    }
  }
}
