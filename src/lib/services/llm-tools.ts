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
  updateEdge,
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
import { readChatToolReceipt } from '@/lib/chat-turn'
import {
  CHAT_TOOL_RECEIPT_KEY,
  type ArchitectureChangeSummary,
  type ChatToolReceipt,
  type ChatTurnIdentity,
} from '@/types/chat'
import type { FlowEdge, FlowNode, Module, ModuleConnection, OpenQuestion } from '@/types/graph'
import type { PromptMode } from '@/lib/services/prompt-builder'
import { validateFlowGraph, type FlowGraphIssue } from '@/lib/canvas/graph-invariants'
import { isClickOnlySelectedQuestionPrompt } from '@/lib/services/selected-open-question'
import { captureArchitectureMap } from '@/lib/services/architecture-service'
import { applyArchitectureRefinement } from '@/lib/services/architecture-refinement-service'
import { summarizeArchitectureOperations } from '@/lib/planning/architecture-change-summary'

const DEFAULT_MODULE_COLOR = '#111827'
const DEFAULT_NODE_COLOR = '#2563eb'
const MAX_SCOPE_BATCH_NODES = 40
const MAX_SCOPE_BATCH_EDGES = 80
const MAX_SCOPE_BATCH_QUESTIONS = 20

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

const captureArchitectureMapTool: Anthropic.Tool = {
  name: 'capture_architecture_map',
  description:
    'Atomically create the complete provisional high-level Architecture for a project with no modules. Use local keys to submit every initial capability, connection, important flow, known assumption, and material question in one call. Never use this to replace or rebuild an existing map; use granular tools for refinement.',
  input_schema: {
    type: 'object' as const,
    properties: {
      objective: {
        type: 'string',
        description: 'The high-level outcome this system exists to achieve.',
      },
      outcomes: {
        type: 'array',
        items: { type: 'string' },
        description: 'One or more observable outcomes for the actors.',
      },
      actors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Actors explicitly stated in the brief or safely evident from it.',
      },
      modules: {
        type: 'array',
        description:
          'All initial high-level capabilities. Every capability must connect to another unless disconnectedJustification explains an intentional boundary.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Unique local key such as bookings or payments.' },
            name: { type: 'string' },
            domain: { type: 'string' },
            purpose: { type: 'string' },
            responsibilities: { type: 'array', items: { type: 'string' } },
            boundaries: { type: 'array', items: { type: 'string' } },
            entryPoints: { type: 'array', items: { type: 'string' } },
            exitPoints: { type: 'array', items: { type: 'string' } },
            disconnectedJustification: { type: 'string' },
          },
          required: [
            'key',
            'name',
            'purpose',
            'responsibilities',
            'boundaries',
            'entryPoints',
            'exitPoints',
          ],
        },
      },
      connections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sourceKey: { type: 'string' },
            targetKey: { type: 'string' },
            description: { type: 'string' },
            sourceExitPoint: { type: 'string' },
            targetEntryPoint: { type: 'string' },
          },
          required: [
            'sourceKey',
            'targetKey',
            'description',
            'sourceExitPoint',
            'targetEntryPoint',
          ],
        },
      },
      importantFlows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            actor: { type: 'string' },
            outcome: { type: 'string' },
            capabilityKeys: { type: 'array', items: { type: 'string' } },
          },
          required: ['key', 'actor', 'outcome', 'capabilityKeys'],
        },
      },
      assumptions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            statement: { type: 'string' },
          },
          required: ['category', 'statement'],
        },
      },
      questions: {
        type: 'array',
        description:
          'Material unknowns worth recording. Ask at most one of them in the response after useful work.',
        items: {
          type: 'object',
          properties: {
            section: { type: 'string' },
            question: { type: 'string' },
            readinessImpact: {
              type: 'string',
              enum: ['blocking', 'non_blocking', 'deferred'],
            },
            relatedModuleKey: { type: 'string' },
          },
          required: ['section', 'question', 'readinessImpact', 'relatedModuleKey'],
        },
      },
    },
    required: [
      'objective',
      'outcomes',
      'actors',
      'modules',
      'connections',
      'importantFlows',
      'assumptions',
      'questions',
    ],
  },
}

