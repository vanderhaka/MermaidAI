# TDD Plan: MermaidAI MVP

## Overview

MermaidAI is a chat-first AI flowchart builder for decision systems. Users describe what they want in natural language; the AI generates hierarchical module maps with detailed flows, pseudocode nodes, and an auto-generated file tree sidebar. Built with Next.js 14+ (App Router), React Flow, Supabase, and TypeScript.

This plan decomposes the MVP into **74 issues** across **6 dependency waves**. Each issue is a vertical slice scoped to one testable behavior with max 3 files and ~50 lines of implementation.

**Deduplication notes:**
- Supabase client factories: consolidated into scaffold domain (removed auth domain duplicates)
- Chat types: merged scaffold's ChatMessage with chat domain's GraphOperation union into a single chat types issue
- FileTreeNode type + derivation: consolidated into file tree domain (removed scaffold and data layer duplicates)
- Chat persistence: kept data layer's service, removed chat domain's duplicate

**Grill review changes (2026-04-06):**
- Added: database migrations, dashboard page, chat input, ModuleDetailView, graph store (5 issues)
- Modified: prompt builder (file path instructions), LLM client (default Sonnet, configurable), executor (no rollback), chat action (streaming), message list (streaming)

## Issue Count
74 issues across 6 dependency waves

## Dependency Graph

```
Wave 1 — Scaffold & Types (18 issues)
  Types, schemas, env config, Supabase clients, database types
  Database migrations (all 7 tables with FKs, RLS, triggers)
  All parallel within wave (respecting internal sub-dependencies)

Wave 2 — Auth + Data Layer foundations (15 issues)
  Auth actions, middleware, profile service
  Project CRUD, module CRUD services

Wave 3 — Data Layer completion + Canvas foundations + Auth UI (21 issues)
  Graph service (nodes/edges), module connections, chat messages
  Auth forms (signup, login, logout), dashboard page
  Canvas base, all custom node types, layout, edges, colors

Wave 4 — AI/Chat core (9 issues)
  Prompt builder (3 modes with file path instructions), LLM response parser, LLM client (Sonnet default)
  Graph operation executor (modules, nodes/edges, partial reporting)
  Graph store (Zustand)

Wave 5 — Integration + UI (5 issues)
  Chat server action (streaming), chat message list (streaming), chat input
  File tree derivation + component

Wave 6 — Composition (6 issues)
  Canvas container (drill-down navigation), ModuleDetailView
  Module map view with real data
  File tree sidebar (hook + composed component)
```

---

## Wave 1: Scaffold & Types (18 issues)

### Issue 1: Environment config validates required env vars at startup

**Context**: Every service needs validated environment variables. If any are missing, the app should fail fast with a clear error.

**Behavior to test**: "When the env config module is imported, then it returns a typed config object if all required vars are present, or throws a descriptive ZodError if any are missing."

**Acceptance criteria**:
- [ ] Zod schema validates `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`
- [ ] Exported `config` object is fully typed — no `process.env` scattered elsewhere
- [ ] Missing var throws ZodError with the var name in the message
- [ ] Empty string is rejected (not just undefined)

**Test sketch**:
```typescript
describe('env config', () => {
  it('returns typed config when all vars present', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJ...')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJ...')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    const { createConfig } = await import('@/lib/config')
    const config = createConfig()
    expect(config.supabaseUrl).toBe('https://abc.supabase.co')
  })

  it('throws ZodError when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJ...')
    const { createConfig } = await import('@/lib/config')
    expect(() => createConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('rejects empty string values', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    const { createConfig } = await import('@/lib/config')
    expect(() => createConfig()).toThrow()
  })
})
```

**Files**:
- CREATE: `src/lib/config.ts` — Zod schema + createConfig factory + exported config singleton

**Dependencies**:
- Blocked by: none
- Blocks: Issues 15, 16, 17

**Type**: feature

---

### Issue 2: Database types placeholder exports typed table definitions

**Context**: Supabase generates TypeScript types from the database schema. This placeholder ensures all Supabase client factories can be typed from day one.

**Behavior to test**: "When Database type is imported, then it provides typed table definitions for projects, modules, flow_nodes, flow_edges, module_connections, chat_messages, and profiles."

**Acceptance criteria**:
- [ ] `Database` type exported with `public.Tables` containing all 7 tables
- [ ] Each table has `Row`, `Insert`, `Update` subtypes
- [ ] File has comment indicating it will be replaced by `supabase gen types`

**Test sketch**:
```typescript
describe('Database types', () => {
  it('has projects table with Row/Insert/Update', () => {
    expectTypeOf<Tables>().toHaveProperty('projects')
    expectTypeOf<Tables['projects']>().toHaveProperty('Row')
    expectTypeOf<Tables['projects']>().toHaveProperty('Insert')
  })

  it('has all required tables', () => {
    expectTypeOf<Tables>().toHaveProperty('modules')
    expectTypeOf<Tables>().toHaveProperty('flow_nodes')
    expectTypeOf<Tables>().toHaveProperty('flow_edges')
    expectTypeOf<Tables>().toHaveProperty('module_connections')
    expectTypeOf<Tables>().toHaveProperty('chat_messages')
    expectTypeOf<Tables>().toHaveProperty('profiles')
  })
})
```

**Files**:
- CREATE: `src/types/database.ts` — placeholder Database type

**Dependencies**:
- Blocked by: none
- Blocks: Issues 15, 16, 17

**Type**: feature

---

### Issue 3: Project type defines a user-owned container

**Context**: A `Project` is the top-level entity holding all modules, nodes, and edges. Imported by nearly every other domain.

**Behavior to test**: "When a Project object is constructed, then it satisfies the Project type with all required fields."

**Acceptance criteria**:
- [ ] `Project` type has `id`, `user_id`, `name`, `description` (nullable), `created_at`, `updated_at`
- [ ] `CreateProjectInput` omits server-generated fields (id, created_at, updated_at, user_id)

**Test sketch**:
```typescript
describe('Project type', () => {
  it('has all required fields', () => {
    expectTypeOf<Project>().toHaveProperty('id')
    expectTypeOf<Project>().toHaveProperty('user_id')
    expectTypeOf<Project>().toHaveProperty('name')
    expectTypeOf<Project>().toHaveProperty('description')
  })

  it('CreateProjectInput omits server-generated fields', () => {
    expectTypeOf<CreateProjectInput>().toHaveProperty('name')
    expectTypeOf<CreateProjectInput>().not.toHaveProperty('id')
    expectTypeOf<CreateProjectInput>().not.toHaveProperty('user_id')
  })
})
```

**Files**:
- CREATE: `src/types/graph.ts` — Project, CreateProjectInput types

**Dependencies**:
- Blocked by: none
- Blocks: Issues 4, 5, 6, 7, 8, 9, 10

**Type**: feature

---

### Issue 4: Module type with entry/exit points and position

**Context**: A `Module` is a sub-graph within a project with position on the module map and entry/exit point definitions for puzzle-piece connections.

