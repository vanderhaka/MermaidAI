# TDD Plan: Scoping Mode with Hybrid Open Questions

## Overview

Adds a new "Scope Mode" project type alongside the existing "Architecture Mode". Scope mode is designed for live client calls — the user types what the client describes, and the AI builds a simplified flowchart with silent open question markers ("?" nodes) that auto-resolve as gaps are filled. The feature spans the full stack: database schema, LLM tools/prompts, Zustand store, canvas components, and workspace UI.

The decomposition follows six waves ordered by dependency: types/schemas first, then services/store, then LLM wiring, then integration, then UI, then final polish. Issues within each wave are parallel.

## Issue Count

27 issues across 7 dependency waves

## Dependency Graph

```
Wave 1 (parallel): Issues 1, 2, 3, 4, 5
Wave 2 (parallel): Issues 6, 7, 8, 9
Wave 3 (parallel): Issues 10, 11, 12
Wave 4 (parallel): Issues 13, 14, 15, 16, 17
Wave 5 (parallel): Issues 18, 19, 20, 21, 22
Wave 6 (parallel): Issues 23, 24, 25, 26
Wave 7 (parallel): Issue 27
```

---

## Issue 1: Add `mode` field to project schema validation

**Type:** feature
**Context:** Projects need a `mode` field (`'scope' | 'architecture'`) so users can choose between scoping and full architecture at creation time. The Zod schema must validate this and default to `'architecture'` for backward compatibility.
**Behavior to test:** When `createProjectSchema` receives a `mode` field, it validates it as one of the allowed values; when omitted, it defaults to `'architecture'`.
**Acceptance criteria:**

1. `createProjectSchema` accepts `mode: 'scope'` and parses successfully
2. `createProjectSchema` accepts `mode: 'architecture'` and parses successfully
3. `createProjectSchema` defaults `mode` to `'architecture'` when omitted
4. `createProjectSchema` rejects invalid mode values (e.g. `'draft'`)
5. `updateProjectSchema` accepts optional `mode` field

**Test sketch:**

```typescript
import { describe, it, expect } from 'vitest'
import { createProjectSchema } from '@/lib/schemas/project'

describe('createProjectSchema — mode field', () => {
  it('defaults mode to architecture when omitted', () => {
    const result = createProjectSchema.safeParse({ name: 'My Project' })
    expect(result.success).toBe(true)
    expect(result.data?.mode).toBe('architecture')
  })

  it('accepts mode: scope', () => {
    const result = createProjectSchema.safeParse({ name: 'Scoping Call', mode: 'scope' })
    expect(result.success).toBe(true)
    expect(result.data?.mode).toBe('scope')
  })

  it('rejects invalid mode value', () => {
    const result = createProjectSchema.safeParse({ name: 'Bad', mode: 'draft' })
    expect(result.success).toBe(false)
  })
})
```

**Files:**

- `src/lib/schemas/project.ts` — MODIFY
- `src/lib/schemas/project.test.ts` — MODIFY

**Blocked by:** none
**Blocks:** 6

---

## Issue 2: Add `'question'` to FlowNodeType and flow-node schema

**Type:** feature
**Context:** Scoping mode needs a `'question'` node type so the AI can place open question markers on the canvas. Both the TypeScript union and the Zod schema must include it.
**Behavior to test:** When `createFlowNodeSchema` receives `node_type: 'question'`, it parses successfully.
**Acceptance criteria:**

1. `FlowNodeType` union includes `'question'`
2. `createFlowNodeSchema` accepts `node_type: 'question'`
3. Existing 6 node types still parse correctly (no regression)

**Test sketch:**

```typescript
import { describe, it, expect } from 'vitest'
import { createFlowNodeSchema } from '@/lib/schemas/flow-node'

describe('flow-node schema — question type', () => {
  it('accepts node_type question', () => {
    const result = createFlowNodeSchema.safeParse({
      module_id: '550e8400-e29b-41d4-a716-446655440000',
      node_type: 'question',
      label: 'What is the auth strategy?',
      pseudocode: '',
      position: { x: 0, y: 0 },
      color: '#FFD700',
    })
    expect(result.success).toBe(true)
  })

  it('still accepts all original node types', () => {
    for (const node_type of ['decision', 'process', 'entry', 'exit', 'start', 'end']) {
      const result = createFlowNodeSchema.safeParse({
        module_id: '550e8400-e29b-41d4-a716-446655440000',
        node_type,
        label: 'Test',
        pseudocode: '',
        position: { x: 0, y: 0 },
        color: '#000',
      })
      expect(result.success).toBe(true)
    }
  })
})
```

**Files:**

- `src/types/graph.ts` — MODIFY (add `'question'` to `FlowNodeType`)
- `src/lib/schemas/flow-node.ts` — MODIFY (add to enum)
- `src/lib/schemas/flow-node.test.ts` — MODIFY

**Blocked by:** none
**Blocks:** 15, 16

---

## Issue 3: Define OpenQuestion type and Zod schemas

**Type:** feature
**Context:** Open questions need a type definition and validation schemas. An `OpenQuestion` tracks a gap identified during scoping — linked to a project, a question FlowNode, grouped by section.
**Behavior to test:** When `createOpenQuestionSchema` receives valid input, it parses successfully; rejects invalid UUIDs and empty questions.
**Acceptance criteria:**

1. `OpenQuestion` type exists with: id, project_id, node_id, section, question, status (`'open' | 'resolved'`), resolution (nullable), created_at, resolved_at (nullable)
2. `createOpenQuestionSchema` accepts valid input, defaults status to `'open'` and resolution to `null`
3. `createOpenQuestionSchema` rejects empty `question` string
4. `resolveOpenQuestionSchema` requires non-empty `resolution` string