const refineArchitectureMapTool: Anthropic.Tool = {
  name: 'refine_architecture_map',
  description:
    'Atomically refine an existing high-level Architecture in one call. It can update the Architecture brief, capabilities, connections, actor flows, exact open questions, and exact planning decisions. New modules and flows use local keys. Never split one user request across repeated mutation tools, and never claim a question or decision changed unless it is included here.',
  input_schema: {
    type: 'object' as const,
    properties: {
      objective: {
        type: 'string',
        description: 'Optional replacement for the high-level Architecture objective.',
      },
      outcomes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional complete replacement list of observable outcomes.',
      },
      actors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional complete replacement list of named actors.',
      },
      importantFlows: {
        type: 'array',
        description:
          'Optional complete replacement list of actor-to-outcome flows. Capability references may be exact existing module IDs or local createModules keys.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            actor: { type: 'string' },
            outcome: { type: 'string' },
            capabilityRefs: { type: 'array', items: { type: 'string' } },
          },
          required: ['key', 'actor', 'outcome', 'capabilityRefs'],
        },
      },
      createModules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Unique local key such as notifications.' },
            name: { type: 'string' },
            domain: { type: 'string' },
            description: { type: 'string' },
            responsibilities: { type: 'array', items: { type: 'string' } },
            boundaries: { type: 'array', items: { type: 'string' } },
            entryPoints: { type: 'array', items: { type: 'string' } },
            exitPoints: { type: 'array', items: { type: 'string' } },
          },
          required: ['key', 'name', 'description', 'entryPoints', 'exitPoints'],
        },
      },
      updateModules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            moduleId: { type: 'string', description: 'Exact existing module ID.' },
            name: { type: 'string' },
            domain: { type: 'string' },
            description: { type: 'string' },
            responsibilities: { type: 'array', items: { type: 'string' } },
            boundaries: { type: 'array', items: { type: 'string' } },
            entryPoints: { type: 'array', items: { type: 'string' } },
            exitPoints: { type: 'array', items: { type: 'string' } },
          },
          required: ['moduleId'],
        },
      },
      deleteModuleIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exact existing module IDs to delete.',
      },
      connectModules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Existing module ID or local key from createModules.',
            },
            target: {
              type: 'string',
              description: 'Existing module ID or local key from createModules.',
            },
            sourceExitPoint: { type: 'string' },
            targetEntryPoint: { type: 'string' },
          },
          required: ['source', 'target', 'sourceExitPoint', 'targetEntryPoint'],
        },
      },
      disconnectModules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sourceModuleId: { type: 'string', description: 'Exact existing source module ID.' },
            targetModuleId: { type: 'string', description: 'Exact existing target module ID.' },
          },
          required: ['sourceModuleId', 'targetModuleId'],
        },
        description: 'Remove every existing connection between each exact source-target pair.',
      },
      resolveQuestions: {
        type: 'array',
        description:
          'Resolve exact open-question IDs only when the latest user message supplies or confirms the answer. The answer is recorded as an accepted user decision with chat evidence.',
        items: {
          type: 'object',
          properties: {
            questionId: { type: 'string', description: 'Exact current open-question ID.' },
            resolution: { type: 'string' },
            supersedesDecisionId: {
              type: 'string',
              description:
                'Exact active decision ID replaced by this answer. Supply it when the answer narrows or contradicts an existing assumption.',
            },
          },
          required: ['questionId', 'resolution'],
        },
      },
      decisionActions: {
        type: 'array',
        description:
          'Accept or reject exact proposed decision IDs only when the latest user message explicitly confirms that action.',
        items: {
          type: 'object',
          properties: {
            decisionId: { type: 'string', description: 'Exact current proposed decision ID.' },
            action: { type: 'string', enum: ['accept', 'reject'] },
            reason: { type: 'string' },
          },
          required: ['decisionId', 'action', 'reason'],
        },
      },
      decisionReplacements: {
        type: 'array',
        description:
          'Link an already-recorded active decision as the replacement for another active decision. This supersedes the old decision without duplicating the replacement.',
        items: {
          type: 'object',
          properties: {
            decisionId: {
              type: 'string',
              description: 'Exact active decision ID that contains the current rule.',
            },
            supersedesDecisionId: {
              type: 'string',
              description: 'Exact older active decision ID replaced by the current rule.',
            },
            reason: { type: 'string' },
          },
          required: ['decisionId', 'supersedesDecisionId', 'reason'],
        },
      },
      recordDecisions: {
        type: 'array',
        description:
          'Record new high-level choices. User choices are accepted only when explicitly stated in the latest user message; assistant choices remain proposed for review.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Unique local key for this new decision.' },
            category: { type: 'string' },
            statement: { type: 'string' },
            provenance: { type: 'string', enum: ['user', 'assistant'] },
            readinessImpact: {
              type: 'string',
              enum: ['blocking', 'non_blocking', 'deferred'],
            },
            reason: { type: 'string' },
            supersedesDecisionId: {
              type: 'string',
              description:
                'Exact active decision ID this choice replaces. Omit when it is an additional compatible choice.',
            },
          },
          required: ['key', 'category', 'statement', 'provenance', 'readinessImpact', 'reason'],
        },
      },
    },
    required: [
      'createModules',
      'updateModules',
      'deleteModuleIds',
      'connectModules',
      'disconnectModules',
      'resolveQuestions',
      'decisionActions',
      'decisionReplacements',
      'recordDecisions',
    ],
  },
}

const refineArchitectureFlowTool: Anthropic.Tool = {
  name: 'refine_architecture_flow',
  description:
    'Atomically refine one existing Architecture module flow in one call. Include every requested node and edge create, update, and delete. New nodes use local keys so new edges can reference them in the same commit.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: { type: 'string', description: 'Exact module ID for this flow.' },
      createNodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Unique local key such as validate-request.' },
            label: { type: 'string' },
            nodeType: {
              type: 'string',
              enum: ['process', 'decision', 'entry', 'exit', 'start', 'end'],
            },
            pseudocode: { type: 'string' },
          },
          required: ['key', 'label', 'nodeType'],
        },
      },
      updateNodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nodeId: { type: 'string' },
            label: { type: 'string' },
            nodeType: {
              type: 'string',
              enum: ['process', 'decision', 'entry', 'exit', 'start', 'end'],
            },
            pseudocode: { type: 'string' },
          },
          required: ['nodeId'],
        },
      },
      deleteNodeIds: { type: 'array', items: { type: 'string' } },
      createEdges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Existing node ID or local createNodes key.' },
            target: { type: 'string', description: 'Existing node ID or local createNodes key.' },
            label: { type: 'string' },
            condition: { type: 'string' },
          },
          required: ['source', 'target'],
        },
      },
      updateEdges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            edgeId: { type: 'string' },
            label: { type: 'string' },
            condition: { type: 'string' },
          },
          required: ['edgeId'],
        },
      },
      deleteEdgeIds: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'moduleId',
      'createNodes',
      'updateNodes',
      'deleteNodeIds',
      'createEdges',
      'updateEdges',
      'deleteEdgeIds',
    ],
  },
}

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

