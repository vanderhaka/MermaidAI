import type Anthropic from '@anthropic-ai/sdk'

import {
  createModule,
  updateModule,
  deleteModule,
  getModuleById,
} from '@/lib/services/module-service'
import { connectModules } from '@/lib/services/module-connection-service'
import { lookupDocumentation } from '@/lib/services/doc-lookup-service'
import {
  addNode,
  updateNode,
  removeNode,
  addEdge,
  removeEdge,
  getGraphForModule,
} from '@/lib/services/graph-service'
import { updateProject } from '@/lib/services/project-service'
import {
  createOpenQuestion,
  resolveOpenQuestion,
  listOpenQuestions,
} from '@/lib/services/open-question-service'
import type { ToolResult } from '@/lib/services/llm-client'
import type { FlowEdge, FlowNode } from '@/types/graph'
import type { PromptMode } from '@/lib/services/prompt-builder'
import { validateFlowGraph, type FlowGraphIssue } from '@/lib/canvas/graph-invariants'
import { isClickOnlySelectedQuestionPrompt } from '@/lib/services/selected-open-question'

const DEFAULT_MODULE_COLOR = '#111827'
const DEFAULT_NODE_COLOR = '#2563eb'

/** Normalized comparison key so reworded whitespace/punctuation variants of the same question match. */
function normalizeQuestionKey(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

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

const insertNodeBetweenTool: Anthropic.Tool = {
  name: 'insert_node_between',
  description:
    'Insert a new node between two existing nodes in one atomic operation: removes any direct edge source → target, creates the new node, and wires source → new node → target. Use this whenever a step must be added between two existing steps. Never replicate this manually with delete_edge/create_node/create_edge.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: { type: 'string', description: 'ID of the module containing both nodes' },
      sourceNodeId: { type: 'string', description: 'ID of the node the new step comes after' },
      targetNodeId: { type: 'string', description: 'ID of the node the new step comes before' },
      label: { type: 'string', description: 'Label for the new node' },
      nodeType: {
        type: 'string',
        enum: ['process', 'decision', 'entry', 'exit', 'start', 'end'],
        description: 'Type of the new node (usually process or decision)',
      },
      pseudocode: {
        type: 'string',
        description: 'Optional pseudocode for process nodes.',
      },
      incomingEdgeLabel: {
        type: 'string',
        description:
          'Optional label for the edge source → new node. Defaults to the label of the replaced direct edge, if any.',
      },
      outgoingEdgeLabel: {
        type: 'string',
        description: 'Optional label for the edge new node → target.',
      },
    },
    required: ['moduleId', 'sourceNodeId', 'targetNodeId', 'label', 'nodeType'],
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

const addOpenQuestionsTool: Anthropic.Tool = {
  name: 'add_open_questions',
  description:
    'Batch-create open question markers on the canvas. Call once per response with ALL detected gaps, ambiguities, or missing details. Each question appears as an amber "?" marker.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: {
        type: 'string',
        description: 'ID of the module (scope module) to place the questions in',
      },
      questions: {
        type: 'array',
        description:
          'Array of open questions to create. Include ALL gaps detected in this response — do not call this tool multiple times.',
        items: {
          type: 'object',
          properties: {
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
          required: ['section', 'question'],
        },
      },
    },
    required: ['moduleId', 'questions'],
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

const writePrdTool: Anthropic.Tool = {
  name: 'write_prd',
  description:
    'Write or append to the PRD (Product Requirements Document) for a module. Call this alongside flow-building tools to progressively document requirements, business rules, and decisions as they emerge from the conversation. Each call appends to the existing content.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: {
        type: 'string',
        description: 'ID of the module to write PRD content for',
      },
      markdown: {
        type: 'string',
        description:
          'Markdown content to append. Use headings, bullets, and tables. Cover: purpose, user stories, business rules, decision logic, integrations, and constraints.',
      },
    },
    required: ['moduleId', 'markdown'],
  },
}