**Behavior to test**: "When a Module object is constructed, then it has project_id, name, position, entry_points, exit_points, and color."

**Acceptance criteria**:
- [ ] `Module` has `id`, `project_id`, `name`, `description` (nullable), `position` (`{ x, y }`), `color`, `entry_points` (string[]), `exit_points` (string[]), `created_at`, `updated_at`
- [ ] `Position` type is reusable (shared with FlowNode)
- [ ] `CreateModuleInput` omits server-generated fields

**Test sketch**:
```typescript
describe('Module type', () => {
  it('has position as {x, y}', () => {
    expectTypeOf<Module['position']>().toEqualTypeOf<Position>()
  })
  it('has entry and exit points as string arrays', () => {
    expectTypeOf<Module['entry_points']>().toEqualTypeOf<string[]>()
  })
})
```

**Files**:
- MODIFY: `src/types/graph.ts` — add Module, CreateModuleInput, Position

**Dependencies**:
- Blocked by: Issue 3
- Blocks: Issues 5, 6, 7, 10, 11

**Type**: feature

---

### Issue 5: FlowNode type with discriminated node types and pseudocode

**Context**: A `FlowNode` is a node within a module's flowchart. Node types (decision, process, entry, exit, start, end) drive visual rendering. Each node carries pseudocode.

**Behavior to test**: "When a FlowNode is constructed, then it has a discriminated node_type, label, pseudocode, position, and color."

**Acceptance criteria**:
- [ ] `FlowNodeType` is `'decision' | 'process' | 'entry' | 'exit' | 'start' | 'end'`
- [ ] `FlowNode` has `id`, `module_id`, `node_type`, `label`, `pseudocode`, `position`, `color`, `created_at`, `updated_at`
- [ ] `CreateFlowNodeInput` requires `module_id`, `node_type`, `label`

**Test sketch**:
```typescript
describe('FlowNode type', () => {
  it('node_type is constrained union', () => {
    expectTypeOf<FlowNodeType>().toEqualTypeOf<'decision' | 'process' | 'entry' | 'exit' | 'start' | 'end'>()
  })
  it('has pseudocode field', () => {
    expectTypeOf<FlowNode>().toHaveProperty('pseudocode')
  })
})
```

**Files**:
- MODIFY: `src/types/graph.ts` — add FlowNode, FlowNodeType, CreateFlowNodeInput

**Dependencies**:
- Blocked by: Issue 4
- Blocks: Issues 6, 7, 12

**Type**: feature

---

### Issue 6: FlowEdge type for labeled connections

**Context**: A `FlowEdge` connects two FlowNodes within the same module with optional label and condition text.

**Behavior to test**: "When a FlowEdge is constructed, then it has source_node_id, target_node_id, label, and condition."

**Acceptance criteria**:
- [ ] `FlowEdge` has `id`, `module_id`, `source_node_id`, `target_node_id`, `label` (nullable), `condition` (nullable), `created_at`
- [ ] `CreateFlowEdgeInput` requires module_id and node IDs

**Test sketch**:
```typescript
describe('FlowEdge type', () => {
  it('has source and target references', () => {
    expectTypeOf<FlowEdge>().toHaveProperty('source_node_id')
    expectTypeOf<FlowEdge>().toHaveProperty('target_node_id')
  })
  it('has optional label and condition', () => {
    expectTypeOf<FlowEdge['label']>().toEqualTypeOf<string | null>()
  })
})
```

**Files**:
- MODIFY: `src/types/graph.ts` — add FlowEdge, CreateFlowEdgeInput

**Dependencies**:
- Blocked by: Issue 5
- Blocks: Issues 13, 14

**Type**: feature

---

### Issue 7: ModuleConnection type for puzzle-piece connectors

**Context**: Modules connect via exit/entry points on the module map — the "puzzle piece" metaphor.

**Behavior to test**: "When a ModuleConnection is constructed, then it references two modules and specifies which exit/entry points are linked."

**Acceptance criteria**:
- [ ] `ModuleConnection` has `id`, `project_id`, `source_module_id`, `target_module_id`, `source_exit_point`, `target_entry_point`, `created_at`
- [ ] `CreateModuleConnectionInput` omits server-generated fields

**Test sketch**:
```typescript
describe('ModuleConnection type', () => {
  it('links two modules by ID', () => {
    expectTypeOf<ModuleConnection>().toHaveProperty('source_module_id')
    expectTypeOf<ModuleConnection>().toHaveProperty('target_module_id')
  })
  it('specifies exit and entry point labels', () => {
    expectTypeOf<ModuleConnection['source_exit_point']>().toBeString()
  })
})
```

**Files**:
- MODIFY: `src/types/graph.ts` — add ModuleConnection, CreateModuleConnectionInput

**Dependencies**:
- Blocked by: Issue 4
- Blocks: Issue 14

**Type**: feature

---

### Issue 8: Chat types — messages, operations, and context

**Context**: The chat system needs typed messages with embedded graph operations. This defines the vocabulary for the entire AI/chat domain including the discriminated union of 10 graph operation types.

**Behavior to test**: "When a ChatMessage is constructed, then it has role, content, operations, and timestamp. GraphOperation is a discriminated union covering all operation types."

**Acceptance criteria**:
- [ ] `ChatMessage` has `id`, `role` (`'user' | 'assistant' | 'system'`), `content`, `operations` (GraphOperation[]), `createdAt`
- [ ] `GraphOperation` is a discriminated union: `create_module`, `update_module`, `delete_module`, `create_node`, `update_node`, `delete_node`, `create_edge`, `update_edge`, `delete_edge`, `connect_modules`
- [ ] `ChatContext` has `projectId`, `projectName`, `activeModuleId | null`, `mode: 'discovery' | 'module_map' | 'module_detail'`, `modules`
- [ ] `CreateChatMessageInput` requires `project_id`, `role`, `content`

**Test sketch**:
```typescript
describe('Chat types', () => {
  it('GraphOperation is a discriminated union', () => {
    const op: GraphOperation = { type: 'create_module', payload: { name: 'Auth' } }
    expectTypeOf(op.type).toEqualTypeOf<GraphOperation['type']>()
  })
  it('ChatContext captures navigation mode', () => {
    expectTypeOf<ChatContext['mode']>().toEqualTypeOf<'discovery' | 'module_map' | 'module_detail'>()
  })
})
```

**Files**:
- CREATE: `src/types/chat.ts` — ChatMessage, GraphOperation, ChatContext, CreateChatMessageInput

**Dependencies**:
- Blocked by: Issue 3
- Blocks: Wave 4 (all AI/chat issues)

**Type**: feature

---

### Issue 9: Zod schema validates CreateProjectInput

**Context**: All user input must be validated with Zod before hitting the database.

**Behavior to test**: "When CreateProjectInput is validated, then valid input passes and invalid input returns specific errors."

**Acceptance criteria**:
- [ ] `createProjectSchema` validates `name` (1-100 chars, trimmed), `description` (optional, nullable)
- [ ] Empty name returns error on `name` path
- [ ] Extra fields are stripped

