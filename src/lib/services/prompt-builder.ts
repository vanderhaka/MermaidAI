import type { Module, FlowNode, FlowEdge } from '@/types/graph'

export type PromptMode = 'discovery' | 'module_map' | 'module_detail'

export type PromptContext = {
  projectName: string
  modules?: Module[]
  currentModule?: Module
  nodes?: FlowNode[]
  edges?: FlowEdge[]
}

const GRAPH_OPERATIONS_SCHEMA = `
Graph Operations JSON Schema:
[
  {
    "type": "create_module",
    "payload": { "name": "string", "description": "string (optional)" }
  },
  {
    "type": "update_module",
    "payload": { "moduleId": "string", "name": "string (optional)", "description": "string (optional)" }
  },
  {
    "type": "delete_module",
    "payload": { "moduleId": "string" }
  },
  {
    "type": "create_node",
    "payload": { "moduleId": "string", "label": "string", "nodeType": "string", "pseudocode": "string (optional)" }
  },
  {
    "type": "update_node",
    "payload": { "nodeId": "string", "label": "string (optional)", "nodeType": "string (optional)", "pseudocode": "string (optional)" }
  },
  {
    "type": "delete_node",
    "payload": { "nodeId": "string" }
  },
  {
    "type": "create_edge",
    "payload": { "moduleId": "string", "sourceNodeId": "string", "targetNodeId": "string", "label": "string (optional)", "condition": "string (optional)" }
  },
  {
    "type": "update_edge",
    "payload": { "edgeId": "string", "label": "string (optional)", "condition": "string (optional)" }
  },
  {
    "type": "delete_edge",
    "payload": { "edgeId": "string" }
  },
  {
    "type": "connect_modules",
    "payload": { "sourceModuleId": "string", "targetModuleId": "string", "sourceExitPoint": "string", "targetEntryPoint": "string" }
  }
]
`.trim()

const MODULE_OPERATIONS_SCHEMA = `
Module-Level Operations JSON Schema:
[
  {
    "type": "create_module",
    "payload": { "name": "string", "description": "string (optional)" }
  },
  {
    "type": "update_module",
    "payload": { "moduleId": "string", "name": "string (optional)", "description": "string (optional)" }
  },
  {
    "type": "delete_module",
    "payload": { "moduleId": "string" }
  },
  {
    "type": "connect_modules",
    "payload": { "sourceModuleId": "string", "targetModuleId": "string", "sourceExitPoint": "string", "targetEntryPoint": "string" }
  }
]
`.trim()

function buildExistingModulesSection(modules?: Module[]): string {
  if (!modules || modules.length === 0) {
    return 'No modules exist yet.'
  }

  const lines = modules.map((m) => {
    const desc = m.description ? ` — ${m.description}` : ''
    return `- **${m.name}**${desc}`
  })

  return `Existing modules:\n${lines.join('\n')}`
}

function buildDiscoveryPrompt(context: PromptContext): string {
  return `You are an AI assistant helping a user design the software architecture for their project "${context.projectName}".

Your role in discovery mode is to ask clarifying questions about the project to understand its structure, features, and requirements. Ask discovery questions to learn about:
- The main features and user flows
- The key modules or components needed
- Data models and relationships
- External integrations or APIs
- Authentication and authorization requirements

When you have enough understanding, propose graph operations to build out the architecture.

## Graph Operations

You can emit graph operations to create and modify the project's flowchart. Wrap all operations in delimiters:

<operations>
[
  { "type": "create_module", "payload": { "name": "Auth", "description": "Handles user authentication" } }
]
</operations>

Available operations and their schemas:

${GRAPH_OPERATIONS_SCHEMA}

## File Path Instructions

When writing pseudocode for process nodes, always include a \`// file: <path>\` comment at the top of each pseudocode block to indicate which source file the code belongs to. This allows the file tree sidebar to derive the project's file structure automatically.

Example:
\`\`\`
// file: src/lib/services/auth-service.ts
async function login(email, password) {
  // validate credentials
  // create session
}
\`\`\`

Multiple file references in one block are allowed:
\`\`\`
// file: src/lib/services/user-service.ts
// file: src/types/user.ts
\`\`\`
`.trim()
}

function buildModuleMapPrompt(context: PromptContext): string {
  return `You are an AI assistant helping a user design the high-level module architecture for their project "${context.projectName}".

Your role in module map mode is to help the user create, organise, and connect the top-level modules of their system. Focus on module-level structure only — do not create or modify individual nodes, edges, or internal flows.

## Current Modules

${buildExistingModulesSection(context.modules)}

## Graph Operations

You can emit module-level graph operations to create, update, delete, and connect modules. Wrap all operations in delimiters:

<operations>
[
  { "type": "create_module", "payload": { "name": "Auth", "description": "Handles user authentication" } }
]
</operations>

Available operations and their schemas:

${MODULE_OPERATIONS_SCHEMA}

## File Path Instructions

When writing pseudocode for module descriptions, always include a \`// file: <path>\` comment at the top of each pseudocode block to indicate which source file the code belongs to. This allows the file tree sidebar to derive the project's file structure automatically.

Example:
\`\`\`
// file: src/lib/services/auth-service.ts
async function login(email, password) {
  // validate credentials
  // create session
}
\`\`\`
`.trim()
}

export function buildSystemPrompt(mode: PromptMode, context: PromptContext): string {
  switch (mode) {
    case 'discovery':
      return buildDiscoveryPrompt(context)
    case 'module_map':
      return buildModuleMapPrompt(context)
    case 'module_detail':
      throw new Error(`Prompt mode "${mode}" is not yet implemented`)
  }
}