const promoteProjectTool: Anthropic.Tool = {
  name: 'promote_project',
  description:
    'Switch the project to a different mode. Use "to": "architecture" when the user asks to build modules, break into architecture, or move to full design — then use create_module and connect_modules to build the module map. From brainstorm mode, "to": "scope" switches to Quick Capture with open-question tracking.',
  input_schema: {
    type: 'object' as const,
    properties: {
      to: {
        type: 'string',
        enum: ['architecture', 'scope'],
        description: 'Target project mode. Defaults to architecture.',
      },
    },
    required: [],
  },
}

export { addOpenQuestionsTool, resolveOpenQuestionTool, writePrdTool }

// ---------------------------------------------------------------------------
// Tool sets per mode
// ---------------------------------------------------------------------------

const MODULE_TOOLS = [
  createModuleTool,
  updateModuleTool,
  deleteModuleTool,
  connectModulesTool,
  lookupDocsTool,
  writePrdTool,
]
const NODE_EDGE_TOOLS = [
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  deleteEdgeTool,
  lookupDocsTool,
  writePrdTool,
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
  writePrdTool,
]
const SCOPE_TOOLS = [
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  deleteEdgeTool,
  insertNodeBetweenTool,
  addOpenQuestionsTool,
  resolveOpenQuestionTool,
  writePrdTool,
  lookupDocsTool,
  promoteProjectTool,
  createModuleTool,
  updateModuleTool,
  connectModulesTool,
]
const FLOWCHART_TOOLS = [
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  deleteEdgeTool,
  insertNodeBetweenTool,
  writePrdTool,
]
const BRAINSTORM_TOOLS = [
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  deleteEdgeTool,
  insertNodeBetweenTool,
  writePrdTool,
  promoteProjectTool,
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
    case 'flowchart_build':
      return FLOWCHART_TOOLS
    case 'brainstorm_build':
      return BRAINSTORM_TOOLS
  }
}

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

type ToolInput = Record<string, unknown>

export type ToolExecutorOptions = {
  latestUserMessage?: string
  resolvingOpenQuestion?: {
    id: string
    section: string
    question: string
  }
}

function ok(content: string, data?: Record<string, unknown>): ToolResult {
  return { content, isError: false, data }
}

function fail(message: string): ToolResult {
  return { content: message, isError: true }
}

function formatGraphIssue(issue: FlowGraphIssue): string {
  return `${issue.code} at ${issue.nodeId}: ${issue.message}`
}

async function buildGraphCheck(moduleId: string): Promise<{
  content: string
  issues: FlowGraphIssue[]
} | null> {
  const graph = await getGraphForModule(moduleId)
  if (!graph.success) {
    return {
      content: `Graph check unavailable: ${graph.error}`,
      issues: [],
    }
  }

  const issues = validateFlowGraph(graph.data)
  if (issues.length === 0) return null

  const topIssues = issues.slice(0, 5).map(formatGraphIssue)
  const extra =
    issues.length > topIssues.length ? `; +${issues.length - topIssues.length} more` : ''

  return {
    content: `Graph check: ${issues.length} issue(s) remain. Repair before replying: ${topIssues.join('; ')}${extra}`,
    issues,
  }
}

async function okWithGraphCheck(
  content: string,
  moduleId: string,
  data?: Record<string, unknown>,
): Promise<ToolResult> {
  const graphCheck = await buildGraphCheck(moduleId)
  if (!graphCheck) return ok(content, data)

  return ok(`${content}\n\n${graphCheck.content}`, {
    ...data,
    graphIssues: graphCheck.issues,
  })
}

function isSelectedQuestionPromptWithoutAnswer(
  questionId: string,
  options: ToolExecutorOptions,
): boolean {
  const selected = options.resolvingOpenQuestion
  const latest = options.latestUserMessage
  if (!selected || !latest || selected.id !== questionId) return false

  return isClickOnlySelectedQuestionPrompt(latest, selected)
}