**Test sketch:**

```typescript
import { describe, it, expect } from 'vitest'
import { createOpenQuestionSchema, resolveOpenQuestionSchema } from '@/lib/schemas/open-question'

describe('createOpenQuestionSchema', () => {
  const valid = {
    project_id: '550e8400-e29b-41d4-a716-446655440000',
    node_id: '660e8400-e29b-41d4-a716-446655440000',
    section: 'Authentication',
    question: 'What OAuth providers should we support?',
  }

  it('accepts valid input and defaults status to open', () => {
    const result = createOpenQuestionSchema.safeParse(valid)
    expect(result.success).toBe(true)
    expect(result.data?.status).toBe('open')
    expect(result.data?.resolution).toBeNull()
  })

  it('rejects empty question', () => {
    expect(createOpenQuestionSchema.safeParse({ ...valid, question: '' }).success).toBe(false)
  })
})

describe('resolveOpenQuestionSchema', () => {
  it('rejects empty resolution', () => {
    expect(resolveOpenQuestionSchema.safeParse({ resolution: '' }).success).toBe(false)
  })
})
```

**Files:**

- `src/types/graph.ts` — MODIFY (add `OpenQuestion` type)
- `src/lib/schemas/open-question.ts` — CREATE
- `src/lib/schemas/open-question.test.ts` — CREATE

**Blocked by:** none
**Blocks:** 7, 8

---

## Issue 4: QuestionNode canvas component

**Type:** feature
**Context:** Scoping mode needs a visually distinct node for open questions — amber/yellow border with a "?" badge. Follows the same pattern as ProcessNode and DecisionNode. Uses same width (260px) as ProcessNode for consistent layout.
**Behavior to test:** When a QuestionNode is rendered with question data, it displays the text inside an amber container with handles.
**Acceptance criteria:**

1. Renders question text from `data.question`
2. Shows a "?" badge element
3. Has amber border styling, 260px width (matches ProcessNode)
4. Renders target Handle at Position.Top, source Handle at Position.Bottom

**Test sketch:**

```typescript
// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: Record<string, unknown>) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Top: 'top', Bottom: 'bottom' },
}))

import QuestionNode from '@/components/canvas/nodes/QuestionNode'

describe('QuestionNode', () => {
  const props = { id: 'q-1', data: { question: 'How will users authenticate?' } } as any

  it('renders the question text', () => {
    render(<QuestionNode {...props} />)
    expect(screen.getByText('How will users authenticate?')).toBeInTheDocument()
  })

  it('displays a question mark badge', () => {
    render(<QuestionNode {...props} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('has target and source handles', () => {
    render(<QuestionNode {...props} />)
    expect(screen.getByTestId('handle-target')).toHaveAttribute('data-position', 'top')
    expect(screen.getByTestId('handle-source')).toHaveAttribute('data-position', 'bottom')
  })
})
```

**Files:**

- `src/components/canvas/nodes/QuestionNode.tsx` — CREATE
- `src/components/canvas/nodes/QuestionNode.test.tsx` — CREATE

**Blocked by:** none
**Blocks:** 14, 15

---

## Issue 5: LLM tool definitions for add_open_question and resolve_open_question

**Type:** feature
**Context:** The AI needs two new tool schemas so it can silently place question nodes and resolve them. This issue defines the Anthropic tool schemas only — no executor logic.
**Behavior to test:** When the tool definitions are inspected, they have the correct names, required parameters, and types.
**Acceptance criteria:**

1. `add_open_question` tool requires `moduleId`, `section`, `question` (all strings); optional `relatedNodeId`
2. `resolve_open_question` tool requires `questionId`, `resolution` (both strings)
3. Both have descriptive descriptions

**Test sketch:**

```typescript
import { describe, it, expect } from 'vitest'
// Import tool definitions from llm-tools.ts

describe('add_open_question tool definition', () => {
  it('has correct required params', () => {
    expect(addOpenQuestionTool.name).toBe('add_open_question')
    expect(addOpenQuestionTool.input_schema.required).toEqual(['moduleId', 'section', 'question'])
  })

  it('includes optional relatedNodeId', () => {
    const props = addOpenQuestionTool.input_schema.properties as Record<string, { type: string }>
    expect(props.relatedNodeId).toBeDefined()
  })
})

describe('resolve_open_question tool definition', () => {
  it('has correct required params', () => {
    expect(resolveOpenQuestionTool.name).toBe('resolve_open_question')
    expect(resolveOpenQuestionTool.input_schema.required).toEqual(['questionId', 'resolution'])
  })
})
```

**Files:**

- `src/lib/services/llm-tools.ts` — MODIFY (add both tool definitions, export for testing)

**Blocked by:** none
**Blocks:** 10, 11, 12

---

## Issue 6: Add `mode` to Project type and project-service

**Type:** feature
**Context:** The `Project` type and `createProject` service must accept and persist the `mode` field. `getProjectById` and `listProjectsByUser` must return it.
**Behavior to test:** When `createProject` is called with `mode: 'scope'`, the inserted row includes it; when omitted, defaults to `'architecture'`.
**Acceptance criteria:**

1. `Project` type includes `mode: 'scope' | 'architecture'`
2. `createProject({ name: 'X' })` inserts with `mode: 'architecture'`
3. `createProject({ name: 'X', mode: 'scope' })` inserts with `mode: 'scope'`
4. `getProjectById` returns the `mode` field
5. `listProjectsByUser` returns the `mode` field

