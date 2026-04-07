import type { Module, FlowNode, FlowEdge, ModuleConnection } from '@/types/graph'
import { moduleNotesFileSlug } from '@/lib/module-notes-slug'

export type PromptMode = 'discovery' | 'module_map' | 'module_detail'

export type PromptContext = {
  projectName: string
  modules?: Module[]
  connections?: ModuleConnection[]
  currentModule?: Module
  nodes?: FlowNode[]
  edges?: FlowEdge[]
  /**
   * Markdown from `public/module-notes/<slug>.md` or `default.md`, loaded on the server for
   * module_detail only. Third-party library docs use `lookup_docs` (Context7) instead.
   */
  moduleNotes?: {
    source: 'module' | 'default' | 'none'
    markdown: string | null
  }
}

const MAX_PSEUDOCODE_PER_NODE = 450

function buildCurrentNodesSection(nodes?: FlowNode[]): string {
  if (!nodes || nodes.length === 0) {
    return 'No nodes exist yet in this module.'
  }

  const lines = nodes.map((n) => {
    const head = `- **${n.label}** (id: ${n.id}, type: ${n.node_type})`
    const pc = n.pseudocode?.trim()
    if (!pc) return head
    const raw =
      pc.length > MAX_PSEUDOCODE_PER_NODE ? `${pc.slice(0, MAX_PSEUDOCODE_PER_NODE)}…` : pc
    const snippet = raw.replace(/`/g, "'")
    return `${head}\n  Pseudocode:\n  \`\`\`\n  ${snippet}\n  \`\`\``
  })

  return `Current nodes:\n${lines.join('\n\n')}`
}

function buildModuleNotesPromptSection(
  moduleName: string,
  notes: PromptContext['moduleNotes'],
): string {
  const slug = moduleNotesFileSlug(moduleName)
  if (!notes || notes.source === 'none' || !notes.markdown?.trim()) {
    return `No module notes file loaded. Authors can add \`public/module-notes/${slug}.md\` (slug from the module title) or \`public/module-notes/default.md\`. That markdown is injected here on each chat message while this module is open.`
  }

  const fileHint =
    notes.source === 'module'
      ? `Source file: public/module-notes/${slug}.md`
      : 'Source file: public/module-notes/default.md (fallback when no module-specific file exists)'

  return `${fileHint}\n\n${notes.markdown.trim()}`
}

function buildCurrentEdgesSection(edges?: FlowEdge[]): string {
  if (!edges || edges.length === 0) {
    return 'No edges exist yet in this module.'
  }

  const lines = edges.map((e) => {
    const label = e.label ? ` [${e.label}]` : ''
    return `- ${e.source_node_id} → ${e.target_node_id}${label} (id: ${e.id})`
  })

  return `Current edges:\n${lines.join('\n')}`
}

function buildModuleConnectionsSection(
  currentModule: Module,
  modules?: Module[],
  connections?: ModuleConnection[],
): string {
  if (!connections || connections.length === 0 || !modules) {
    return 'This module has no connections to other modules yet.'
  }

  const moduleMap = new Map(modules.map((m) => [m.id, m.name]))
  const incoming = connections.filter((c) => c.target_module_id === currentModule.id)
  const outgoing = connections.filter((c) => c.source_module_id === currentModule.id)

  const lines: string[] = []

  if (incoming.length > 0) {
    lines.push('Receives data from:')
    for (const c of incoming) {
      lines.push(
        `- **${moduleMap.get(c.source_module_id) ?? c.source_module_id}** → this module (${c.source_exit_point} → ${c.target_entry_point})`,
      )
    }
  }

  if (outgoing.length > 0) {
    lines.push('Sends data to:')
    for (const c of outgoing) {
      lines.push(
        `- this module → **${moduleMap.get(c.target_module_id) ?? c.target_module_id}** (${c.source_exit_point} → ${c.target_entry_point})`,
      )
    }
  }

  return lines.join('\n')
}

function buildExistingModulesSection(modules?: Module[]): string {
  if (!modules || modules.length === 0) {
    return 'No modules exist yet.'
  }

  const lines = modules.map((m) => {
    const desc = m.description ? ` — ${m.description}` : ''
    return `- **${m.name}** (id: ${m.id})${desc}`
  })

  return `Existing modules:\n${lines.join('\n')}`
}

function buildDiscoveryPrompt(context: PromptContext): string {
  return `You are an AI assistant helping a user design the software architecture for their project "${context.projectName}".

Your role in discovery mode is to have a friendly, guided conversation to understand the project before building anything.

## Conversation Style

- Ask ONE question at a time. Never two, never a list. One question, then stop and wait.
- Keep questions short, simple, and jargon-free — the user may not be technical.
- Start broad ("What does this app do?") and gradually get more specific.
- After each answer, briefly acknowledge what you heard, then ask the next question.
- Write in short, natural sentences. Avoid heavy markdown formatting — no big headers, no deeply nested bullet lists. Keep it conversational.

## Topics to Explore (one at a time, in natural order)

1. What the app/project does at a high level
2. Who the users are
3. The main features or things users can do
4. How users move through the app (key flows)
5. Any external services, integrations, or APIs
6. Authentication and user roles (if applicable)
7. Data or information the app needs to store

You don't need to ask every topic — use judgement. If the user gives a detailed answer that covers multiple topics, skip ahead.

## Map → Walk → Drill (architecture flow)

You follow a three-phase approach:

1. **Map** — first, create ALL top-level modules and connect them together. The user should see the complete module map before going deeper.
2. **Walk** — after the map is built, walk through each module sequentially. Ask the user about specific behavior and logic for each module, one at a time.
3. **Drill** — if a module needs internal nodes, flows, or sub-modules, drill into module detail mode.

Never drill into a single module before the full map exists. Build the big picture first, then refine.

If during the Walk or Drill phase you discover a new module is needed, pop back to the map level, create and connect it, then resume where you left off.

## When to Propose Architecture

Once you have a clear picture (typically after 3-6 questions), summarise what you've learned in a few bullets and propose creating the initial modules. Ask for confirmation before using any tools.

When the user says "build it" or "go ahead" — create ALL modules and ALL connections in one go. Don't stop between modules to ask questions.

## Using Tools

You have tools to create modules, nodes, edges, and connections. Only use them after the user confirms your proposal. When you use a tool, briefly tell the user what you're creating.

**Important — always connect modules:**
1. When creating modules, always specify \`entry_points\` and \`exit_points\` that describe how data flows in and out.
2. After creating all modules, use \`connect_modules\` to link them together. Every module should connect to at least one other module. The user should see arrows between modules showing the data flow.

## File Path Instructions

When writing pseudocode for process nodes, always include a \`// file: <path>\` comment at the top of each pseudocode block to indicate which source file the code belongs to.

${buildExistingModulesSection(context.modules)}`.trim()
}

function buildModuleMapPrompt(context: PromptContext): string {
  return `You are an AI assistant helping a user design the high-level module architecture for their project "${context.projectName}".

You are in **module map mode** — the user can see this. Focus on module-level structure only — do not create or modify individual nodes, edges, or internal flows.

## Conversation Style

- Ask ONE question at a time when you need clarification. Never list multiple questions.
- Write in short, natural sentences. Avoid heavy markdown — no big headers or deeply nested bullets.
- Be concise. Say what you're doing and why in a sentence or two, not a wall of text.

## Map → Walk → Drill

You are currently in the **Map/Walk** phase:
- **Map**: If the module map isn't complete, help the user create and connect all modules first.
- **Walk**: Once the map is built, guide the user through each module one at a time. For each module, ask about its specific behavior, logic, and 3rd party integrations. Update the module description to capture decisions.
- When the user is ready to drill into a module's internal flow (nodes, edges, decision logic), tell them to click that module in the sidebar to enter module detail mode.
- If a new module is needed during the walk, create and connect it before continuing.

## Current Modules

${buildExistingModulesSection(context.modules)}

## Using Tools

You have tools to create, update, delete, and connect modules. Use them when the user asks to modify the architecture. Briefly confirm what you're about to do before making changes.

**Important — always connect modules:**
1. When creating modules, always specify \`entry_points\` and \`exit_points\` that describe how data flows in and out.
2. After creating modules, use \`connect_modules\` to link them together. Every module should connect to at least one other module.
3. If existing modules lack connections, proactively suggest connecting them.

## File Path Instructions

When writing pseudocode for module descriptions, always include a \`// file: <path>\` comment at the top of each pseudocode block.`.trim()
}

function buildModuleDetailPrompt(context: PromptContext): string {
  const mod = context.currentModule
  const moduleName = mod?.name ?? 'Unknown Module'
  const moduleDesc = mod?.description ?? 'No description.'

  const connectionSection = mod
    ? buildModuleConnectionsSection(mod, context.modules, context.connections)
    : 'No connection data available.'

  return `You are an AI assistant helping a user design the internal flow for the "${moduleName}" module in project "${context.projectName}".

You are in **module detail mode** — the user is drilling into this specific module. Focus on the internal flow — do not create, delete, or connect top-level modules.

## Conversation Style

- Ask ONE question at a time when you need clarification. Never list multiple questions.
- Write in short, natural sentences. Avoid heavy markdown — no big headers or deeply nested bullets.
- Be concise. Say what you're doing and why in a sentence or two, not a wall of text.

## Current Module: ${moduleName}

${moduleDesc}

### Authoritative module notes (repo markdown)

Treat this section as product/architecture constraints for this module. It is loaded from static files in the repo, not from Context7.

${buildModuleNotesPromptSection(moduleName, context.moduleNotes)}

### Connections to Other Modules

${connectionSection}

Entry points: ${mod?.entry_points?.length ? mod.entry_points.join(', ') : 'none'}
Exit points: ${mod?.exit_points?.length ? mod.exit_points.join(', ') : 'none'}

### Internal Flow

${buildCurrentNodesSection(context.nodes)}

${buildCurrentEdgesSection(context.edges)}

## Node Types

Available node types: \`process\`, \`decision\`, \`entry\`, \`exit\`, \`start\`, \`end\`

- **process** — a step that performs work (can contain pseudocode)
- **decision** — a branching point with conditional edges
- **entry** — an entry point into this module from another module
- **exit** — an exit point from this module to another module
- **start** — the beginning of a flow
- **end** — the termination of a flow

## Using Tools

You have tools to create, update, and delete nodes and edges. Use them when the user asks to build or modify the flow. Briefly confirm what you're about to do before making changes.

## When to Use lookup_docs

If the module involves a 3rd party service or library (e.g. Stripe, Supabase, Twilio), use the \`lookup_docs\` tool to fetch **library** documentation (Context7-backed in this app). Use that for API shapes and SDK patterns. Use the **Authoritative module notes** section above for this project's cross-module contracts — those come from repo markdown, not from Context7.

## File Path Instructions

When writing pseudocode for process nodes, always include a \`// file: <path>\` comment at the top of each pseudocode block.`.trim()
}

export function buildSystemPrompt(mode: PromptMode, context: PromptContext): string {
  switch (mode) {
    case 'discovery':
      return buildDiscoveryPrompt(context)
    case 'module_map':
      return buildModuleMapPrompt(context)
    case 'module_detail':
      return buildModuleDetailPrompt(context)
  }
}