export function createToolExecutor(projectId: string, options: ToolExecutorOptions = {}) {
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
          return okWithGraphCheck(
            `Created node "${result.data.label}" (id: ${result.data.id}, type: ${result.data.node_type})`,
            input.moduleId as string,
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
          return okWithGraphCheck(
            `Updated node "${result.data.label}" (id: ${result.data.id})`,
            result.data.module_id,
            {
              node: result.data,
            },
          )
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
          return okWithGraphCheck(
            `Created edge ${input.sourceNodeId} → ${input.targetNodeId} (id: ${result.data.id})`,
            input.moduleId as string,
            { edge: result.data },
          )
        }

        case 'delete_edge': {
          const result = await removeEdge(input.edgeId as string)
          if (!result.success) return fail(result.error)
          return ok(`Deleted edge ${input.edgeId}`, { deletedEdgeId: input.edgeId })
        }

        case 'insert_node_between': {
          const moduleId = input.moduleId as string
          const sourceNodeId = input.sourceNodeId as string
          const targetNodeId = input.targetNodeId as string

          if (sourceNodeId === targetNodeId) {
            return fail('sourceNodeId and targetNodeId must be two different nodes.')
          }

          const graph = await getGraphForModule(moduleId)
          if (!graph.success) return fail(graph.error)

          const nodeIds = new Set(graph.data.nodes.map((node) => node.id))
          const missing = [sourceNodeId, targetNodeId].filter((id) => !nodeIds.has(id))
          if (missing.length > 0) {
            const known = graph.data.nodes
              .map((node) => `"${node.label}" (id: ${node.id})`)
              .join(', ')
            return fail(
              `Node(s) not found in module: ${missing.join(', ')}. Existing nodes: ${known || 'none'}`,
            )
          }

          const staleEdges = graph.data.edges.filter(
            (edge) => edge.source_node_id === sourceNodeId && edge.target_node_id === targetNodeId,
          )

          const nodeResult = await addNode({
            module_id: moduleId,
            label: input.label as string,
            node_type: input.nodeType as string,
            pseudocode: (input.pseudocode as string) ?? '',
            position: { x: 0, y: 0 },
            color: DEFAULT_NODE_COLOR,
          })
          if (!nodeResult.success) return fail(nodeResult.error)

          const removedEdgeIds: string[] = []
          for (const edge of staleEdges) {
            const removed = await removeEdge(edge.id)
            if (removed.success) removedEdgeIds.push(edge.id)
          }

          const edges: FlowEdge[] = []
          const failures: string[] = []
          const incomingEdge = await addEdge({
            module_id: moduleId,
            source_node_id: sourceNodeId,
            target_node_id: nodeResult.data.id,
            label:
              (input.incomingEdgeLabel as string | undefined) ?? staleEdges[0]?.label ?? undefined,
            condition: staleEdges[0]?.condition ?? undefined,
          })
          if (incomingEdge.success) edges.push(incomingEdge.data)
          else failures.push(`incoming edge: ${incomingEdge.error}`)

          const outgoingEdge = await addEdge({
            module_id: moduleId,
            source_node_id: nodeResult.data.id,
            target_node_id: targetNodeId,
            label: input.outgoingEdgeLabel as string | undefined,
          })
          if (outgoingEdge.success) edges.push(outgoingEdge.data)
          else failures.push(`outgoing edge: ${outgoingEdge.error}`)

          // Report partial failures as a warning (not isError) so the client still
          // receives the node/edges that did land and the model can repair the rest.
          const warning =
            failures.length > 0
              ? ` WARNING: ${failures.join('; ')}. Finish wiring with create_edge.`
              : ''

          return okWithGraphCheck(
            `Inserted node "${nodeResult.data.label}" (id: ${nodeResult.data.id}) between ${sourceNodeId} and ${targetNodeId}.${warning}`,
            moduleId,
            { node: nodeResult.data, edges, removedEdgeIds },
          )
        }

        case 'lookup_docs': {
          const library = input.library as string
          const topic = input.topic as string
          const result = await lookupDocumentation(library, topic)
          return ok(result.summary, {
            lookup: { library, topic },
          })
        }

        case 'promote_project': {
          const to = input.to === 'scope' ? 'scope' : 'architecture'
          const result = await updateProject(projectId, { mode: to })
          if (!result.success) return fail(result.error)
          return ok(`Project promoted to ${to} mode.`, { promoted: true, mode: to })
        }

        case 'write_prd': {
          const moduleId = input.moduleId as string
          const markdown = input.markdown as string

          const modResult = await getModuleById(moduleId)
          if (!modResult.success) return fail(modResult.error)

          const existing = modResult.data.prd_content ?? ''
          const updated = existing ? `${existing}\n\n${markdown}` : markdown

          const result = await updateModule(moduleId, { prd_content: updated })
          if (!result.success) return fail(result.error)

          return ok(`Updated PRD for "${result.data.name}"`, {
            module: result.data,
          })
        }

        case 'add_open_questions': {
          const moduleId = input.moduleId as string
          const items = input.questions as Array<{
            section: string
            question: string
            relatedNodeId?: string
          }>

          if (!items || items.length === 0) {
            return ok('No questions to add.')
          }

          // Server-side dedup — provider-fallback turns re-add questions the
          // prompt-level rule misses, polluting the client's gap list.
          const existingQuestions = await listOpenQuestions(projectId)
          const seenKeys = new Set(
            (existingQuestions.success ? existingQuestions.data : []).map((q) =>
              normalizeQuestionKey(q.question),
            ),
          )

          const nodes: FlowNode[] = []
          const questions: Array<Record<string, unknown>> = []
          const edges: Array<Record<string, unknown>> = []
          const errors: string[] = []
          let skippedDuplicates = 0

          for (const item of items) {
            const key = normalizeQuestionKey(item.question)
            if (seenKeys.has(key)) {
              skippedDuplicates += 1
              continue
            }
            seenKeys.add(key)
            const label =
              item.question.length > 60 ? `${item.question.slice(0, 57)}...` : item.question

            const nodeResult = await addNode({
              module_id: moduleId,
              label,
              node_type: 'question',
              pseudocode: item.question,
              position: { x: 0, y: 0 },
              color: '#F59E0B',
            })
            if (!nodeResult.success) {
              errors.push(`Node for "${label}": ${nodeResult.error}`)
              continue
            }

            const questionResult = await createOpenQuestion({
              project_id: projectId,
              node_id: nodeResult.data.id,
              section: item.section,
              question: item.question,
            })
            if (!questionResult.success) {
              errors.push(`Question "${label}": ${questionResult.error}`)
              continue
            }

            nodes.push(nodeResult.data)
            questions.push(questionResult.data)

            if (item.relatedNodeId) {
              const edgeResult = await addEdge({
                module_id: moduleId,
                source_node_id: item.relatedNodeId,
                target_node_id: nodeResult.data.id,
              })
              if (edgeResult.success) {
                edges.push(edgeResult.data)
              }
            }
          }

          if (nodes.length === 0 && skippedDuplicates === items.length) {
            return ok(
              `All ${items.length} question(s) already exist as open questions — nothing added. Do not re-add them.`,
            )
          }

          if (nodes.length === 0) {
            return fail(`All ${items.length} questions failed: ${errors.join('; ')}`)
          }

          const skippedNote =
            skippedDuplicates > 0
              ? ` Skipped ${skippedDuplicates} duplicate(s) that already exist.`
              : ''
          const summary = `Added ${nodes.length} open question(s).${errors.length > 0 ? ` ${errors.length} failed.` : ''}${skippedNote}`
          return ok(summary, { nodes, questions, edges })
        }

        case 'resolve_open_question': {
          const questionId = input.questionId as string
          const resolution = input.resolution as string

          if (isSelectedQuestionPromptWithoutAnswer(questionId, options)) {
            return fail(
              'Cannot resolve the selected open question yet. The latest user message only selected the question; ask it with a recommended answer and wait for the user answer or explicit acceptance.',
            )
          }

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