const updateEdgeTool: Anthropic.Tool = {
  name: 'update_edge',
  description:
    "Update an existing edge's label or condition — use this to relabel decision branches instead of delete_edge + create_edge.",
  input_schema: {
    type: 'object' as const,
    properties: {
      edgeId: { type: 'string', description: 'ID of the edge to update' },
      label: { type: 'string', description: 'New label for the edge (e.g. "Yes", "No")' },
      condition: { type: 'string', description: 'New condition for the edge' },
    },
    required: ['edgeId'],
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

const captureScopeFlowTool: Anthropic.Tool = {
  name: 'capture_scope_flow',
  description:
    'Create a complete Quick Capture draft in one dependency-safe batch. New nodes use local keys, so edges and question markers can reference them without waiting for server-generated IDs. Prefer one call per user message.',
  input_schema: {
    type: 'object' as const,
    properties: {
      moduleId: {
        type: 'string',
        description: 'ID of the scope module that receives every node and edge in this batch',
      },
      nodes: {
        type: 'array',
        description: 'All new flow nodes for this input, each with a unique local key',
        items: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Short unique local key used by edges and questions in this call',
            },
            label: { type: 'string', description: 'Short 3-6 word canvas label' },
            nodeType: {
              type: 'string',
              enum: ['process', 'decision', 'start', 'end'],
              description: 'Flow node type. Questions belong in the questions array.',
            },
          },
          required: ['key', 'label', 'nodeType'],
        },
      },
      edges: {
        type: 'array',
        description:
          'All new flow edges. source and target may be local node keys from this call or exact existing node IDs.',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Local key or existing source node ID' },
            target: { type: 'string', description: 'Local key or existing target node ID' },
            label: { type: 'string', description: 'Optional edge label' },
            condition: { type: 'string', description: 'Optional branch condition' },
          },
          required: ['source', 'target'],
        },
      },
      questions: {
        type: 'array',
        description: 'All gaps or ambiguities detected in this input',
        items: {
          type: 'object',
          properties: {
            section: { type: 'string', description: 'Logical section for the question' },
            question: { type: 'string', description: 'The unresolved question' },
            relatedNode: {
              type: 'string',
              description:
                'Optional local node key or exact existing node ID to attach the marker to',
            },
          },
          required: ['section', 'question'],
        },
      },
    },
    required: ['moduleId', 'nodes', 'edges', 'questions'],
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

export {
  captureArchitectureMapTool,
  refineArchitectureMapTool,
  refineArchitectureFlowTool,
  captureScopeFlowTool,
  addOpenQuestionsTool,
  resolveOpenQuestionTool,
  writePrdTool,
}

// ---------------------------------------------------------------------------
// Tool sets per mode
// ---------------------------------------------------------------------------

const MODULE_TOOLS = [
  captureArchitectureMapTool,
  createModuleTool,
  updateModuleTool,
  deleteModuleTool,
  connectModulesTool,
  lookupDocsTool,
  writePrdTool,
]
const STAGED_MODULE_TOOLS = [captureArchitectureMapTool, refineArchitectureMapTool, lookupDocsTool]
const NODE_EDGE_TOOLS = [
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  updateEdgeTool,
  deleteEdgeTool,
  lookupDocsTool,
  writePrdTool,
]
const STAGED_NODE_EDGE_TOOLS = [refineArchitectureFlowTool, lookupDocsTool]
const ALL_TOOLS = [
  createModuleTool,
  updateModuleTool,
  deleteModuleTool,
  connectModulesTool,
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  updateEdgeTool,
  deleteEdgeTool,
  lookupDocsTool,
  writePrdTool,
]
const SCOPE_TOOLS = [
  captureScopeFlowTool,
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  updateEdgeTool,
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
  updateEdgeTool,
  deleteEdgeTool,
  insertNodeBetweenTool,
  writePrdTool,
]
const BRAINSTORM_TOOLS = [
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  updateEdgeTool,
  deleteEdgeTool,
  insertNodeBetweenTool,
  writePrdTool,
  promoteProjectTool,
]