**Test sketch**:
```typescript
describe('createProjectSchema', () => {
  it('accepts valid input', () => {
    expect(createProjectSchema.safeParse({ name: 'My Project' }).success).toBe(true)
  })
  it('rejects empty name', () => {
    expect(createProjectSchema.safeParse({ name: '' }).success).toBe(false)
  })
  it('trims whitespace', () => {
    expect(createProjectSchema.safeParse({ name: '  Test  ' }).data?.name).toBe('Test')
  })
})
```

**Files**:
- CREATE: `src/lib/schemas/project.ts` — createProjectSchema

**Dependencies**:
- Blocked by: Issue 3
- Blocks: Wave 2 (project CRUD)

**Type**: feature

---

### Issue 10: Zod schema validates CreateModuleInput

**Context**: Module creation requires project_id, name, position, color, and entry/exit point labels.

**Behavior to test**: "When CreateModuleInput is validated, then valid input passes and invalid input is rejected."

**Acceptance criteria**:
- [ ] Validates `project_id` (uuid), `name` (1-100), `position` ({x, y}), `color`, `entry_points` (string[]), `exit_points` (string[])
- [ ] Entry/exit points default to empty arrays
- [ ] Invalid UUID for project_id is rejected

**Test sketch**:
```typescript
describe('createModuleSchema', () => {
  it('accepts valid input', () => {
    expect(createModuleSchema.safeParse({ project_id: uuid, name: 'Auth', position: { x: 0, y: 0 }, color: '#4A90D9' }).success).toBe(true)
  })
  it('defaults entry_points to empty array', () => {
    expect(result.data?.entry_points).toEqual([])
  })
})
```

**Files**:
- CREATE: `src/lib/schemas/module.ts` — createModuleSchema

**Dependencies**:
- Blocked by: Issue 4
- Blocks: Wave 2 (module CRUD)

**Type**: feature

---

### Issue 11: Zod schema validates CreateFlowNodeInput

**Context**: Node creation validates node_type against the 6-type union, pseudocode as string, and position.

**Behavior to test**: "When CreateFlowNodeInput is validated, then invalid node_type values are rejected and pseudocode defaults to empty string."

**Acceptance criteria**:
- [ ] Validates `module_id` (uuid), `node_type` (enum), `label` (1-200), `pseudocode` (default ''), `position`, `color`
- [ ] Invalid node_type is rejected
- [ ] All 6 valid types are accepted

**Test sketch**:
```typescript
describe('createFlowNodeSchema', () => {
  it('rejects invalid node_type', () => {
    expect(createFlowNodeSchema.safeParse({ ...valid, node_type: 'invalid' }).success).toBe(false)
  })
  it('defaults pseudocode to empty string', () => {
    expect(result.data?.pseudocode).toBe('')
  })
})
```

**Files**:
- CREATE: `src/lib/schemas/flow-node.ts` — createFlowNodeSchema

**Dependencies**:
- Blocked by: Issue 5
- Blocks: Wave 3 (node CRUD)

**Type**: feature

---

### Issue 12: Zod schema validates CreateFlowEdgeInput

**Context**: Edge creation links two nodes with optional label/condition.

**Behavior to test**: "When CreateFlowEdgeInput is validated, then invalid UUIDs are rejected and label/condition are optional."

**Acceptance criteria**:
- [ ] Validates `module_id`, `source_node_id`, `target_node_id` (uuid), `label` (optional), `condition` (optional)
- [ ] Non-UUID IDs are rejected

**Test sketch**:
```typescript
describe('createFlowEdgeSchema', () => {
  it('accepts valid input', () => { expect(result.success).toBe(true) })
  it('rejects non-UUID source_node_id', () => { expect(result.success).toBe(false) })
})
```

**Files**:
- CREATE: `src/lib/schemas/flow-edge.ts` — createFlowEdgeSchema

**Dependencies**:
- Blocked by: Issue 6
- Blocks: Wave 3 (edge CRUD)

**Type**: feature

---

### Issue 13: Zod schema validates CreateModuleConnectionInput with self-connection guard

**Context**: Module connections must link two different modules. Self-referencing is rejected via `.refine()`.

**Behavior to test**: "When CreateModuleConnectionInput is validated, then same source/target module is rejected."

**Acceptance criteria**:
- [ ] Validates `project_id`, `source_module_id`, `target_module_id` (uuid), `source_exit_point`, `target_entry_point` (non-empty)
- [ ] `.refine()` rejects when source === target

**Test sketch**:
```typescript
describe('createModuleConnectionSchema', () => {
  it('rejects self-referencing connection', () => {
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toMatch(/different/i)
  })
})
```

**Files**:
- CREATE: `src/lib/schemas/module-connection.ts` — createModuleConnectionSchema

**Dependencies**:
- Blocked by: Issue 7
- Blocks: Wave 3 (module connection CRUD)

**Type**: feature

---

### Issue 14: FileTreeNode type and file path extraction pattern

**Context**: The file tree is derived from FlowNode pseudocode. Needs the `FileTreeNode` type and `FILE_PATH_PATTERN` regex for extracting `// file: <path>` from pseudocode.

**Behavior to test**: "When the FileTreeNode type is defined, then it supports name, path, type, recursive children, and linkedNodeIds. FILE_PATH_PATTERN extracts file paths from pseudocode."

**Acceptance criteria**:
- [ ] `FileTreeNode` type has `name`, `path`, `type` ('file' | 'folder'), optional `children`, optional `linkedNodeIds`
- [ ] `FILE_PATH_PATTERN` regex extracts `// file: src/lib/auth.ts` from pseudocode
- [ ] Pattern handles multiple file references in one pseudocode block

**Test sketch**:
```typescript
describe('FileTreeNode type contract', () => {
  it('matches file path comments in pseudocode', () => {
    const matches = pseudocode.match(FILE_PATH_PATTERN)
    expect(matches![1]).toBe('src/lib/auth.ts')
  })
  it('extracts multiple file paths', () => {
    const all = [...pseudocode.matchAll(new RegExp(FILE_PATH_PATTERN, 'g'))]
    expect(all).toHaveLength(2)
  })
})
```

**Files**:
- CREATE: `src/types/file-tree.ts` — FileTreeNode type
- CREATE: `src/lib/services/file-tree.ts` — FILE_PATH_PATTERN constant, stub

**Dependencies**:
- Blocked by: Issue 5 (FlowNode must exist)
- Blocks: Wave 5 (file tree derivation)

**Type**: feature

---

### Issue 15: Supabase server client factory

**Context**: Server Components, Server Actions, and Route Handlers need a typed Supabase client with cookie-based auth.

**Behavior to test**: "When createClient is called in server context, then it returns a typed SupabaseClient configured with cookie handlers."

**Acceptance criteria**:
- [ ] Returns `SupabaseClient<Database>` using `createServerClient` from `@supabase/ssr`
- [ ] Cookie handlers delegate to `next/headers` `cookies()`
- [ ] Imports `server-only` to prevent client bundle inclusion