**Test sketch:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('createProject — mode field', () => {
  it('inserts with default mode architecture when omitted', async () => {
    mockSingle.mockResolvedValue({ data: { ...projectData, mode: 'architecture' }, error: null })
    const result = await createProject({ name: 'Test' })
    expect(result.success).toBe(true)
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ mode: 'architecture' }))
  })

  it('inserts with mode scope when specified', async () => {
    mockSingle.mockResolvedValue({ data: { ...projectData, mode: 'scope' }, error: null })
    const result = await createProject({ name: 'Call', mode: 'scope' })
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ mode: 'scope' }))
  })
})
```

**Files:**

- `src/types/graph.ts` — MODIFY (add `mode` to `Project`)
- `src/lib/services/project-service.ts` — MODIFY (update selects + insert)
- `src/lib/services/project-service.test.ts` — MODIFY

**Blocked by:** 1
**Blocks:** 17, 20

---

## Issue 7: Create open-question-service with CRUD operations

**Type:** feature
**Context:** Data access layer for open questions: create, resolve, list all, list open only. Follows the `ServiceResult<T>` pattern used by all other services.
**Behavior to test:** Each function validates input, calls the correct Supabase table, and returns `ServiceResult<T>`.
**Acceptance criteria:**

1. `createOpenQuestion` validates input, inserts into `open_questions`, returns the record
2. `createOpenQuestion` returns `{ success: false }` for invalid input
3. `resolveOpenQuestion(id, resolution)` updates status to `'resolved'`, sets `resolved_at`
4. `listOpenQuestions(projectId)` returns all questions ordered by `created_at`
5. `listOpenOpenQuestions(projectId)` returns only `status: 'open'` questions

**Test sketch:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('createOpenQuestion', () => {
  it('returns success with inserted question for valid input', async () => {
    mockSingle.mockResolvedValue({ data: questionData, error: null })
    const result = await createOpenQuestion(validInput)
    expect(result.success).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('open_questions')
  })

  it('returns failure for invalid input', async () => {
    const result = await createOpenQuestion({
      project_id: 'bad',
      node_id: 'bad',
      section: '',
      question: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('resolveOpenQuestion', () => {
  it('updates status and sets resolved_at', async () => {
    mockSingle.mockResolvedValue({ data: resolvedData, error: null })
    const result = await resolveOpenQuestion('oq-1', 'Google + GitHub')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved' }))
  })
})

describe('listOpenOpenQuestions', () => {
  it('filters by status open', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null })
    await listOpenOpenQuestions('p1')
    expect(mockEq).toHaveBeenCalledWith('status', 'open')
  })
})
```

**Files:**

- `src/lib/services/open-question-service.ts` — CREATE [boundary: DB]
- `src/lib/services/open-question-service.test.ts` — CREATE

**Blocked by:** 3
**Blocks:** 10, 11, 19

---

## Issue 8: Graph store manages openQuestions state

**Type:** feature
**Context:** The Zustand store needs to track open questions so the canvas, panel, and stream handlers can all read/write them.
**Behavior to test:** When store actions are called, the openQuestions array updates correctly.
**Acceptance criteria:**

1. `openQuestions` initializes as empty array
2. `addOpenQuestion` appends to the array
3. `resolveOpenQuestion(id, resolution)` sets status to `'resolved'` and stores resolution
4. `setOpenQuestions` replaces the entire array
5. `reset()` clears openQuestions

**Test sketch:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from '@/store/graph-store'

describe('useGraphStore — openQuestions', () => {
  beforeEach(() => {
    useGraphStore.getState().reset()
  })

  it('starts with empty openQuestions', () => {
    expect(useGraphStore.getState().openQuestions).toEqual([])
  })

  it('addOpenQuestion appends to array', () => {
    useGraphStore.getState().addOpenQuestion(makeQuestion())
    expect(useGraphStore.getState().openQuestions).toHaveLength(1)
  })

  it('resolveOpenQuestion updates status', () => {
    useGraphStore.getState().addOpenQuestion(makeQuestion({ id: 'oq-1' }))
    useGraphStore.getState().resolveOpenQuestion('oq-1', 'Use OAuth2')
    expect(useGraphStore.getState().openQuestions[0].status).toBe('resolved')
  })

  it('reset clears openQuestions', () => {
    useGraphStore.getState().addOpenQuestion(makeQuestion())
    useGraphStore.getState().reset()
    expect(useGraphStore.getState().openQuestions).toEqual([])
  })
})
```

**Files:**

- `src/store/graph-store.ts` — MODIFY
- `src/store/graph-store.test.ts` — MODIFY

**Blocked by:** 3
**Blocks:** 14, 18

---

## Issue 9: Add `scope_build` to PromptMode with stub prompt

**Type:** feature
**Context:** The prompt builder needs `scope_build` in the `PromptMode` union so the dispatch switch is exhaustive. This issue adds the type and a minimal stub — the full prompt content is Issue 13.
**Behavior to test:** When `buildSystemPrompt('scope_build', context)` is called, it returns a non-empty string containing the project name.
**Acceptance criteria:**

1. `PromptMode` includes `'scope_build'`
2. `buildSystemPrompt('scope_build', context)` returns a non-empty string
3. Existing modes still work unchanged

**Test sketch:**

```typescript
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/services/prompt-builder'