export function getToolsForMode(
  mode: PromptMode,
  options: { stagedArchitecture?: boolean } = {},
): Anthropic.Tool[] {
  switch (mode) {
    case 'discovery':
      return ALL_TOOLS
    case 'module_map':
      return options.stagedArchitecture ? STAGED_MODULE_TOOLS : MODULE_TOOLS
    case 'module_detail':
      return options.stagedArchitecture ? STAGED_NODE_EDGE_TOOLS : NODE_EDGE_TOOLS
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

type ToolExecutionContext = {
  startingSequence: number
}

export type ToolExecutorOptions = {
  authenticatedUserId?: string
  latestUserMessage?: string
  turnIdentity?: ChatTurnIdentity
  mode?: PromptMode
  resolvingOpenQuestion?: {
    id: string
    section: string
    question: string
  }
}

function ok(content: string, data?: Record<string, unknown>, terminalText?: string): ToolResult {
  return { content, isError: false, data, terminalText }
}

function fail(message: string): ToolResult {
  return { content: message, isError: true }
}

function countedNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function joinWithAnd(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

function compactCapabilityNames(modules: readonly Pick<Module, 'name'>[]): string {
  const names = modules.slice(0, 6).map((module) => module.name)
  const hiddenCount = modules.length - names.length
  if (hiddenCount > 0) names.push(`${hiddenCount} more`)
  return joinWithAnd(names)
}

function architectureTerminalText(
  summary: ArchitectureChangeSummary,
  committed: {
    modules: readonly Pick<Module, 'id' | 'name'>[]
    connections: readonly Pick<ModuleConnection, 'source_module_id' | 'target_module_id'>[]
    questions: readonly Pick<OpenQuestion, 'question' | 'readiness_impact'>[]
  },
): string {
  const capabilityNames = compactCapabilityNames(committed.modules)
  const sentences = [
    `Built a provisional Architecture with ${countedNoun(summary.capabilitiesCreated, 'capability', 'capabilities')}${capabilityNames ? `: ${capabilityNames}` : ''}.`,
  ]

  if (summary.connectionsCreated > 0) {
    sentences.push(
      `Connected ${countedNoun(summary.connectionsCreated, 'relationship', 'relationships')}.`,
    )
  }

  const moduleNames = new Map(committed.modules.map((module) => [module.id, module.name]))
  const namedFlow = committed.connections
    .map((connection) => ({
      source: moduleNames.get(connection.source_module_id),
      target: moduleNames.get(connection.target_module_id),
    }))
    .find((connection) => connection.source && connection.target)
  if (namedFlow?.source && namedFlow.target) {
    sentences.push(`Key flow: ${namedFlow.source} → ${namedFlow.target}.`)
  }

  const recorded = [
    ...(summary.assumptionsRecorded > 0
      ? [countedNoun(summary.assumptionsRecorded, 'assumption')]
      : []),
    ...(summary.questionsRecorded > 0 ? [countedNoun(summary.questionsRecorded, 'question')] : []),
  ]
  if (recorded.length > 0) sentences.push(`Recorded ${joinWithAnd(recorded)}.`)

  sentences.push(
    'This stays high level; lower-level implementation detail belongs in the Work Plan.',
  )

  const questionToConfirm =
    committed.questions.find((question) => question.readiness_impact === 'blocking') ??
    committed.questions.find((question) => question.readiness_impact === 'non_blocking')
  if (questionToConfirm) {
    sentences.push(`One decision to confirm: ${questionToConfirm.question}`)
  }

  return sentences.join(' ')
}

function architectureRefinementTerminalText(
  summary: ArchitectureChangeSummary,
  committed: Record<string, unknown>,
  scope: 'map' | 'flow',
): string {
  const createdModules = (committed.createdModules as Module[] | undefined) ?? []
  const createdNodes = (committed.createdNodes as FlowNode[] | undefined) ?? []
  const updatedModules = (committed.updatedModules as Module[] | undefined) ?? []
  const updatedNodes = (committed.updatedNodes as FlowNode[] | undefined) ?? []
  const createdConnections = (committed.createdConnections as ModuleConnection[] | undefined) ?? []
  const createdEdges = (committed.createdEdges as FlowEdge[] | undefined) ?? []
  const deletedModuleIds = (committed.deletedModuleIds as string[] | undefined) ?? []
  const deletedNodeIds = (committed.deletedNodeIds as string[] | undefined) ?? []
  const deletedConnectionIds = (committed.deletedConnectionIds as string[] | undefined) ?? []
  const deletedEdgeIds = (committed.deletedEdgeIds as string[] | undefined) ?? []
  const clauses =
    scope === 'map'
      ? [
          ...(createdModules.length
            ? [`added ${countedNoun(createdModules.length, 'capability', 'capabilities')}`]
            : []),
          ...(updatedModules.length
            ? [`updated ${countedNoun(updatedModules.length, 'capability', 'capabilities')}`]
            : []),
          ...(deletedModuleIds.length
            ? [`removed ${countedNoun(deletedModuleIds.length, 'capability', 'capabilities')}`]
            : []),
          ...(createdConnections.length
            ? [`connected ${countedNoun(createdConnections.length, 'handoff', 'handoffs')}`]
            : []),
          ...(deletedConnectionIds.length
            ? [`disconnected ${countedNoun(deletedConnectionIds.length, 'handoff', 'handoffs')}`]
            : []),
          ...(summary.assumed > 0 ? [`recorded ${countedNoun(summary.assumed, 'decision')}`] : []),
          ...(summary.resolved > 0
            ? [`resolved ${countedNoun(summary.resolved, 'question')}`]
            : []),
        ]
      : [
          ...(createdNodes.length ? [`added ${countedNoun(createdNodes.length, 'step')}`] : []),
          ...(updatedNodes.length ? [`updated ${countedNoun(updatedNodes.length, 'step')}`] : []),
          ...(deletedNodeIds.length
            ? [`removed ${countedNoun(deletedNodeIds.length, 'step')}`]
            : []),
          ...(createdEdges.length ? [`connected ${countedNoun(createdEdges.length, 'path')}`] : []),
          ...(deletedEdgeIds.length
            ? [`removed ${countedNoun(deletedEdgeIds.length, 'path')}`]
            : []),
        ]

  const detail = clauses.length > 0 ? clauses.join(' · ') : `${summary.updated} changes committed`
  return `Architecture updated: ${detail}. The whole request committed atomically and is ready to review or undo.`
}

/** Long node lists blow the tool-result budget — the model only needs enough to re-aim. */
const MAX_LISTED_NODES = 30

/**
 * Failure path only: a hallucinated node id is the most common model mistake, and a raw
 * foreign-key error gives it nothing to correct with. Hand back the real node list instead.
 */
async function failWithExistingNodes(error: string, moduleId: string): Promise<ToolResult> {
  const graph = await getGraphForModule(moduleId)
  if (!graph.success) return fail(error)

  const listed = graph.data.nodes
    .slice(0, MAX_LISTED_NODES)
    .map((node) => `"${node.label}" (id: ${node.id})`)
    .join(', ')
  const extra =
    graph.data.nodes.length > MAX_LISTED_NODES
      ? `, +${graph.data.nodes.length - MAX_LISTED_NODES} more`
      : ''

  return fail(`${error}. Existing nodes: ${listed || 'none'}${extra}`)
}

/** One-line, self-repair oriented failure text for a wrong or invented id. */
function failNotFound(
  kind: 'Node' | 'Edge',
  id: string,
  action: string,
  error: string,
): ToolResult {
  const list = kind === 'Node' ? 'Current nodes' : 'Current edges'
  return fail(
    `${kind} ${id} not found or ${action} failed: ${error}. Use the exact ${kind.toLowerCase()} id from the ${list} list or from earlier tool results — never invent ids.`,
  )
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

function createRawToolExecutor(projectId: string, options: ToolExecutorOptions = {}) {
  return async function executeTool(
    name: string,
    input: ToolInput,
    execution?: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      if (
        options.turnIdentity &&
        execution &&
        (options.mode === 'module_map' || options.mode === 'module_detail') &&
        [
          'refine_architecture_map',
          'refine_architecture_flow',
          'create_module',
          'update_module',
          'delete_module',
          'connect_modules',
          'create_node',
          'update_node',
          'delete_node',
          'create_edge',
          'update_edge',
          'delete_edge',
          'insert_node_between',
        ].includes(name)
      ) {
        const result = await applyArchitectureRefinement({
          projectId,
          ...(options.authenticatedUserId !== undefined
            ? { authenticatedUserId: options.authenticatedUserId }
            : {}),
          turnIdentity: options.turnIdentity,
          startingSequence: execution.startingSequence,
          toolName: name,
          input,
          ...(options.latestUserMessage !== undefined
            ? { latestUserMessage: options.latestUserMessage }
            : {}),
        })
        if (!result.success) {
          console.error('Architecture refinement tool failed', {
            projectId,
            toolName: name,
            error: result.error,
          })
          return fail(result.error)
        }

        const { chatReceipt, ...committed } = result.data
        const changeSummary = summarizeArchitectureOperations(committed.architectureReceipt)
        const isAtomicRefinement =
          name === 'refine_architecture_map' || name === 'refine_architecture_flow'
        return ok(
          `Committed Architecture refinement: ${name.replaceAll('_', ' ')}.`,
          {
            ...committed,
            ...(changeSummary ? { metadata: { change_summary: changeSummary } } : {}),
            [CHAT_TOOL_RECEIPT_KEY]: chatReceipt,
          },
          isAtomicRefinement && changeSummary
            ? architectureRefinementTerminalText(
                changeSummary,
                committed,
                name === 'refine_architecture_map' ? 'map' : 'flow',
              )
            : undefined,
        )
      }

      if (
        options.turnIdentity &&
        (options.mode === 'module_map' || options.mode === 'module_detail') &&
        name === 'write_prd'
      ) {
        return fail(
          'Architecture stays high level. Capture implementation detail in the Work Plan instead of writing a module PRD.',
        )
      }

      switch (name) {
        case 'capture_architecture_map': {
          if (!options.turnIdentity || !execution) {
            return fail('Architecture capture requires a durable planning turn identity.')
          }
          const result = await captureArchitectureMap({
            projectId,
            turnIdentity: options.turnIdentity,
            startingSequence: execution.startingSequence,
            input,
          })
          if (!result.success) return fail(result.error)

          const { chatReceipt, ...committed } = result.data
          const changeSummary: ArchitectureChangeSummary = {
            created:
              committed.modules.length + committed.connections.length + committed.questions.length,
            updated: 0,
            deleted: 0,
            assumed: committed.architectureReceipt.operations.filter(
              (operation) => operation.type === 'decision.create',
            ).length,
            resolved: 0,
            capabilitiesCreated: committed.modules.length,
            connectionsCreated: committed.connections.length,
            assumptionsRecorded: committed.architectureReceipt.operations.filter(
              (operation) => operation.type === 'decision.create',
            ).length,
            questionsRecorded: committed.questions.length,
            provisional: true,
          }
          return ok(
            `Built a provisional Architecture with ${committed.modules.length} capabilities and ${committed.connections.length} connections.`,
            {
              ...committed,
              metadata: { change_summary: changeSummary },
              [CHAT_TOOL_RECEIPT_KEY]: chatReceipt,
            },
            architectureTerminalText(changeSummary, committed),
          )
        }

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
          return ok(`Deleted module ${input.moduleId}`, { deletedModuleId: input.moduleId })
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

        case 'capture_scope_flow': {
          const moduleId = typeof input.moduleId === 'string' ? input.moduleId.trim() : ''
          const rawNodes = input.nodes
          const rawEdges = input.edges
          const rawQuestions = input.questions

          if (!moduleId) return fail('capture_scope_flow requires a moduleId.')
          if (
            !Array.isArray(rawNodes) ||
            !Array.isArray(rawEdges) ||
            !Array.isArray(rawQuestions)
          ) {
            return fail('capture_scope_flow requires nodes, edges, and questions arrays.')
          }
          if (
            rawNodes.length > MAX_SCOPE_BATCH_NODES ||
            rawEdges.length > MAX_SCOPE_BATCH_EDGES ||
            rawQuestions.length > MAX_SCOPE_BATCH_QUESTIONS
          ) {
            return fail(
              `Scope batch is too large. Maximum: ${MAX_SCOPE_BATCH_NODES} nodes, ${MAX_SCOPE_BATCH_EDGES} edges, and ${MAX_SCOPE_BATCH_QUESTIONS} questions.`,
            )
          }
          if (rawNodes.length === 0 && rawQuestions.length === 0) {
            return fail('Scope batch must contain at least one node or question.')
          }

          type ScopeNodeDraft = {
            key: string
            label: string
            nodeType: Extract<FlowNode['node_type'], 'process' | 'decision' | 'start' | 'end'>
          }
          type ScopeEdgeDraft = {
            source: string
            target: string
            label?: string
            condition?: string
          }
          type ScopeQuestionDraft = {
            section: string
            question: string
            relatedNode?: string
          }

          const allowedNodeTypes = new Set<FlowNode['node_type']>([
            'process',
            'decision',
            'start',
            'end',
          ])
          const nodeDrafts: ScopeNodeDraft[] = []
          const localKeys = new Set<string>()
          for (const [index, item] of rawNodes.entries()) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
              return fail(`nodes[${index}] must be an object.`)
            }
            const draft = item as Record<string, unknown>
            const key = typeof draft.key === 'string' ? draft.key.trim() : ''
            const label = typeof draft.label === 'string' ? draft.label.trim() : ''
            const nodeType = draft.nodeType
            if (!key || key.length > 80) {
              return fail(`nodes[${index}].key must be 1-80 characters.`)
            }
            if (localKeys.has(key)) return fail(`Duplicate local node key "${key}".`)
            if (!label || label.length > 200) {
              return fail(`nodes[${index}].label must be 1-200 characters.`)
            }
            if (
              typeof nodeType !== 'string' ||
              !allowedNodeTypes.has(nodeType as FlowNode['node_type'])
            ) {
              return fail(`nodes[${index}].nodeType must be process, decision, start, or end.`)
            }
            localKeys.add(key)
            nodeDrafts.push({
              key,
              label,
              nodeType: nodeType as ScopeNodeDraft['nodeType'],
            })
          }

          const edgeDrafts: ScopeEdgeDraft[] = []
          for (const [index, item] of rawEdges.entries()) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
              return fail(`edges[${index}] must be an object.`)
            }
            const draft = item as Record<string, unknown>
            const source = typeof draft.source === 'string' ? draft.source.trim() : ''
            const target = typeof draft.target === 'string' ? draft.target.trim() : ''
            if (!source || !target) {
              return fail(`edges[${index}] requires non-empty source and target references.`)
            }
            edgeDrafts.push({
              source,
              target,
              ...(typeof draft.label === 'string' && draft.label.trim()
                ? { label: draft.label.trim() }
                : {}),
              ...(typeof draft.condition === 'string' && draft.condition.trim()
                ? { condition: draft.condition.trim() }
                : {}),
            })
          }

          const questionDrafts: ScopeQuestionDraft[] = []
          for (const [index, item] of rawQuestions.entries()) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
              return fail(`questions[${index}] must be an object.`)
            }
            const draft = item as Record<string, unknown>
            const section = typeof draft.section === 'string' ? draft.section.trim() : ''
            const question = typeof draft.question === 'string' ? draft.question.trim() : ''
            const relatedNode =
              typeof draft.relatedNode === 'string' ? draft.relatedNode.trim() : ''
            if (!section || section.length > 100) {
              return fail(`questions[${index}].section must be 1-100 characters.`)
            }
            if (!question || question.length > 500) {
              return fail(`questions[${index}].question must be 1-500 characters.`)
            }
            questionDrafts.push({
              section,
              question,
              ...(relatedNode ? { relatedNode } : {}),
            })
          }

          const nodes: FlowNode[] = []
          const edges: FlowEdge[] = []
          const questions: OpenQuestion[] = []
          const errors: string[] = []
          const createdByKey = new Map<string, FlowNode>()

          for (const draft of nodeDrafts) {
            const result = await addNode({
              module_id: moduleId,
              label: draft.label,
              node_type: draft.nodeType,
              pseudocode: '',
              position: { x: 0, y: 0 },
              color: DEFAULT_NODE_COLOR,
            })
            if (!result.success) {
              errors.push(`Node "${draft.label}": ${result.error}`)
              continue
            }
            createdByKey.set(draft.key, result.data)
            nodes.push(result.data)
          }

          if (nodeDrafts.length > 0 && createdByKey.size === 0) {
            return fail(`All ${nodeDrafts.length} flow nodes failed: ${errors.join('; ')}`)
          }

          const resolveNodeRef = (reference: string): string | null => {
            if (localKeys.has(reference)) return createdByKey.get(reference)?.id ?? null
            return reference
          }

          for (const draft of edgeDrafts) {
            const sourceNodeId = resolveNodeRef(draft.source)
            const targetNodeId = resolveNodeRef(draft.target)
            if (!sourceNodeId || !targetNodeId) {
              errors.push(`Edge ${draft.source} → ${draft.target}: a referenced local node failed.`)
              continue
            }
            const result = await addEdge({
              module_id: moduleId,
              source_node_id: sourceNodeId,
              target_node_id: targetNodeId,
              ...(draft.label ? { label: draft.label } : {}),
              ...(draft.condition ? { condition: draft.condition } : {}),
            })
            if (result.success) edges.push(result.data)
            else errors.push(`Edge ${draft.source} → ${draft.target}: ${result.error}`)
          }

          const existingQuestions = await listOpenQuestions(projectId)
          const seenQuestionKeys = new Set(
            (existingQuestions.success ? existingQuestions.data : []).map((question) =>
              normalizeQuestionKey(question.question),
            ),
          )
          let skippedDuplicates = 0

          for (const draft of questionDrafts) {
            const questionKey = normalizeQuestionKey(draft.question)
            if (seenQuestionKeys.has(questionKey)) {
              skippedDuplicates += 1
              continue
            }
            seenQuestionKeys.add(questionKey)

            const label =
              draft.question.length > 60 ? `${draft.question.slice(0, 57)}...` : draft.question
            const nodeResult = await addNode({
              module_id: moduleId,
              label,
              node_type: 'question',
              pseudocode: draft.question,
              position: { x: 0, y: 0 },
              color: '#F59E0B',
            })
            if (!nodeResult.success) {
              errors.push(`Question node "${label}": ${nodeResult.error}`)
              continue
            }

            const questionResult = await createOpenQuestion({
              project_id: projectId,
              node_id: nodeResult.data.id,
              section: draft.section,
              question: draft.question,
            })
            if (!questionResult.success) {
              await removeNode(nodeResult.data.id)
              errors.push(`Question "${label}": ${questionResult.error}`)
              continue
            }

            nodes.push(nodeResult.data)
            questions.push(questionResult.data)

            if (draft.relatedNode) {
              const sourceNodeId = resolveNodeRef(draft.relatedNode)
              if (!sourceNodeId) {
                errors.push(`Question "${label}" was saved, but its related local node failed.`)
                continue
              }
              const edgeResult = await addEdge({
                module_id: moduleId,
                source_node_id: sourceNodeId,
                target_node_id: nodeResult.data.id,
              })
              if (edgeResult.success) edges.push(edgeResult.data)
              else errors.push(`Question edge for "${label}": ${edgeResult.error}`)
            }
          }

          if (nodes.length === 0) {
            if (skippedDuplicates === questionDrafts.length && questionDrafts.length > 0) {
              return ok(
                `All ${questionDrafts.length} question(s) already exist — nothing added. Do not re-add them.`,
                { nodes, edges, questions },
              )
            }
            return fail(`Nothing in the scope batch could be saved: ${errors.join('; ')}`)
          }

          const warning = errors.length > 0 ? ` ${errors.length} item(s) need repair.` : ''
          const duplicateNote =
            skippedDuplicates > 0 ? ` Skipped ${skippedDuplicates} duplicate question(s).` : ''
          return okWithGraphCheck(
            `Captured ${createdByKey.size} flow node(s), ${edges.length} edge(s), and ${questions.length} open question(s).${warning}${duplicateNote}`,
            moduleId,
            { nodes, edges, questions },
          )
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
          // Pick fields explicitly — a rest-spread would forward any stray key
          // the model invents straight into the DB update.
          const { nodeId, nodeType, label, pseudocode } = input as {
            nodeId: string
            nodeType?: string
            label?: string
            pseudocode?: string
          }
          const result = await updateNode(nodeId, {
            ...(label !== undefined ? { label } : {}),
            ...(pseudocode !== undefined ? { pseudocode } : {}),
            ...(nodeType ? { node_type: nodeType as FlowNode['node_type'] } : {}),
          })
          if (!result.success) return failNotFound('Node', nodeId, 'update', result.error)
          return okWithGraphCheck(
            `Updated node "${result.data.label}" (id: ${result.data.id})`,
            result.data.module_id,
            {
              node: result.data,
            },
          )
        }

        case 'delete_node': {
          const nodeId = input.nodeId as string
          const result = await removeNode(nodeId)
          if (!result.success) return failNotFound('Node', nodeId, 'delete', result.error)
          return ok(`Deleted node ${nodeId}`, { deletedNodeId: nodeId })
        }

        case 'create_edge': {
          const moduleId = input.moduleId as string
          const result = await addEdge({
            module_id: moduleId,
            source_node_id: input.sourceNodeId as string,
            target_node_id: input.targetNodeId as string,
            label: input.label as string | undefined,
            condition: input.condition as string | undefined,
          })
          if (!result.success) return failWithExistingNodes(result.error, moduleId)
          return okWithGraphCheck(
            `Created edge ${input.sourceNodeId} → ${input.targetNodeId} (id: ${result.data.id})`,
            moduleId,
            { edge: result.data },
          )
        }

        case 'update_edge': {
          // Same stray-key guard as update_node.
          const { edgeId, label, condition } = input as {
            edgeId: string
            label?: string
            condition?: string
          }
          const result = await updateEdge(edgeId, {
            ...(label !== undefined ? { label } : {}),
            ...(condition !== undefined ? { condition } : {}),
          })
          if (!result.success) return failNotFound('Edge', edgeId, 'update', result.error)
          return okWithGraphCheck(`Updated edge ${result.data.id}`, result.data.module_id, {
            edge: result.data,
          })
        }

        case 'delete_edge': {
          const edgeId = input.edgeId as string
          const result = await removeEdge(edgeId)
          if (!result.success) return failNotFound('Edge', edgeId, 'delete', result.error)
          return ok(`Deleted edge ${edgeId}`, { deletedEdgeId: edgeId })
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

          const result = await resolveOpenQuestion(projectId, questionId, resolution)
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

function receiptMatchesExecution(
  receipt: ChatToolReceipt,
  turnIdentity: ChatTurnIdentity,
  operationId: string,
  sequence: number,
): boolean {
  return (
    receipt.turnId === turnIdentity.turnId &&
    receipt.changeSetId === turnIdentity.changeSetId &&
    receipt.operationId === operationId &&
    receipt.sequence === sequence &&
    receipt.expectedRevision === turnIdentity.expectedRevision
  )
}

function architectureBatchMatchesExecution(
  data: Record<string, unknown>,
  turnIdentity: ChatTurnIdentity,
  startingSequence: number,
  operationCount: number,
): boolean {
  const rawReceipt = data.architectureReceipt
  if (!rawReceipt || typeof rawReceipt !== 'object' || Array.isArray(rawReceipt)) return false
  const receipt = rawReceipt as Record<string, unknown>
  if (
    receipt.changeSetId !== turnIdentity.changeSetId ||
    receipt.expectedRevision !== turnIdentity.expectedRevision
  ) {
    return false
  }

  const operations = receipt.operations
  if (!Array.isArray(operations) || operations.length !== operationCount) return false
  return operations.every((operation, index) => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return false
    const committed = operation as Record<string, unknown>
    return (
      committed.operationId === turnIdentity.operationIds[startingSequence + index] &&
      committed.sequence === index
    )
  })
}

/**
 * Adds deterministic execution identity around the existing compatibility
 * tools. A future atomic tool may return its own validated committed receipt;
 * successful direct-mutation tools are explicitly labelled legacy_direct.
 */
export function createToolExecutor(projectId: string, options: ToolExecutorOptions = {}) {
  const executeRawTool = createRawToolExecutor(projectId, options)
  let nextSequence = 0

  return async function executeTool(name: string, input: ToolInput): Promise<ToolResult> {
    const turnIdentity = options.turnIdentity
    if (!turnIdentity) return executeRawTool(name, input)

    const sequence = nextSequence
    const operationId = turnIdentity.operationIds[sequence]
    if (!operationId) {
      return fail(`Tool "${name}" exceeded the durable operation budget for this turn.`)
    }

    const result = await executeRawTool(name, input, { startingSequence: sequence })
    const claimedReceipt = result.data ? readChatToolReceipt(result.data) : null
    const claimedOperationCount = result.data?.consumedOperationCount
    const hasValidOperationCount =
      typeof claimedOperationCount === 'number' &&
      Number.isInteger(claimedOperationCount) &&
      claimedOperationCount > 0 &&
      sequence + claimedOperationCount <= turnIdentity.operationIds.length
    const hasValidCommittedReceipt =
      claimedReceipt !== null &&
      !result.isError &&
      receiptMatchesExecution(claimedReceipt, turnIdentity, operationId, sequence) &&
      (result.data?.architectureReceipt === undefined ||
        (hasValidOperationCount &&
          result.data !== undefined &&
          architectureBatchMatchesExecution(
            result.data,
            turnIdentity,
            sequence,
            claimedOperationCount,
          )))
    const receipt: ChatToolReceipt = hasValidCommittedReceipt
      ? claimedReceipt
      : {
          turnId: turnIdentity.turnId,
          changeSetId: turnIdentity.changeSetId,
          operationId,
          sequence,
          status: result.isError || claimedReceipt ? 'failed' : 'legacy_direct',
          expectedRevision: turnIdentity.expectedRevision,
        }
    const consumedOperationCount =
      hasValidCommittedReceipt && hasValidOperationCount ? claimedOperationCount : 1
    nextSequence = sequence + consumedOperationCount

    return {
      ...result,
      terminalText: hasValidCommittedReceipt ? result.terminalText : undefined,
      data: {
        ...(result.data ?? {}),
        [CHAT_TOOL_RECEIPT_KEY]: receipt,
      },
    }
  }
}