**Test sketch**:
```typescript
describe('createClient (server)', () => {
  it('calls createServerClient with env vars and cookie handlers', async () => {
    const client = await createClient()
    expect(createServerClient).toHaveBeenCalledWith(url, key, expect.objectContaining({ cookies: expect.any(Object) }))
  })
})
```

**Files**:
- CREATE: `src/lib/supabase/server.ts` — server client factory [boundary: Supabase SDK]

**Dependencies**:
- Blocked by: Issues 1, 2
- Blocks: Wave 2 (all server-side data access)

**Type**: feature

---

### Issue 16: Supabase browser client factory (singleton)

**Context**: Client Components need a singleton browser-side Supabase client.

**Behavior to test**: "When createClient is called multiple times in browser context, then it returns the same client instance."

**Acceptance criteria**:
- [ ] Returns `SupabaseClient<Database>` using `createBrowserClient` from `@supabase/ssr`
- [ ] Multiple calls return same instance (singleton)

**Test sketch**:
```typescript
describe('createClient (browser)', () => {
  it('returns the same instance on multiple calls', () => {
    expect(createClient()).toBe(createClient())
  })
})
```

**Files**:
- CREATE: `src/lib/supabase/client.ts` — browser client factory [boundary: Supabase SDK]

**Dependencies**:
- Blocked by: Issues 1, 2
- Blocks: Wave 5 (auth UI forms)

**Type**: feature

---

### Issue 17: Supabase middleware client for session refresh

**Context**: Next.js middleware refreshes auth sessions on every request. The middleware client reads from request and writes to both request and response.

**Behavior to test**: "When createSupabaseMiddlewareClient is called with request, then it returns a client with dual cookie handlers."

**Acceptance criteria**:
- [ ] Returns `{ supabase, response }` where supabase is a typed client
- [ ] Cookie `set`/`remove` writes to both request and response

**Test sketch**:
```typescript
describe('createSupabaseMiddlewareClient', () => {
  it('returns supabase client and response', async () => {
    const { supabase, response } = createSupabaseMiddlewareClient(request)
    expect(supabase).toBeDefined()
    expect(response).toBeInstanceOf(NextResponse)
  })
})
```

**Files**:
- CREATE: `src/lib/supabase/middleware.ts` — middleware client factory [boundary: Supabase SDK]

**Dependencies**:
- Blocked by: Issues 1, 2
- Blocks: Wave 2 (auth middleware)

**Type**: feature

---

### Issue 18: Database migrations — all core tables with FKs, RLS, and triggers

**Context**: Every data layer service depends on the database tables existing. This migration creates all 7 core tables in one step so the entire data layer can build on a solid foundation.

**Behavior to test**: "When the migrations run, then all 7 tables exist with correct columns, foreign keys, RLS policies, and the profile creation trigger."

**Acceptance criteria**:
- [ ] `projects` table: `id` (uuid PK), `user_id` (FK auth.users), `name`, `description`, `created_at`, `updated_at`. RLS: users see only their own.
- [ ] `modules` table: `id`, `project_id` (FK projects ON DELETE CASCADE), `name`, `description`, `position_x`, `position_y`, `color`, `entry_points` (jsonb), `exit_points` (jsonb), `created_at`, `updated_at`. RLS via project ownership.
- [ ] `flow_nodes` table: `id`, `module_id` (FK modules ON DELETE CASCADE), `node_type`, `label`, `pseudocode`, `position_x`, `position_y`, `color`, `created_at`, `updated_at`. RLS via module → project ownership.
- [ ] `flow_edges` table: `id`, `module_id` (FK modules ON DELETE CASCADE), `source_node_id` (FK flow_nodes ON DELETE CASCADE), `target_node_id` (FK flow_nodes ON DELETE CASCADE), `label`, `condition`, `created_at`. RLS via module → project ownership.
- [ ] `module_connections` table: `id`, `project_id` (FK projects ON DELETE CASCADE), `source_module_id` (FK modules), `target_module_id` (FK modules), `source_exit_point`, `target_entry_point`, `created_at`. RLS via project ownership.
- [ ] `chat_messages` table: `id`, `project_id` (FK projects ON DELETE CASCADE), `role`, `content`, `metadata` (jsonb), `created_at`. RLS via project ownership.
- [ ] `profiles` table: `id` (FK auth.users ON DELETE CASCADE), `display_name`, `avatar_url`, `created_at`, `updated_at`. Trigger: `handle_new_user` auto-creates profile on auth.users INSERT. RLS: users see only their own.

**Test sketch**:
```typescript
// Migration tests run against local Supabase
describe('database migrations', () => {
  it('creates all required tables', async () => {
    const { data } = await supabase.rpc('get_table_names')
    expect(data).toContain('projects')
    expect(data).toContain('modules')
    expect(data).toContain('flow_nodes')
    expect(data).toContain('flow_edges')
    expect(data).toContain('module_connections')
    expect(data).toContain('chat_messages')
    expect(data).toContain('profiles')
  })
})
```

**Files**:
- CREATE: `supabase/migrations/20260406000000_create_core_tables.sql` — all tables, FKs, RLS, triggers [boundary: DB]

**Dependencies**:
- Blocked by: none
- Blocks: All Wave 2 data layer issues (23-32), Issue 21 (profile service)

**Type**: feature

---

## Wave 2: Auth + Data Layer Foundations (15 issues)

### Issue 18: Signup server action validates and creates account

**Behavior to test**: "When a user submits valid email and password, then signUp creates an account via Supabase Auth and returns `{ success: true }`."

**Acceptance criteria**:
- [ ] Validates email format and password min 8 chars with Zod
- [ ] Returns `{ success: false, error }` for invalid input without calling Supabase
- [ ] Returns `{ success: true }` on successful signup
- [ ] Returns `{ success: false, error }` when Supabase returns error

**Files**:
- CREATE: `src/lib/services/auth-service.ts` — auth server actions [boundary: Supabase Auth]
- CREATE: `src/types/auth.ts` — Zod schemas and return types

**Dependencies**: Blocked by: Issue 15 | Blocks: Issues 19, 21, 33
**Type**: feature

---

### Issue 19: Login server action authenticates user

**Behavior to test**: "When a user submits valid credentials, then signIn authenticates via Supabase Auth."

**Acceptance criteria**:
- [ ] Validates with Zod, calls `supabase.auth.signInWithPassword()`
- [ ] Returns `{ success: true }` on valid login
- [ ] Returns `{ success: false, error }` on wrong credentials

**Files**: MODIFY: `src/lib/services/auth-service.ts` [boundary: Supabase Auth]

**Dependencies**: Blocked by: Issues 15, 18 | Blocks: Issue 34
**Type**: feature

---

### Issue 20: Logout server action clears session

**Behavior to test**: "When signOut is called, then the session is cleared and user is redirected to /login."

**Acceptance criteria**:
- [ ] Calls `supabase.auth.signOut()`
- [ ] Calls `revalidatePath` and `redirect('/login')`