describe('buildSystemPrompt — scope_build', () => {
  it('returns a non-empty string', () => {
    const prompt = buildSystemPrompt('scope_build', { projectName: 'Test' })
    expect(prompt).toBeTruthy()
  })

  it('includes the project name', () => {
    const prompt = buildSystemPrompt('scope_build', { projectName: 'ClientCall' })
    expect(prompt).toContain('ClientCall')
  })
})
```

**Files:**

- `src/lib/services/prompt-builder.ts` — MODIFY (update type, add stub case)
- `src/lib/services/prompt-builder.test.ts` — MODIFY

**Blocked by:** none
**Blocks:** 12, 13

---

## Issue 10: add_open_question tool executor

**Type:** feature
**Context:** When the AI calls `add_open_question`, the executor must create a FlowNode with type `'question'`, create an open_questions DB record, and optionally link via edge to a related node.
**Behavior to test:** When `executeTool('add_open_question', ...)` is called, it creates the node, the record, and returns both.
**Acceptance criteria:**

1. Creates FlowNode with `node_type: 'question'`, label truncated to ~60 chars, pseudocode = full question
2. Creates open_questions record with section, question, and new node_id
3. When `relatedNodeId` provided, creates an edge from that node to the question node
4. When `relatedNodeId` omitted, no edge is created
5. Returns `isError: true` if addNode fails

**Test sketch:**

```typescript
import { vi, describe, it, expect } from 'vitest'

vi.mock('@/lib/services/graph-service')
vi.mock('@/lib/services/open-question-service')

describe('executeTool — add_open_question', () => {
  it('creates a question node and record', async () => {
    vi.mocked(addNode).mockResolvedValue({ success: true, data: mockNode })
    vi.mocked(createOpenQuestion).mockResolvedValue({ success: true, data: mockQuestion })

    const executor = createToolExecutor('proj-1')
    const result = await executor('add_open_question', {
      moduleId: 'mod-1',
      section: 'Auth',
      question: 'What auth flow?',
    })
    expect(result.isError).toBe(false)
    expect(addNode).toHaveBeenCalledWith(expect.objectContaining({ node_type: 'question' }))
  })

  it('creates edge when relatedNodeId provided', async () => {
    // ... setup mocks ...
    await executor('add_open_question', {
      moduleId: 'mod-1',
      section: 'Auth',
      question: 'MFA?',
      relatedNodeId: 'node-5',
    })
    expect(addEdge).toHaveBeenCalledWith(
      expect.objectContaining({
        source_node_id: 'node-5',
      }),
    )
  })
})
```

**Files:**

- `src/lib/services/llm-tools.ts` — MODIFY (add executor case) [boundary: DB]

**Blocked by:** 5, 7
**Blocks:** none

---

## Issue 11: resolve_open_question tool executor

**Type:** feature
**Context:** When the AI calls `resolve_open_question`, the executor resolves the DB record and deletes the question FlowNode from the canvas.
**Behavior to test:** When `executeTool('resolve_open_question', ...)` is called, it resolves the record and removes the node.
**Acceptance criteria:**

1. Calls `resolveOpenQuestion(questionId, resolution)`
2. Retrieves `node_id` from the resolved record
3. Calls `removeNode(node_id)` to clean up the canvas
4. Returns `isError: true` if record not found

**Test sketch:**

```typescript
describe('executeTool — resolve_open_question', () => {
  it('resolves record and deletes question node', async () => {
    vi.mocked(resolveOpenQuestion).mockResolvedValue({
      success: true,
      data: { id: 'oq-1', node_id: 'q-1', status: 'resolved' },
    })
    vi.mocked(removeNode).mockResolvedValue({ success: true, data: null })

    const result = await executor('resolve_open_question', {
      questionId: 'oq-1',
      resolution: 'Use OAuth2',
    })
    expect(result.isError).toBe(false)
    expect(removeNode).toHaveBeenCalledWith('q-1')
  })
})
```

**Files:**

- `src/lib/services/llm-tools.ts` — MODIFY (add executor case) [boundary: DB]

**Blocked by:** 5, 7
**Blocks:** none

---

## Issue 12: SCOPE_TOOLS array and getToolsForMode update

**Type:** feature
**Context:** Scope mode needs its own tool set — node/edge tools plus question tools, but no module tools (scoping uses a single auto-created module).
**Behavior to test:** When `getToolsForMode('scope_build')` is called, it returns exactly the scope tool set.
**Acceptance criteria:**

1. Returns: create_node, update_node, delete_node, create_edge, delete_edge, add_open_question, resolve_open_question
2. Does NOT include create_module, update_module, delete_module, connect_modules
3. Exhaustive — `tsc --noEmit` passes with all modes handled

**Test sketch:**

```typescript
describe('getToolsForMode — scope_build', () => {
  it('returns scope tools without module tools', () => {
    const tools = getToolsForMode('scope_build')
    const names = tools.map((t) => t.name)
    expect(names).toContain('add_open_question')
    expect(names).toContain('resolve_open_question')
    expect(names).toContain('create_node')
    expect(names).not.toContain('create_module')
    expect(names).toHaveLength(7)
  })
})
```

**Files:**

- `src/lib/services/llm-tools.ts` — MODIFY (add SCOPE_TOOLS, update switch)

**Blocked by:** 5, 9
**Blocks:** 13, 19

---

## Issue 13: Scoping system prompt (buildScopeBuildPrompt)

**Type:** feature
**Context:** The AI needs a prompt that instructs it to build flowcharts from requirements, silently add question nodes for gaps, resolve questions when answered, and surface unresolved questions at natural pauses. Replaces the stub from Issue 9.
**Behavior to test:** When `buildSystemPrompt('scope_build', context)` is called, it returns a prompt with scoping-specific instructions including open questions context.
**Acceptance criteria:**

1. Instructs AI to build flowcharts as user describes requirements
2. Instructs AI to silently add question nodes (not interrupt the user)
3. Instructs AI to resolve questions when new context answers them
4. Instructs AI to surface unresolved questions at natural pauses
5. Mentions `add_open_question` and `resolve_open_question` tools by name
6. Lists node types as process, decision, question, start, end
7. Includes open questions from context when provided
8. `PromptContext` updated with optional `openQuestions` field
9. Instructs AI to assign section names automatically based on conversation context (e.g. "Authentication", "Payments") — user does not provide sections

**Test sketch:**

```typescript
describe('buildScopeBuildPrompt', () => {
  it('instructs silent question placement', () => {
    const prompt = buildSystemPrompt('scope_build', { projectName: 'App' })
    expect(prompt).toContain('add_open_question')
    expect(prompt).toContain('resolve_open_question')
  })

  it('includes open questions context when provided', () => {
    const prompt = buildSystemPrompt('scope_build', {
      projectName: 'App',
      openQuestions: [
        { id: 'oq-1', section: 'Auth', question: 'OAuth or password?', status: 'open' },
      ],
    })
    expect(prompt).toContain('OAuth or password?')
  })

  it('works with no open questions', () => {
    const prompt = buildSystemPrompt('scope_build', { projectName: 'App' })
    expect(prompt).toBeTruthy()
    expect(prompt).not.toContain('undefined')
  })
})
```

**Files:**

- `src/lib/services/prompt-builder.ts` — MODIFY (replace stub with full prompt, add openQuestions to PromptContext)
- `src/lib/services/prompt-builder.test.ts` — MODIFY

**Blocked by:** 9, 12
**Blocks:** 19

---

## Issue 14: handleToolEvent handles both question tool events

**Type:** feature
**Context:** When the AI stream emits question tool events, the workspace must update both the canvas (FlowNodes) and the questions store.
**Behavior to test:** When `handleToolEvent` receives `add_open_question` or `resolve_open_question` events, it updates the store correctly.
**Acceptance criteria:**

1. `add_open_question` event: adds FlowNode to store AND adds OpenQuestion to store
2. `resolve_open_question` event: removes FlowNode from store AND resolves OpenQuestion
3. Both add tool call labels for the activity indicator

**Test sketch:**

```typescript
describe('handleToolEvent — add_open_question', () => {
  it('adds question node and open question to store', () => {
    handleToolEvent('add_open_question', {
      node: { id: 'q-1', node_type: 'question', label: 'Auth?' },
      question: { id: 'oq-1', section: 'Auth', question: 'Auth?', status: 'open' },
    })
    expect(mockAddNode).toHaveBeenCalled()
    expect(mockAddOpenQuestion).toHaveBeenCalled()
  })
})

