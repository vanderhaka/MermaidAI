import type Anthropic from '@anthropic-ai/sdk'

import {
  createModule,
  updateModule,
  deleteModule,
  getModuleById,
} from '@/lib/services/module-service'
import { connectModules } from '@/lib/services/module-connection-service'
import { lookupDocumentation } from '@/lib/services/doc-lookup-service'
import { addNode, updateNode, removeNode, addEdge, removeEdge } from '@/lib/services/graph-service'
import { createOpenQuestion, resolveOpenQuestion } from '@/lib/services/open-question-service'
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
    'Create a new module in the project. Use when the user describes a feature or component that should become its own module. Always specify entry_points and exit_points so modules can be connected.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Name of the module (e.g. "Auth", "Payments")' },
      domain: {
        type: 'string',
        description:
          'High-level domain / capability area for grouping (e.g. "Payments", "Orders", "Notifications"). Omit if unclear.',
      },
      description: { type: 'string', description: 'Brief description of what the module does' },
      entry_points: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Named entry points into this module (e.g. ["form_data", "api_request"]). These are the inputs the module receives from other modules.',
      },
      exit_points: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Named exit points from this module (e.g. ["success", "error", "leads"]). These are the outputs the module sends to other modules.',
      },
    },
    required: ['name'],
  },
}

const updateModuleTool: Anthropic.Tool = {
  name: 'update_module',
  description:
    'Update an existing module. Can change name, description, entry_points, and exit_points.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: { type: 'string', description: 'ID of the module to update' },
      domain: {
        type: 'string',
        description:
          'Domain / capability area label for sidebar grouping, or empty string to clear',
      },
      name: { type: 'string', description: 'New name for the module' },
      description: { type: 'string', description: 'New description for the module' },
      entry_points: {
        type: 'array',
        items: { type: 'string' },
        description: 'Replace entry points with this list',
      },
      exit_points: {
        type: 'array',
        items: { type: 'string' },
        description: 'Replace exit points with this list',
      },
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

const lookupDocsTool: Anthropic.Tool = {
  name: 'lookup_docs',
  description:
    'Look up current documentation for a 3rd party library or service (e.g. Stripe, Supabase, Twilio). Use this when designing module flows that involve external integrations to ensure accurate API patterns.',
  input_schema: {
    type: 'object' as const,
    properties: {
      library: {
        type: 'string',
        description: 'Name of the library or service (e.g. "Stripe", "Supabase", "Twilio")',
      },
      topic: {
        type: 'string',
        description:
          'Specific topic to look up (e.g. "checkout sessions", "webhook handling", "authentication")',
      },
    },
    required: ['library', 'topic'],
  },
}

const addOpenQuestionTool: Anthropic.Tool = {
  name: 'add_open_question',
  description:
    'Silently place an open question marker on the canvas. Use when the client description has a gap, ambiguity, or missing detail that needs clarification. The question node will appear as an amber "?" marker.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: {
        type: 'string',
        description: 'ID of the module (scope module) to place the question in',
      },
      section: {
        type: 'string',
        description:
          'Logical section grouping for the question (e.g. "Authentication", "Payments", "Data Model")',
      },
      question: {
        type: 'string',
        description: 'The open question text describing the gap or ambiguity',
      },
      relatedNodeId: {
        type: 'string',
        description: 'Optional ID of a related flow node this question is connected to',
      },
    },
    required: ['moduleId', 'section', 'question'],
  },
}

const resolveOpenQuestionTool: Anthropic.Tool = {
  name: 'resolve_open_question',
  description:
    'Mark an open question as resolved when the client provides information that answers it. Updates the question status and records the resolution.',
  input_schema: {
    type: 'object' as const,
    properties: {
      questionId: {
        type: 'string',
        description: 'ID of the open question to resolve',
      },
      resolution: {
        type: 'string',
        description: 'The answer or resolution that addresses the open question',
      },
    },
    required: ['questionId', 'resolution'],
  },
}

export { addOpenQuestionTool, resolveOpenQuestionTool }

// ---------------------------------------------------------------------------
// Tool sets per mode
// ---------------------------------------------------------------------------

const MODULE_TOOLS = [
  createModuleTool,
  updateModuleTool,
  deleteModuleTool,
  connectModulesTool,
  lookupDocsTool,
]
const NODE_EDGE_TOOLS = [
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  deleteEdgeTool,
  lookupDocsTool,
]
const ALL_TOOLS = [
  createModuleTool,
  updateModuleTool,
  deleteModuleTool,
  connectModulesTool,
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  deleteEdgeTool,
  lookupDocsTool,
]
const SCOPE_TOOLS = [
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  deleteEdgeTool,
  addOpenQuestionTool,
  resolveOpenQuestionTool,
]

export function getToolsForMode(mode: PromptMode): Anthropic.Tool[] {
  switch (mode) {
    case 'discovery':
      return ALL_TOOLS
    case 'module_map':
      return MODULE_TOOLS
    case 'module_detail':
      return NODE_EDGE_TOOLS
    case 'scope_build':
      return SCOPE_TOOLS
  }
}

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

type ToolInput = Record<string, unknown>

function ok(content: string, data?: Record<string, unknown>): ToolResult {
  return { content, isError: false, data }
}

function fail(message: string): ToolResult {
  return { content: message, isError: true }
}