**Files**: MODIFY: `src/lib/services/auth-service.ts` [boundary: Supabase Auth]

**Dependencies**: Blocked by: Issue 15 | Blocks: Issue 35
**Type**: feature

---

### Issue 21: Profile creation on signup with database trigger

**Behavior to test**: "When getOrCreateProfile is called, then it returns existing profile or creates a new one."

**Acceptance criteria**:
- [ ] SQL migration creates `profiles` table with FK to `auth.users.id`, trigger, and RLS
- [ ] `getOrCreateProfile(userId)` returns or creates profile
- [ ] Returns `{ success: false, error }` on DB failure

**Files**:
- CREATE: `supabase/migrations/YYYYMMDD_create_profiles.sql` [boundary: DB]
- CREATE: `src/lib/services/profile-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issues 15, 18 | Blocks: Issue 33
**Type**: feature

---

### Issue 22: Auth middleware protects routes and refreshes sessions

**Behavior to test**: "When an unauthenticated user requests /dashboard, then middleware redirects to /login. Authenticated users on /login redirect to /dashboard."

**Acceptance criteria**:
- [ ] Uses `supabase.auth.getUser()` (not `getSession()`)
- [ ] Protected routes: `/dashboard/**` redirect to `/login`
- [ ] Auth routes: `/login`, `/signup` redirect authenticated users to `/dashboard`
- [ ] Public routes: `/` accessible without auth
- [ ] Matcher excludes static assets, `_next`, favicon

**Files**: CREATE: `src/middleware.ts` [boundary: Supabase Auth]

**Dependencies**: Blocked by: Issue 17 | Blocks: Issues 33, 34
**Type**: feature

---

### Issue 23: createProject service inserts and returns a project

**Behavior to test**: "When a project is created with valid name, then service returns `{ success: true, data: project }`."

**Acceptance criteria**:
- [ ] Returns inserted project with `id`, `name`, `description`, `created_at`
- [ ] Returns error when Supabase insert fails
- [ ] Handles optional description

**Files**:
- CREATE: `src/lib/services/project-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issues 9, 15 | Blocks: Issues 24-27
**Type**: feature

---

### Issue 24: listProjectsByUser returns projects ordered by date

**Behavior to test**: "When projects are listed, then they return ordered by created_at desc."

**Acceptance criteria**:
- [ ] Returns projects ordered descending
- [ ] Returns empty array when user has none
- [ ] Selects only needed columns

**Files**: MODIFY: `src/lib/services/project-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 23
**Type**: feature

---

### Issue 25: getProjectById returns a single project

**Behavior to test**: "When a project is fetched by valid ID, then it returns the project. When not found, returns error."

**Files**: MODIFY: `src/lib/services/project-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 23
**Type**: feature

---

### Issue 26: updateProject modifies name and/or description

**Behavior to test**: "When a project is updated with valid fields, then it returns the updated project."

**Acceptance criteria**:
- [ ] Partial updates only
- [ ] Does not allow updating id, user_id, or created_at

**Files**: MODIFY: `src/lib/services/project-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 23
**Type**: feature

---

### Issue 27: deleteProject removes a project by ID

**Behavior to test**: "When a project is deleted, then it returns `{ success: true }`."

**Files**: MODIFY: `src/lib/services/project-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 23
**Type**: feature

---

### Issue 28: createModule inserts a module within a project

**Behavior to test**: "When a module is created with valid project ID, then it returns the inserted module."

**Files**:
- CREATE: `src/lib/services/module-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issues 10, 15 | Blocks: Issues 29-32
**Type**: feature

---

### Issue 29: listModulesByProject returns modules for a project

**Behavior to test**: "When modules are listed for a project, then they return filtered by project_id."

**Files**: MODIFY: `src/lib/services/module-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 28
**Type**: feature

---

### Issue 30: getModuleById returns a single module

**Behavior to test**: "When fetching a module by valid ID, then it returns the module."

**Files**: MODIFY: `src/lib/services/module-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 28
**Type**: feature

---

### Issue 31: updateModule modifies module fields

**Behavior to test**: "When a module is updated with new position or name, then it returns the updated module."

**Files**: MODIFY: `src/lib/services/module-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 28
**Type**: feature

---

### Issue 32: deleteModule removes a module by ID

**Behavior to test**: "When a module is deleted, then it returns `{ success: true }`."

**Files**: MODIFY: `src/lib/services/module-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 28
**Type**: feature

---

## Wave 3: Data Layer Completion + Canvas Foundations + Auth UI (22 issues)

### Issue 33: Signup form component

**Behavior to test**: "When a user fills out the signup form and submits, then the signUp action is called and feedback is displayed."

**Acceptance criteria**:
- [ ] Renders email and password fields with labels
- [ ] Shows client-side validation errors
- [ ] Disables submit and shows loading during pending
- [ ] Displays server action error/success messages
- [ ] Link to `/login` for existing users
- [ ] Keyboard accessible with proper ARIA

**Files**:
- CREATE: `src/components/auth/signup-form.tsx`
- CREATE: `src/app/(auth)/signup/page.tsx`

**Dependencies**: Blocked by: Issues 16, 18, 21, 22
**Type**: feature

---

### Issue 34: Login form component

**Behavior to test**: "When a user submits the login form, then signIn is called and feedback is displayed."

**Files**:
- CREATE: `src/components/auth/login-form.tsx`
- CREATE: `src/app/(auth)/login/page.tsx`

**Dependencies**: Blocked by: Issues 16, 19, 22
**Type**: feature

---

### Issue 35: Logout button component

**Behavior to test**: "When an authenticated user clicks logout, then signOut is called."

**Files**: CREATE: `src/components/auth/logout-button.tsx`

**Dependencies**: Blocked by: Issues 16, 20
**Type**: feature

---

### Issue 36: Dashboard page lists projects with "New Project" button

**Context**: After login, users need a home screen showing their projects. This is the landing page for authenticated users — it lists all projects and provides a way to create new ones and navigate into them.

**Behavior to test**: "When an authenticated user visits /dashboard, then they see their projects listed with a 'New Project' button. Clicking a project navigates to the workspace. Clicking 'New Project' creates a project and navigates to it."

**Acceptance criteria**:
- [ ] Renders a list of the user's projects (name, description, created date)
- [ ] Shows empty state with prompt to create first project when none exist
- [ ] "New Project" button calls createProject and navigates to `/dashboard/[projectId]`
- [ ] Clicking a project card navigates to `/dashboard/[projectId]`
- [ ] Shows loading state while projects are being fetched
- [ ] Uses the logout button component

**Files**:
- CREATE: `src/app/(dashboard)/dashboard/page.tsx` — dashboard page (Server Component fetches projects)
- CREATE: `src/components/dashboard/project-list.tsx` — project list + new project button (client component)

**Dependencies**: Blocked by: Issues 22, 23, 24, 35
**Type**: feature

---

### Issue 37: getGraphForModule returns nodes and edges

**Behavior to test**: "When the graph is fetched for a module, then it returns `{ nodes, edges }`."

**Acceptance criteria**:
- [ ] Returns both arrays (possibly empty)
- [ ] Returns error if either query fails

**Files**:
- CREATE: `src/lib/services/graph-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issues 11, 15 | Blocks: Issues 37-42
**Type**: feature

---

### Issue 37: addNode inserts a flow node

**Behavior to test**: "When a node is added to a module, then it returns the inserted node."

**Files**: MODIFY: `src/lib/services/graph-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 36
**Type**: feature

---

### Issue 38: updateNode modifies a flow node

**Behavior to test**: "When a node is updated, then it returns the updated node."

**Files**: MODIFY: `src/lib/services/graph-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 36
**Type**: feature

---

### Issue 39: removeNode deletes a flow node

**Behavior to test**: "When a node is removed, then it returns `{ success: true }`."

**Files**: MODIFY: `src/lib/services/graph-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 36
**Type**: feature

---

### Issue 40: addEdge inserts a flow edge

**Behavior to test**: "When an edge is added between two nodes, then it returns the inserted edge."

**Files**: MODIFY: `src/lib/services/graph-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 36
**Type**: feature

---

### Issue 41: removeEdge deletes a flow edge

**Behavior to test**: "When an edge is removed, then it returns `{ success: true }`."

**Files**: MODIFY: `src/lib/services/graph-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issue 36
**Type**: feature

---

### Issue 42: connectModules and disconnectModules manage module connections

**Behavior to test**: "When two modules are connected, then it returns the connection. When disconnected, the connection is removed."

**Files**:
- CREATE: `src/lib/services/module-connection-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issues 13, 15
**Type**: feature

---

### Issue 43: addChatMessage and listChatMessages persist conversation history

**Behavior to test**: "When a chat message is added, then it returns the message. When listed, messages return in chronological order."

**Files**:
- CREATE: `src/lib/services/chat-message-service.ts` [boundary: DB]

**Dependencies**: Blocked by: Issues 8, 15
**Type**: feature

---

### Issue 44: React Flow base canvas renders with zoom, pan, minimap

**Behavior to test**: "When the canvas component mounts, then it renders React Flow with MiniMap, Controls, and Background."

**Acceptance criteria**:
- [ ] Renders without crashing with empty nodes/edges
- [ ] MiniMap, Controls, Background present
- [ ] Wrapped in ReactFlowProvider
- [ ] Client component (`"use client"`)

**Files**:
- CREATE: `src/components/canvas/Canvas.tsx`

**Dependencies**: Blocked by: Issues 5, 6
**Type**: feature

---

### Issue 45: Module card custom node with entry/exit handles

**Behavior to test**: "When a module card renders, then it displays name, description, and positioned entry/exit handles."

**Files**:
- CREATE: `src/components/canvas/nodes/ModuleCardNode.tsx`

**Dependencies**: Blocked by: Issue 44
**Type**: feature

---

### Issue 46: Decision node renders as diamond with labeled handles

**Behavior to test**: "When a decision node renders, then it shows diamond shape with label and yes/no handles."

**Files**:
- CREATE: `src/components/canvas/nodes/DecisionNode.tsx`

**Dependencies**: Blocked by: Issue 44
**Type**: feature

---

### Issue 47: Process node renders with expandable pseudocode

**Behavior to test**: "When a process node renders, then it shows label. When expand is clicked, pseudocode toggles visible."

**Files**:
- CREATE: `src/components/canvas/nodes/ProcessNode.tsx`

**Dependencies**: Blocked by: Issue 44
**Type**: feature

---

### Issue 48: Entry and exit nodes render with directional handles

**Behavior to test**: "Entry node has source handles only. Exit node has target handles only."

**Files**:
- CREATE: `src/components/canvas/nodes/EntryNode.tsx`
- CREATE: `src/components/canvas/nodes/ExitNode.tsx`

**Dependencies**: Blocked by: Issue 44
**Type**: feature

---

### Issue 49: Start and end nodes render as circles

**Behavior to test**: "Start has source handle only. End has target handle only."

**Files**:
- CREATE: `src/components/canvas/nodes/StartNode.tsx`
- CREATE: `src/components/canvas/nodes/EndNode.tsx`

**Dependencies**: Blocked by: Issue 44
**Type**: feature

---

### Issue 50: Auto-layout positions nodes using dagre

**Behavior to test**: "When nodes and edges are passed to computeLayout, then nodes get computed positions in top-to-bottom direction."

**Acceptance criteria**:
- [ ] Source nodes positioned above target nodes
- [ ] Single node returns valid position
- [ ] Empty input returns empty output
- [ ] Pure function (no mutation)

**Files**:
- CREATE: `src/lib/canvas/layout.ts`

**Dependencies**: Blocked by: Issues 5, 6
**Type**: feature

---

### Issue 51: Custom edge renders with condition label and animated direction

**Behavior to test**: "When a custom edge renders, then it displays label if present and animated direction marker."

**Files**:
- CREATE: `src/components/canvas/edges/ConditionEdge.tsx`

**Dependencies**: Blocked by: Issue 44
**Type**: feature

---

### Issue 52: Node color config maps each type to a color

**Behavior to test**: "When getNodeColor is called with a node type, then it returns the designated color."

**Acceptance criteria**:
- [ ] decision=amber, process=blue, entry=green, exit=red, start/end=gray
- [ ] Unknown types return a default color

**Files**:
- CREATE: `src/lib/canvas/colors.ts`

**Dependencies**: Blocked by: none (pure config)
**Type**: feature

---

## Wave 4: AI/Chat Core (10 issues)

### Issue 53: Chat store manages messages, loading, and error state

**Behavior to test**: "When a message is added to the store, then it appears in the messages array. Reset clears all state."

**Files**:
- CREATE: `src/store/chat-store.ts`

**Dependencies**: Blocked by: Issue 8
**Type**: feature

---

### Issue 54: System prompt builder — discovery mode

**Behavior to test**: "When buildSystemPrompt is called with mode 'discovery', then it returns a prompt instructing AI to ask discovery questions and include file path references in pseudocode."

**Acceptance criteria**:
- [ ] Returns prompt instructing AI to ask clarifying questions about the project
- [ ] Includes the JSON schema for graph operations
- [ ] Instructs AI to wrap operations in `<operations>` delimiters
- [ ] Instructs AI to include `// file: <path>` comments in pseudocode so the file tree sidebar can derive project structure
- [ ] Includes the project name for context

**Files**:
- CREATE: `src/lib/services/prompt-builder.ts`

**Dependencies**: Blocked by: Issue 8
**Type**: feature

---

### Issue 55: System prompt builder — module map mode

**Behavior to test**: "When buildSystemPrompt is called with mode 'module_map', then prompt includes existing modules, module-level operations only, and file path instructions for pseudocode."

**Acceptance criteria**:
- [ ] Includes existing module names and descriptions
- [ ] Describes module-level operations (create/update/delete module, connect_modules)
- [ ] Does NOT include node-level operations
- [ ] Includes file path instruction for pseudocode

**Files**: MODIFY: `src/lib/services/prompt-builder.ts`

**Dependencies**: Blocked by: Issue 54
**Type**: feature

---

### Issue 56: System prompt builder — module detail mode

**Behavior to test**: "When buildSystemPrompt is called with mode 'module_detail', then prompt includes node/edge operations, current module's flow data, and instructs AI to write pseudocode with file path references."

**Acceptance criteria**:
- [ ] Includes node and edge operations (create/update/delete)
- [ ] Includes current module's existing nodes and edges
- [ ] Includes node type vocabulary (decision, process, entry, exit, start, end)
- [ ] Instructs AI to write pseudocode for process nodes with `// file: <path>` references
- [ ] Does NOT include module-level create/delete operations

**Files**: MODIFY: `src/lib/services/prompt-builder.ts`

**Dependencies**: Blocked by: Issue 54
**Type**: feature

---

### Issue 57: LLM response parser extracts message and operations

**Behavior to test**: "When parseLLMResponse is called, then it separates the text message from the `<operations>` JSON block."

**Acceptance criteria**:
- [ ] Text outside `<operations>` tags becomes the message
- [ ] JSON inside tags parsed into GraphOperation[]
- [ ] No operations block = empty array
- [ ] Malformed JSON = empty array (graceful degradation)
- [ ] Unknown operation types filtered out
- [ ] Empty string input handled

**Files**:
- CREATE: `src/lib/services/llm-response-parser.ts`

**Dependencies**: Blocked by: Issue 8
**Type**: feature

---

### Issue 58: LLM client wrapper calls Anthropic API with streaming

**Behavior to test**: "When callLLM is called, then it calls the Anthropic API with streaming enabled and returns a stream of text chunks. Default model is claude-sonnet-4-6, configurable via AI_MODEL env var."

**Acceptance criteria**:
- [ ] Uses Anthropic SDK singleton
- [ ] Default model: `claude-sonnet-4-6`, overridable via `AI_MODEL` env var
- [ ] Returns a readable stream of text chunks (not a complete response)
- [ ] On API error, throws sanitized message (no keys leaked)
- [ ] `AI_MODEL` added to env config schema (Issue 1)

**Files**:
- CREATE: `src/lib/services/llm-client.ts` [boundary: third-party]

**Dependencies**: Blocked by: Issue 1 (env config)
**Type**: feature

---

### Issue 59: Graph operation executor — module operations

**Behavior to test**: "When executeOperations is called with module operations, then it calls corresponding data layer services."

**Files**:
- CREATE: `src/lib/services/graph-operation-executor.ts` [boundary: DB]

**Dependencies**: Blocked by: Issues 8, 28 (module service)
**Type**: feature

---

### Issue 60: Graph operation executor — node/edge operations + partial failure reporting

**Behavior to test**: "When node/edge operations are executed and one fails, then results report which succeeded and which failed (no rollback — let the AI retry)."

**Acceptance criteria**:
- [ ] All succeed = `{ success: true, results: [...] }`
- [ ] Partial fail = `{ success: false, results: [...], error: string }` showing which operations succeeded and which failed
- [ ] Empty array = `{ success: true, results: [] }`
- [ ] No application-level rollback — partial state is acceptable for MVP

**Files**: MODIFY: `src/lib/services/graph-operation-executor.ts` [boundary: DB]

**Dependencies**: Blocked by: Issues 59, 37 (graph service)
**Type**: feature

---

### Issue 60a: Graph store manages current project's modules, nodes, and edges

**Context**: The canvas and chat need a shared source of truth for the current graph state. When the AI creates modules/nodes, the graph store updates and the canvas re-renders. This is the data backbone connecting the chat and canvas.

**Behavior to test**: "When modules/nodes/edges are set in the graph store, then they are available to all consumers. When operations update the store, then the canvas reflects the changes."

**Acceptance criteria**:
- [ ] `useGraphStore` exposes `modules`, `nodes`, `edges`, `activeModuleId`
- [ ] `setModules(modules)`, `setNodes(nodes)`, `setEdges(edges)` replace the current state
- [ ] `addModule(module)`, `addNode(node)`, `addEdge(edge)` append to arrays
- [ ] `updateModule(id, partial)`, `updateNode(id, partial)` merge updates
- [ ] `removeModule(id)`, `removeNode(id)`, `removeEdge(id)` remove by ID
- [ ] `setActiveModuleId(id | null)` controls drill-down state
- [ ] `reset()` clears all state

**Test sketch**:
```typescript
describe('useGraphStore', () => {
  beforeEach(() => useGraphStore.getState().reset())

  it('starts empty', () => {
    expect(useGraphStore.getState().modules).toEqual([])
    expect(useGraphStore.getState().nodes).toEqual([])
  })

  it('addModule appends to modules', () => {
    useGraphStore.getState().addModule({ id: 'm1', name: 'Auth' })
    expect(useGraphStore.getState().modules).toHaveLength(1)
  })

  it('removeNode removes by ID', () => {
    useGraphStore.getState().setNodes([{ id: 'n1' }, { id: 'n2' }])
    useGraphStore.getState().removeNode('n1')
    expect(useGraphStore.getState().nodes).toHaveLength(1)
    expect(useGraphStore.getState().nodes[0].id).toBe('n2')
  })
})
```

**Files**:
- CREATE: `src/store/graph-store.ts` — Zustand store for graph state

**Dependencies**: Blocked by: Issues 3-7 (graph types)
**Type**: feature

---

## Wave 5: Integration + UI (6 issues)

### Issue 61: Chat route handler orchestrates prompt → LLM stream → parse → execute

**Behavior to test**: "When the chat endpoint receives a message, then it builds prompt, streams the LLM response to the client, parses the complete response for operations, executes them, and updates the graph store."

**Acceptance criteria**:
- [ ] Route Handler at `POST /api/chat` (not Server Action — streaming requires a Route Handler)
- [ ] Validates input with Zod
- [ ] Streams text tokens to the client as they arrive
- [ ] After stream completes, parses operations from the full response
- [ ] Executes graph operations and returns operation results
- [ ] Returns error as JSON `{ error: string }` on failure — never throws
- [ ] Persists both user and assistant messages to chat_messages table

**Files**:
- CREATE: `src/app/api/chat/route.ts` — streaming chat route handler [boundary: third-party]

**Dependencies**: Blocked by: Issues 54-60, 60a (graph store)
**Type**: feature

---

### Issue 62: Chat message list component renders conversation with streaming support

**Behavior to test**: "When ChatMessageList receives messages, then it renders each with role styling. When streaming, tokens appear word-by-word in the latest assistant message."

**Acceptance criteria**:
- [ ] User and assistant messages styled differently (alignment/color)
- [ ] Streaming tokens render progressively in the latest assistant message bubble
- [ ] Shows a typing/thinking indicator while waiting for first token
- [ ] Empty state with welcome prompt (e.g., "Describe what you want to build")
- [ ] Auto-scrolls to newest message as tokens arrive
- [ ] Accessible: messages use appropriate ARIA roles

**Files**:
- CREATE: `src/components/chat/ChatMessageList.tsx`

**Dependencies**: Blocked by: Issue 8
**Type**: feature

---

### Issue 62a: Chat input component with send button and keyboard submit

**Context**: The chat is the primary interaction model. Users need a text input to type messages and send them to the AI. The input should feel responsive — disabled while the AI is responding, submit on Enter, clear after send.

**Behavior to test**: "When a user types a message and presses Enter or clicks Send, then the onSend callback fires with the message text and the input clears."

**Acceptance criteria**:
- [ ] Text input field with placeholder "Describe what you want to build..."
- [ ] Send button next to the input
- [ ] Submit on Enter key (Shift+Enter for newline)
- [ ] Input and button disabled while `isLoading` is true
- [ ] Input clears after successful send
- [ ] Empty message does not trigger onSend
- [ ] Keyboard accessible, proper ARIA labels

**Test sketch**:
```typescript
describe('ChatInput', () => {
  it('calls onSend with message text on submit', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} />)
    await userEvent.type(screen.getByRole('textbox'), 'Build an auth system')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('Build an auth system')
  })

  it('clears input after send', async () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'Hello')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(input).toHaveValue('')
  })

  it('disables input and button when loading', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={true} />)
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('does not send empty messages', async () => {
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} isLoading={false} />)
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).not.toHaveBeenCalled()
  })
})
```

**Files**:
- CREATE: `src/components/chat/ChatInput.tsx` — chat input with send button

**Dependencies**: Blocked by: none (pure UI component)
**Type**: feature

---

### Issue 63: Derive file tree from single node, nested paths, and shared folders

**Behavior to test**: "When deriveFileTree is called with flow nodes, then it builds a hierarchical file/folder tree from pseudocode file references."

**Acceptance criteria**:
- [ ] Single node → root with nested folder/file structure
- [ ] Multiple nodes → shared folders merged
- [ ] Duplicate file paths → merged linkedNodeIds
- [ ] Empty/no pseudocode → empty root
- [ ] Folders sorted before files, both alphabetically

**Files**: MODIFY: `src/lib/services/file-tree.ts`

**Dependencies**: Blocked by: Issue 14
**Type**: feature

---

### Issue 64: FileTree component renders collapsible tree with selection

**Behavior to test**: "When a FileTreeNode is passed to FileTree, then folders are collapsible and files are clickable. onFileSelect fires with linkedNodeIds."

**Acceptance criteria**:
- [ ] Folders expand/collapse on click
- [ ] Files call `onFileSelect` with linkedNodeIds
- [ ] `highlightedPaths` prop highlights matching files
- [ ] Empty tree shows empty state message

**Files**:
- CREATE: `src/components/file-tree.tsx`

**Dependencies**: Blocked by: Issue 14
**Type**: feature

---

## Wave 6: Composition (6 issues)

### Issue 65: Module map view renders modules as card nodes

**Behavior to test**: "When ModuleMapView receives modules, then each renders as a ModuleCardNode on the canvas."

**Files**:
- CREATE: `src/components/canvas/views/ModuleMapView.tsx`

**Dependencies**: Blocked by: Issues 44, 45, 50
**Type**: feature

---

### Issue 65a: ModuleDetailView renders a module's nodes and edges with auto-layout

**Context**: When a user drills into a module, they see the detailed flow — all nodes (decision, process, entry, exit, start, end) and edges rendered on the canvas with auto-layout. This is the "inside the module" view.

**Behavior to test**: "When ModuleDetailView receives a module's nodes and edges, then it renders all custom node types on the canvas with auto-layout applied."

**Acceptance criteria**:
- [ ] Accepts `nodes` and `edges` arrays from the graph store (filtered to the active module)
- [ ] Converts graph nodes to React Flow nodes with correct custom types (decision, process, entry, exit, start, end)
- [ ] Applies `computeLayout` to position nodes
- [ ] Registers all custom `nodeTypes` and `edgeTypes`
- [ ] Renders empty canvas with message when module has no nodes
- [ ] Shows module name as a header/breadcrumb

**Files**:
- CREATE: `src/components/canvas/views/ModuleDetailView.tsx`

**Dependencies**: Blocked by: Issues 44-52 (all canvas node types, layout, edges, colors), 60a (graph store)
**Type**: feature

---

### Issue 66: Canvas container with drill-down navigation

**Behavior to test**: "When a user clicks a module card, view switches to ModuleDetailView. Back button returns to ModuleMapView."

**Files**:
- CREATE: `src/components/canvas/CanvasContainer.tsx`

**Dependencies**: Blocked by: Issues 65, 65a
**Type**: feature

---

### Issue 67: useFileTree hook reactively derives file tree from graph state

**Behavior to test**: "When the graph store's nodes change, then useFileTree returns an updated derived file tree."

**Files**:
- CREATE: `src/hooks/useFileTree.ts`

**Dependencies**: Blocked by: Issue 63
**Type**: feature

---

### Issue 68: FileTreeSidebar composed panel with header

**Behavior to test**: "When FileTreeSidebar renders, then it shows 'Files' header and the derived file tree."

**Files**:
- CREATE: `src/components/file-tree-sidebar.tsx`

**Dependencies**: Blocked by: Issues 64, 67
**Type**: feature

---

### Issue 69: Pseudocode display renders syntax-highlighted code block

**Behavior to test**: "When pseudocode is expanded in a process node, then it renders in a monospace block with keyword highlighting."

**Acceptance criteria**:
- [ ] `<pre><code>` block with monospace font
- [ ] Basic keyword highlighting (if/else/return/function)
- [ ] Empty string renders nothing

**Files**:
- CREATE: `src/components/canvas/PseudocodeBlock.tsx`

**Dependencies**: Blocked by: Issue 47
**Type**: feature

---

## Summary

| Wave | Issues | Domain Coverage |
|------|--------|-----------------|
| 1 | 1-18 | Types, schemas, env config, Supabase clients, database migrations |
| 2 | 19-32 | Auth actions/middleware, project + module CRUD |
| 3 | 33-52 | Auth UI, dashboard, graph CRUD, all canvas nodes, layout, edges |
| 4 | 53-60a | Chat store, graph store, prompt builder (with file paths), parser, LLM client (Sonnet default, streaming), executor (no rollback) |
| 5 | 61-64 | Chat route handler (streaming), message list (streaming), chat input, file tree derivation + UI |
| 6 | 65-69 | Module map view, ModuleDetailView, canvas drill-down, file tree sidebar, pseudocode display |

**Total: 74 issues, 6 waves.**

**Grill review applied:** database migrations, dashboard page, chat input, ModuleDetailView, graph store added. Prompt builder updated with file path instructions. Executor simplified (no rollback). LLM client defaults to Sonnet with streaming. Chat uses Route Handler for streaming.

Next step: `/tdd-deep plans/mermaidai-mvp-tdd/` to start building.