describe('handleToolEvent — resolve_open_question', () => {
  it('removes node and resolves question', () => {
    handleToolEvent('resolve_open_question', {
      question_id: 'oq-1',
      node_id: 'q-1',
      resolution: 'Use OAuth2',
    })
    expect(mockRemoveNode).toHaveBeenCalledWith('q-1')
    expect(mockResolveOpenQuestion).toHaveBeenCalledWith('oq-1', 'Use OAuth2')
  })
})
```

**Files:**

- `src/components/dashboard/project-workspace.tsx` — MODIFY (add cases in handleToolEvent)

**Blocked by:** 4, 8
**Blocks:** none

---

## Issue 15: Register QuestionNode in ModuleDetailView nodeTypes

**Type:** feature
**Context:** ModuleDetailView defines the `nodeTypes` map for React Flow. QuestionNode must be registered so question-type nodes render on the canvas.
**Behavior to test:** When a node with `node_type: 'question'` exists, ModuleDetailView renders it using QuestionNode.
**Acceptance criteria:**

1. `nodeTypes` includes `question: QuestionNode`
2. Import statement added for QuestionNode
3. Existing node types unchanged

**Test sketch:**

```typescript
describe('ModuleDetailView — nodeTypes', () => {
  it('includes question in registered node types', () => {
    // Render with a question node and verify it appears
    const nodes = [{ id: 'q-1', module_id: 'm1', node_type: 'question', label: 'Auth?', pseudocode: '', position: { x: 0, y: 0 }, color: '', created_at: '', updated_at: '' }]
    render(<ModuleDetailView moduleName="Test" nodes={nodes} edges={[]} />)
    // Verify the node renders (via the mock)
  })
})
```

**Files:**

- `src/components/canvas/views/ModuleDetailView.tsx` — MODIFY (import + register)

**Blocked by:** 4
**Blocks:** none

---

## Issue 16: Prompt builder lists `question` in module_detail node types

**Type:** feature
**Context:** The module_detail prompt lists available node types so the AI knows what it can create. The `question` type needs to appear there with a description.
**Behavior to test:** When `buildSystemPrompt('module_detail', context)` is called, the prompt includes `question` as a node type.
**Acceptance criteria:**

1. Prompt includes `**question**` in the node types section
2. Description says something like "an open question or gap to resolve"
3. Existing node type descriptions unchanged

**Test sketch:**

```typescript
describe('module_detail prompt — question type', () => {
  it('lists question as an available node type', () => {
    const prompt = buildSystemPrompt('module_detail', contextWithModule)
    expect(prompt).toContain('**question**')
  })
})
```

**Files:**

- `src/lib/services/prompt-builder.ts` — MODIFY
- `src/lib/services/prompt-builder.test.ts` — MODIFY

**Blocked by:** 2
**Blocks:** none

---

## Issue 17: Mode selector at project creation

**Type:** feature
**Context:** The "New Project" button currently creates a project immediately. It needs to offer a choice between "Scope" and "Architecture" first.
**Behavior to test:** When the user clicks "New Project", a mode selector appears; selecting a mode creates the project with that mode.
**Acceptance criteria:**

1. Clicking "New Project" shows "Scope" and "Architecture" options
2. Selecting "Scope" calls `createProject({ name: 'Untitled Project', mode: 'scope' })`
3. Selecting "Architecture" calls `createProject({ name: 'Untitled Project', mode: 'architecture' })`
4. Navigates to `/dashboard/{id}` after creation
5. Selector can be dismissed

**Test sketch:**

```typescript
describe('ProjectList — mode selector', () => {
  it('shows mode options when New Project is clicked', async () => {
    render(<ProjectList projects={[]} />)
    await user.click(screen.getByRole('button', { name: /new project/i }))
    expect(screen.getByRole('button', { name: /scope/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /architecture/i })).toBeInTheDocument()
  })

  it('creates project with scope mode', async () => {
    mockCreateProject.mockResolvedValue({ success: true, data: { id: 'p1' } })
    render(<ProjectList projects={[]} />)
    await user.click(screen.getByRole('button', { name: /new project/i }))
    await user.click(screen.getByRole('button', { name: /scope/i }))
    expect(mockCreateProject).toHaveBeenCalledWith(expect.objectContaining({ mode: 'scope' }))
  })
})
```

**Files:**

- `src/components/dashboard/project-list.tsx` — MODIFY
- `src/components/dashboard/project-list.test.tsx` — MODIFY

**Blocked by:** 6
**Blocks:** 20

---

## Issue 18: OpenQuestionsPanel as collapsible bottom drawer

**Type:** feature
**Context:** Users need a panel showing all open questions grouped by section. Lives as a collapsible drawer at the bottom of the canvas area — out of the way until needed.
**Behavior to test:** When the panel receives open questions, it groups them by section with status indicators, a count badge, and auto-opens when open questions exist.
**Acceptance criteria:**

1. Groups questions under section name headers
2. Open questions show amber indicator; resolved show green check with resolution text
3. Count badge shows number of open questions
4. Empty state when no questions
5. Renders as a collapsible bottom drawer (not a sidebar)
6. Auto-opens when there are unresolved open questions; stays closed when all resolved or empty

**Test sketch:**

```typescript
// @vitest-environment happy-dom
describe('OpenQuestionsPanel', () => {
  it('groups questions under section headers', () => {
    render(<OpenQuestionsPanel questions={questions} />)
    expect(screen.getByText('Auth')).toBeInTheDocument()
    expect(screen.getByText('Payments')).toBeInTheDocument()
  })

  it('shows open question count', () => {
    render(<OpenQuestionsPanel questions={questions} />)
    expect(screen.getByTestId('open-count')).toHaveTextContent('2')
  })

  it('shows empty state', () => {
    render(<OpenQuestionsPanel questions={[]} />)
    expect(screen.getByText(/no open questions/i)).toBeInTheDocument()
  })
})
```

**Files:**

- `src/components/canvas/OpenQuestionsPanel.tsx` — CREATE
- `src/components/canvas/OpenQuestionsPanel.test.tsx` — CREATE

**Blocked by:** 8
**Blocks:** 20

---

## Issue 19: Chat route accepts scope_build mode and loads open questions

**Type:** feature
**Context:** The chat route must accept `scope_build` as valid, load open questions for the prompt context, and use the correct tool set.
**Behavior to test:** When a POST arrives with `mode: 'scope_build'`, the route validates it, loads open questions, and builds the prompt correctly.
**Acceptance criteria:**

1. `chatRequestSchema` accepts `scope_build` in mode enum
2. When mode is `scope_build`, loads open questions via `listOpenOpenQuestions`
3. Open questions passed into `promptContext.openQuestions`
4. Uses `getToolsForMode('scope_build')` for tool selection

**Test sketch:**

```typescript
describe('POST /api/chat — scope_build mode', () => {
  it('accepts scope_build as a valid mode', () => {
    const result = chatRequestSchema.safeParse({
      projectId: 'proj-1',
      message: 'Build login flow',
      mode: 'scope_build',
      context: {
        projectId: 'proj-1',
        projectName: 'App',
        activeModuleId: 'mod-1',
        mode: 'scope_build',
        modules: [],
      },
    })
    expect(result.success).toBe(true)
  })
})
```

**Files:**

- `src/app/api/chat/route.ts` — MODIFY (update enum, add open question loading) [boundary: DB]
- `src/app/api/chat/route.test.ts` — MODIFY

**Blocked by:** 7, 12, 13
**Blocks:** 21

---

## Issue 20: ScopeWorkspace component

**Type:** feature
**Context:** Scope mode has a fundamentally different layout from architecture mode — no module sidebar, flat canvas, bottom drawer for open questions. Instead of bloating ProjectWorkspace with conditionals, scope gets its own component. The project page routes to ScopeWorkspace or ProjectWorkspace based on project mode.
**Behavior to test:** When a ScopeWorkspace is rendered, it shows a full-width canvas with the assistant chat and an OpenQuestionsPanel bottom drawer, without a module sidebar.
**Acceptance criteria:**

1. No module sidebar rendered
2. No "Add module" button
3. Canvas takes full width
4. Includes the assistant chat panel (same as ProjectWorkspace)
5. Includes the OpenQuestionsPanel as a bottom drawer
6. Accepts same initial data props as ProjectWorkspace (modules, nodes, edges, connections, messages, openQuestions)

**Test sketch:**

```typescript
describe('ScopeWorkspace', () => {
  it('does not render module sidebar', () => {
    render(<ScopeWorkspace project={{ ...proj, mode: 'scope' }} ... />)
    expect(screen.queryByTestId('module-sidebar')).not.toBeInTheDocument()
  })

  it('renders the canvas panel', () => {
    render(<ScopeWorkspace project={{ ...proj, mode: 'scope' }} ... />)
    expect(screen.getByTestId('canvas-panel')).toBeInTheDocument()
  })

  it('renders the open questions drawer', () => {
    render(<ScopeWorkspace project={{ ...proj, mode: 'scope' }} ... />)
    expect(screen.getByTestId('open-questions-panel')).toBeInTheDocument()
  })
})
```

**Files:**

- `src/components/dashboard/scope-workspace.tsx` — CREATE
- `src/components/dashboard/scope-workspace.test.tsx` — CREATE

**Blocked by:** 6, 18
**Blocks:** 21, 22, 23

---

## Issue 21: ScopeWorkspace sends scope_build mode in chat

**Type:** feature
**Context:** ScopeWorkspace must always send `mode: 'scope_build'` in chat requests instead of the discovery/module_map/module_detail routing used by ProjectWorkspace.
**Behavior to test:** When a chat message is sent in ScopeWorkspace, the fetch includes `mode: 'scope_build'`.
**Acceptance criteria:**

1. ScopeWorkspace always sends `mode: 'scope_build'`
2. ProjectWorkspace still uses existing mode logic (no regression)

**Test sketch:**

```typescript
describe('ScopeWorkspace — chat mode', () => {
  it('sends scope_build mode in chat request', async () => {
    // Trigger handleSend in ScopeWorkspace
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.mode).toBe('scope_build')
  })
})
```

**Files:**

- `src/components/dashboard/scope-workspace.tsx` — MODIFY (handleSend always uses scope_build)

**Blocked by:** 19, 20
**Blocks:** 22

---

## Issue 22: Promote-to-architecture button triggers mode change

**Type:** feature
**Context:** Once scoping is complete, the user clicks a button to graduate the project to architecture mode. This updates the mode field, refreshes to show the architecture layout (with module sidebar), and sends an initial AI message that reviews the scope content and proposes breaking it into proper modules (Map phase). The AI re-interview is the key differentiator — promotion isn't just a layout change, it's the bridge from scoping to structured architecture.
**Behavior to test:** When "Promote to Architecture" is clicked, the project mode updates, the page refreshes to architecture layout, and an AI message is sent to kick off module decomposition from the scope.
**Acceptance criteria:**

1. Button visible only in scope mode
2. Clicking calls `updateProject(id, { mode: 'architecture' })`
3. After mode update, sends an automatic AI message (e.g. "Review the scope flowchart and propose breaking it into modules") to kick off the Map phase
4. Page refreshes to show the architecture layout with module sidebar
5. Button shows loading state during the update
6. Not visible in architecture mode

**Test sketch:**

```typescript
describe('Promote to Architecture', () => {
  it('is visible in scope mode', () => {
    render(<ScopeWorkspace project={{ ...proj, mode: 'scope' }} ... />)
    expect(screen.getByRole('button', { name: /promote to architecture/i })).toBeInTheDocument()
  })

  it('calls updateProject with architecture mode on click', async () => {
    mockUpdateProject.mockResolvedValue({ success: true, data: { ...proj, mode: 'architecture' } })
    render(<ScopeWorkspace project={{ ...proj, mode: 'scope' }} ... />)
    await user.click(screen.getByRole('button', { name: /promote to architecture/i }))
    expect(mockUpdateProject).toHaveBeenCalledWith('p1', { mode: 'architecture' })
  })
})
```

**Files:**

- `src/components/dashboard/scope-workspace.tsx` — MODIFY (add button + handler)

**Blocked by:** 21
**Blocks:** none

---

## Issue 23: Project page routes to ScopeWorkspace or ProjectWorkspace

**Type:** feature
**Context:** The project page (`[projectId]/page.tsx`) currently always renders ProjectWorkspace. It needs to check the project's mode and render ScopeWorkspace for scope projects, ProjectWorkspace for architecture projects.
**Behavior to test:** When the project page loads a scope project, it renders ScopeWorkspace; for architecture, it renders ProjectWorkspace.
**Acceptance criteria:**

1. Scope mode projects render `<ScopeWorkspace />`
2. Architecture mode projects render `<ProjectWorkspace />`
3. Both receive the same initial data (modules, nodes, edges, connections, messages)
4. Scope workspace also receives initial open questions

**Test sketch:**

```typescript
describe('ProjectPage — mode routing', () => {
  it('renders ScopeWorkspace for scope projects', async () => {
    mockGetProjectById.mockResolvedValue({ success: true, data: { ...project, mode: 'scope' } })
    const page = await ProjectPage({ params: Promise.resolve({ projectId: 'p1' }) })
    // Verify ScopeWorkspace is rendered
  })

  it('renders ProjectWorkspace for architecture projects', async () => {
    mockGetProjectById.mockResolvedValue({
      success: true,
      data: { ...project, mode: 'architecture' },
    })
    const page = await ProjectPage({ params: Promise.resolve({ projectId: 'p1' }) })
    // Verify ProjectWorkspace is rendered
  })
})
```

**Files:**

- `src/app/(dashboard)/dashboard/[projectId]/page.tsx` — MODIFY (add mode check + ScopeWorkspace import)
- `src/app/(dashboard)/dashboard/[projectId]/page.test.tsx` — MODIFY

**Blocked by:** 20
**Blocks:** none

---

## Issue 24: Auto-create hidden scope module at project creation

**Type:** feature
**Context:** Scope mode uses a single invisible module as a container for the flowchart nodes. This module must be auto-created when a scope project is created so the AI has a moduleId to work with from the first message. The module is hidden from the user — they never see a module sidebar in scope mode.
**Behavior to test:** When a scope project is created, a default "Scope" module is automatically created in the same transaction/flow.
**Acceptance criteria:**

1. When `createProject` is called with `mode: 'scope'`, a module named "Scope" is auto-created for the project
2. The module has empty entry_points and exit_points (not needed in scope mode)
3. Architecture mode projects do NOT auto-create a module
4. The auto-created module ID is available for the workspace to use as activeModuleId

**Test sketch:**

```typescript
describe('createProject — auto scope module', () => {
  it('creates a Scope module when mode is scope', async () => {
    mockSingle.mockResolvedValueOnce({ data: scopeProject, error: null }) // project insert
    mockSingle.mockResolvedValueOnce({ data: scopeModule, error: null }) // module insert

    const result = await createProject({ name: 'Call', mode: 'scope' })
    expect(result.success).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('modules')
  })

  it('does NOT create a module when mode is architecture', async () => {
    mockSingle.mockResolvedValue({ data: archProject, error: null })
    await createProject({ name: 'Build', mode: 'architecture' })
    expect(mockFrom).not.toHaveBeenCalledWith('modules')
  })
})
```

**Files:**

- `src/lib/services/project-service.ts` — MODIFY (add auto-module creation in createProject) [boundary: DB]
- `src/lib/services/project-service.test.ts` — MODIFY

**Blocked by:** 6
**Blocks:** 23

---

## Issue 25: Load initial open questions on project page

**Type:** feature
**Context:** When a user navigates to a scope project, the page SSR needs to fetch open questions and pass them as initial data to ScopeWorkspace — the same way it currently fetches modules, nodes, edges, and messages. Without this, the OpenQuestionsPanel starts empty on page load.
**Behavior to test:** When the project page loads a scope project, it fetches open questions and passes them as `initialOpenQuestions` to ScopeWorkspace.
**Acceptance criteria:**

1. Project page calls `listOpenQuestions(projectId)` for scope projects
2. Results passed as `initialOpenQuestions` prop to ScopeWorkspace
3. Architecture projects do NOT fetch open questions (unnecessary)

**Test sketch:**

```typescript
describe('ProjectPage — open questions loading', () => {
  it('fetches open questions for scope projects', async () => {
    mockGetProjectById.mockResolvedValue({ success: true, data: { ...project, mode: 'scope' } })
    mockListOpenQuestions.mockResolvedValue({ success: true, data: mockQuestions })
    const page = await ProjectPage({ params: Promise.resolve({ projectId: 'p1' }) })
    expect(mockListOpenQuestions).toHaveBeenCalledWith('p1')
  })
})
```

**Files:**

- `src/app/(dashboard)/dashboard/[projectId]/page.tsx` — MODIFY (add open questions fetch)
- `src/app/(dashboard)/dashboard/[projectId]/page.test.tsx` — MODIFY

**Blocked by:** 7, 23
**Blocks:** none

---

## Issue 26: Layout engine question node dimensions

**Type:** feature
**Context:** The canvas layout engine (`getFlowDetailNodeDimensions` in layout.ts) needs to know the dimensions of question nodes so ELK can position them correctly. Question nodes use the same 260px width as ProcessNode.
**Behavior to test:** When `getFlowDetailNodeDimensions('question')` is called, it returns dimensions matching ProcessNode.
**Acceptance criteria:**

1. Returns `{ width: 260, height: <same as process> }` for `'question'` node type
2. Layout correctly positions question nodes alongside other node types
3. Existing node type dimensions unchanged

**Test sketch:**

```typescript
describe('getFlowDetailNodeDimensions — question', () => {
  it('returns same dimensions as process nodes', () => {
    const questionDims = getFlowDetailNodeDimensions('question')
    const processDims = getFlowDetailNodeDimensions('process')
    expect(questionDims.width).toBe(260)
    expect(questionDims.width).toBe(processDims.width)
  })
})
```

**Files:**

- `src/lib/canvas/layout.ts` — MODIFY (add question case)
- `src/lib/canvas/layout.test.ts` — MODIFY

**Blocked by:** 2
**Blocks:** none

---

## Issue 27: Supabase migration — add `mode` column and `open_questions` table

**Type:** feature
**Context:** The database must be updated to support the new `mode` column on `projects` and the new `open_questions` table. Migration runs last to lock in the schema after all type/service work is finalized.
**Behavior to test:** The migration SQL is valid and the generated types include the new structures.
**Acceptance criteria:**

1. `projects.mode` column: text, default `'architecture'`, CHECK `('scope', 'architecture')`
2. `open_questions` table: id (uuid PK), project_id (FK cascade), node_id (FK cascade), section, question, status (default `'open'`, CHECK), resolution (nullable), created_at, resolved_at (nullable)
3. RLS enabled on `open_questions` scoped to project ownership
4. `database.ts` regenerated with new types
5. Existing rows get `mode = 'architecture'` (backward compat)

**Test sketch:**

```typescript
// Type-level compile-time assertions after regeneration:
import type { Tables } from '@/types/database'

type ProjectRow = Tables<'projects'>
const _mode: ProjectRow['mode'] = 'scope' // must compile

type OQRow = Tables<'open_questions'>
const _status: OQRow['status'] = 'open' // must compile
const _res: OQRow['resolution'] = null // must compile (nullable)
```

**Files:**

- `supabase/migrations/YYYYMMDDHHMMSS_add_scoping_mode.sql` — CREATE [boundary: DB]
- `src/types/database.ts` — MODIFY (regenerated)

**Blocked by:** 1, 2, 3, 6, 7, 24
**Blocks:** none