export function createToolExecutor(projectId: string) {
  return async function executeTool(name: string, input: ToolInput): Promise<ToolResult> {
    try {
      switch (name) {
        case 'create_module': {
          const entryPoints = Array.isArray(input.entry_points)
            ? (input.entry_points as string[])
            : []
          const exitPoints = Array.isArray(input.exit_points) ? (input.exit_points as string[]) : []
          const domainRaw = input.domain
          const domain =
            typeof domainRaw === 'string' && domainRaw.trim().length > 0
              ? domainRaw.trim().slice(0, 80)
              : undefined

          const result = await createModule({
            project_id: projectId,
            name: input.name as string,
            ...(domain !== undefined ? { domain } : {}),
            description: input.description as string | undefined,
            position: { x: 0, y: 0 },
            color: DEFAULT_MODULE_COLOR,
            entry_points: entryPoints,
            exit_points: exitPoints,
          })
          if (!result.success) return fail(result.error)
          return ok(`Created module "${result.data.name}" (id: ${result.data.id})`, {
            module: result.data,
          })
        }

        case 'update_module': {
          const raw = input as {
            moduleId: string
            domain?: string
            name?: string
            description?: string
            entry_points?: string[]
            exit_points?: string[]
          }
          const { moduleId, domain: domainIn, ...rest } = raw
          const payload: Record<string, unknown> = { ...rest }
          if (domainIn !== undefined) {
            const d = domainIn.trim()
            payload.domain = d.length === 0 ? null : d.slice(0, 80)
          }
          const result = await updateModule(moduleId, payload)
          if (!result.success) return fail(result.error)
          return ok(`Updated module "${result.data.name}" (id: ${result.data.id})`, {
            module: result.data,
          })
        }

        case 'delete_module': {
          const result = await deleteModule(input.moduleId as string)
          if (!result.success) return fail(result.error)
          return ok(`Deleted module ${input.moduleId}`)
        }

        case 'connect_modules': {
          const sourceExitPoint = input.sourceExitPoint as string
          const targetEntryPoint = input.targetEntryPoint as string
          const sourceModuleId = input.sourceModuleId as string
          const targetModuleId = input.targetModuleId as string

          // Auto-add missing exit/entry points on the modules so handles exist
          const [srcRes, tgtRes] = await Promise.all([
            getModuleById(sourceModuleId),
            getModuleById(targetModuleId),
          ])
          if (srcRes.success && !srcRes.data.exit_points.includes(sourceExitPoint)) {
            await updateModule(sourceModuleId, {
              exit_points: [...srcRes.data.exit_points, sourceExitPoint],
            })
          }
          if (tgtRes.success && !tgtRes.data.entry_points.includes(targetEntryPoint)) {
            await updateModule(targetModuleId, {
              entry_points: [...tgtRes.data.entry_points, targetEntryPoint],
            })
          }

          const result = await connectModules({
            project_id: projectId,
            source_module_id: sourceModuleId,
            target_module_id: targetModuleId,
            source_exit_point: sourceExitPoint,
            target_entry_point: targetEntryPoint,
          })
          if (!result.success) return fail(result.error)

          // Re-fetch both modules so the client gets updated entry/exit points
          const [updatedSrc, updatedTgt] = await Promise.all([
            getModuleById(sourceModuleId),
            getModuleById(targetModuleId),
          ])

          return ok(`Connected modules ${sourceModuleId} → ${targetModuleId}`, {
            connection: result.data,
            ...(updatedSrc.success ? { sourceModule: updatedSrc.data } : {}),
            ...(updatedTgt.success ? { targetModule: updatedTgt.data } : {}),
          })
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
            { node: result.data },
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
          return ok(`Updated node "${result.data.label}" (id: ${result.data.id})`, {
            node: result.data,
          })
        }

        case 'delete_node': {
          const result = await removeNode(input.nodeId as string)
          if (!result.success) return fail(result.error)
          return ok(`Deleted node ${input.nodeId}`, { deletedNodeId: input.nodeId })
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
            { edge: result.data },
          )
        }

        case 'delete_edge': {
          const result = await removeEdge(input.edgeId as string)
          if (!result.success) return fail(result.error)
          return ok(`Deleted edge ${input.edgeId}`, { deletedEdgeId: input.edgeId })
        }

        case 'lookup_docs': {
          const library = input.library as string
          const topic = input.topic as string
          const result = await lookupDocumentation(library, topic)
          return ok(result.summary, {
            lookup: { library, topic },
          })
        }

        case 'add_open_question': {
          const moduleId = input.moduleId as string
          const section = input.section as string
          const question = input.question as string
          const relatedNodeId = input.relatedNodeId as string | undefined

          const label = question.length > 60 ? `${question.slice(0, 57)}...` : question
          const nodeResult = await addNode({
            module_id: moduleId,
            label,
            node_type: 'question',
            pseudocode: question,
            position: { x: 0, y: 0 },
            color: '#F59E0B',
          })
          if (!nodeResult.success) return fail(nodeResult.error)

          const questionResult = await createOpenQuestion({
            project_id: projectId,
            node_id: nodeResult.data.id,
            section,
            question,
          })
          if (!questionResult.success) return fail(questionResult.error)

          if (relatedNodeId) {
            await addEdge({
              module_id: moduleId,
              source_node_id: relatedNodeId,
              target_node_id: nodeResult.data.id,
            })
          }

          return ok(`Added open question: "${label}" in section "${section}"`, {
            node: nodeResult.data,
            question: questionResult.data,
          })
        }

        case 'resolve_open_question': {
          const questionId = input.questionId as string
          const resolution = input.resolution as string

          const result = await resolveOpenQuestion(questionId, resolution)
          if (!result.success) return fail(result.error)

          const nodeId = result.data.node_id
          await removeNode(nodeId)

          return ok(`Resolved question "${questionId}": ${resolution}`, {
            question: result.data,
          })
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
