// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockResolveOpenQuestion = vi.fn()
const mockCreateOpenQuestion = vi.fn()
const mockListOpenQuestions = vi.fn()
const mockRemoveNode = vi.fn()
const mockAddNode = vi.fn()
const mockUpdateNode = vi.fn()
const mockAddEdge = vi.fn()
const mockRemoveEdge = vi.fn()
const mockGetGraphForModule = vi.fn()
const mockUpdateProject = vi.fn()

vi.mock('@/lib/services/open-question-service', () => ({
  createOpenQuestion: (...args: unknown[]) => mockCreateOpenQuestion(...args),
  resolveOpenQuestion: (...args: unknown[]) => mockResolveOpenQuestion(...args),
  listOpenQuestions: (...args: unknown[]) => mockListOpenQuestions(...args),
}))

vi.mock('@/lib/services/graph-service', () => ({
  addNode: (...args: unknown[]) => mockAddNode(...args),
  updateNode: (...args: unknown[]) => mockUpdateNode(...args),
  removeNode: (...args: unknown[]) => mockRemoveNode(...args),
  addEdge: (...args: unknown[]) => mockAddEdge(...args),
  removeEdge: (...args: unknown[]) => mockRemoveEdge(...args),
  getGraphForModule: (...args: unknown[]) => mockGetGraphForModule(...args),
}))

vi.mock('@/lib/services/project-service', () => ({
  updateProject: (...args: unknown[]) => mockUpdateProject(...args),
}))

import {
  addOpenQuestionsTool,
  createToolExecutor,
  getToolsForMode,
  resolveOpenQuestionTool,
} from '@/lib/services/llm-tools'

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveOpenQuestion.mockResolvedValue({
    success: true,
    data: {
      id: 'oq-cart-editing',
      node_id: 'question-node-1',
      resolution: 'Users can edit items before checkout.',
    },
  })
  mockRemoveNode.mockResolvedValue({ success: true, data: null })
  mockGetGraphForModule.mockResolvedValue({ success: true, data: { nodes: [], edges: [] } })
})

describe('add_open_questions tool definition', () => {
  it('has the correct name', () => {
    expect(addOpenQuestionsTool.name).toBe('add_open_questions')
  })

  it('has correct required params', () => {
    expect(addOpenQuestionsTool.input_schema.required).toEqual(['moduleId', 'questions'])
  })

  it('has questions array with correct item schema', () => {
    const props = addOpenQuestionsTool.input_schema.properties as Record<
      string,
      Record<string, unknown>
    >
    expect(props.questions.type).toBe('array')

    const items = props.questions.items as Record<string, unknown>
    expect(items.type).toBe('object')
    expect(items.required).toEqual(['section', 'question'])

    const itemProps = items.properties as Record<string, { type: string }>
    expect(itemProps.section.type).toBe('string')
    expect(itemProps.question.type).toBe('string')
    expect(itemProps.relatedNodeId.type).toBe('string')
  })

  it('has a description', () => {
    expect(addOpenQuestionsTool.description).toBeTruthy()
  })
})

describe('resolve_open_question tool definition', () => {
  it('has the correct name', () => {
    expect(resolveOpenQuestionTool.name).toBe('resolve_open_question')
  })

  it('has correct required params', () => {
    expect(resolveOpenQuestionTool.input_schema.required).toEqual(['questionId', 'resolution'])
  })

  it('has a description', () => {
    expect(resolveOpenQuestionTool.description).toBeTruthy()
  })
})

describe('flowchart_build tools', () => {
  it('exposes only flowchart-safe tools', () => {
    const flowchartTools = getToolsForMode('flowchart_build').map((tool) => tool.name)

    expect(flowchartTools).toEqual([
      'create_node',
      'update_node',
      'delete_node',
      'create_edge',
      'delete_edge',
      'insert_node_between',
      'write_prd',
    ])
  })

  it('does not expose scope or architecture-only capabilities', () => {
    const flowchartTools = getToolsForMode('flowchart_build').map((tool) => tool.name)

    expect(flowchartTools).not.toEqual(
      expect.arrayContaining([
        'add_open_questions',
        'resolve_open_question',
        'promote_project',
        'create_module',
        'update_module',
        'delete_module',
        'connect_modules',
        'lookup_docs',
      ]),
    )
  })
})

describe('existing mode tool scopes', () => {
  it('preserves scope build tools', () => {
    const scopeTools = getToolsForMode('scope_build').map((tool) => tool.name)

    expect(scopeTools).toEqual([
      'create_node',
      'update_node',
      'delete_node',
      'create_edge',
      'delete_edge',
      'insert_node_between',
      'add_open_questions',
      'resolve_open_question',
      'write_prd',
      'lookup_docs',
      'promote_project',
      'create_module',
      'update_module',
      'connect_modules',
    ])
  })

  it('exposes brainstorm tools without scope or architecture capabilities', () => {
    const brainstormTools = getToolsForMode('brainstorm_build').map((tool) => tool.name)

    expect(brainstormTools).toEqual([
      'create_node',
      'update_node',
      'delete_node',
      'create_edge',
      'delete_edge',
      'insert_node_between',
      'write_prd',
      'promote_project',
    ])
  })

  it('preserves architecture module-map and module-detail tools', () => {
    const moduleMapTools = getToolsForMode('module_map').map((tool) => tool.name)
    const moduleDetailTools = getToolsForMode('module_detail').map((tool) => tool.name)

    expect(moduleMapTools).toEqual([
      'create_module',
      'update_module',
      'delete_module',
      'connect_modules',
      'lookup_docs',
      'write_prd',
    ])
    expect(moduleDetailTools).toEqual([
      'create_node',
      'update_node',
      'delete_node',
      'create_edge',
      'delete_edge',
      'lookup_docs',
      'write_prd',
    ])
  })
})

describe('createToolExecutor selected open question guard', () => {
  it('blocks resolving a selected question when the latest message is only the drawer prompt', async () => {
    const executeTool = createToolExecutor('proj-1', {
      latestUserMessage:
        'Resolve this open question from Cart Management: "Can users edit cart items?"',
      resolvingOpenQuestion: {
        id: 'oq-cart-editing',
        section: 'Cart Management',
        question: 'Can users edit cart items?',
      },
    })

    const result = await executeTool('resolve_open_question', {
      questionId: 'oq-cart-editing',
      resolution: 'Users can edit items before checkout.',
    })

    expect(result.isError).toBe(true)
    expect(result.content).toContain('Cannot resolve')
    expect(mockResolveOpenQuestion).not.toHaveBeenCalled()
  })

  it('allows resolving a selected question when the latest message contains an answer', async () => {
    const executeTool = createToolExecutor('proj-1', {
      latestUserMessage: 'Yes, users can edit quantities and remove items before checkout.',
      resolvingOpenQuestion: {
        id: 'oq-cart-editing',
        section: 'Cart Management',
        question: 'Can users edit cart items?',
      },
    })

    const result = await executeTool('resolve_open_question', {
      questionId: 'oq-cart-editing',
      resolution: 'Users can edit items before checkout.',
    })

    expect(result.isError).toBe(false)
    expect(mockResolveOpenQuestion).toHaveBeenCalledWith(
      'oq-cart-editing',
      'Users can edit items before checkout.',
    )
  })
})

describe('createToolExecutor add_open_questions dedup', () => {
  const questionNode = {
    id: 'qnode-1',
    module_id: 'mod-1',
    node_type: 'question',
    label: 'q',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '#F59E0B',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  beforeEach(() => {
    mockAddNode.mockResolvedValue({ success: true, data: questionNode })
    mockCreateOpenQuestion.mockResolvedValue({ success: true, data: { id: 'oq-new' } })
  })

  it('skips questions that already exist, matching on normalized text', async () => {
    mockListOpenQuestions.mockResolvedValue({
      success: true,
      data: [
        { id: 'oq-1', question: 'What happens if the driver overstays past the booked time?' },
      ],
    })
    const executeTool = createToolExecutor('proj-1')

    const result = await executeTool('add_open_questions', {
      moduleId: 'mod-1',
      questions: [
        {
          section: 'Failure modes',
          question: 'What happens if the driver OVERSTAYS past the booked time??',
        },
        { section: 'Reviews', question: 'Do drivers and homeowners rate each other?' },
      ],
    })

    expect(result.isError).toBe(false)
    expect(mockAddNode).toHaveBeenCalledTimes(1)
    expect(result.content).toContain('Skipped 1 duplicate')
  })

  it('returns ok without adding anything when every question is a duplicate', async () => {
    mockListOpenQuestions.mockResolvedValue({
      success: true,
      data: [{ id: 'oq-1', question: 'Is there insurance coverage included?' }],
    })
    const executeTool = createToolExecutor('proj-1')

    const result = await executeTool('add_open_questions', {
      moduleId: 'mod-1',
      questions: [{ section: 'Liability', question: 'Is there insurance coverage included?' }],
    })

    expect(result.isError).toBe(false)
    expect(result.content).toContain('already exist')
    expect(mockAddNode).not.toHaveBeenCalled()
  })

  it('dedups identical questions within a single batch', async () => {
    mockListOpenQuestions.mockResolvedValue({ success: true, data: [] })
    const executeTool = createToolExecutor('proj-1')

    const result = await executeTool('add_open_questions', {
      moduleId: 'mod-1',
      questions: [
        { section: 'Payments', question: 'When is the card charged?' },
        { section: 'Payments', question: 'When is the card charged?' },
      ],
    })

    expect(result.isError).toBe(false)
    expect(mockAddNode).toHaveBeenCalledTimes(1)
  })
})

describe('createToolExecutor insert_node_between', () => {
  const baseNode = {
    module_id: 'mod-1',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
  const graphWithDirectEdge = {
    success: true,
    data: {
      nodes: [
        { ...baseNode, id: 'node-a', node_type: 'process', label: 'Send Quote' },
        { ...baseNode, id: 'node-b', node_type: 'process', label: 'Send Invoice' },
      ],
      edges: [
        {
          id: 'edge-ab',
          module_id: 'mod-1',
          source_node_id: 'node-a',
          target_node_id: 'node-b',
          label: 'approved',
          condition: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    },
  }

  beforeEach(() => {
    mockAddNode.mockResolvedValue({
      success: true,
      data: { ...baseNode, id: 'node-new', node_type: 'process', label: 'Review Quote' },
    })
    mockRemoveEdge.mockResolvedValue({ success: true, data: null })
    mockAddEdge
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'edge-in',
          module_id: 'mod-1',
          source_node_id: 'node-a',
          target_node_id: 'node-new',
          label: 'approved',
          condition: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'edge-out',
          module_id: 'mod-1',
          source_node_id: 'node-new',
          target_node_id: 'node-b',
          label: null,
          condition: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      })
  })

  it('splits an existing direct edge and rewires source → new → target', async () => {
    mockGetGraphForModule.mockResolvedValue(graphWithDirectEdge)
    const executeTool = createToolExecutor('proj-1')

    const result = await executeTool('insert_node_between', {
      moduleId: 'mod-1',
      sourceNodeId: 'node-a',
      targetNodeId: 'node-b',
      label: 'Review Quote',
      nodeType: 'process',
    })

    expect(result.isError).toBe(false)
    expect(mockRemoveEdge).toHaveBeenCalledWith('edge-ab')
    expect(mockAddEdge).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        source_node_id: 'node-a',
        target_node_id: 'node-new',
        label: 'approved',
      }),
    )
    expect(mockAddEdge).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ source_node_id: 'node-new', target_node_id: 'node-b' }),
    )
    expect(result.data).toEqual(
      expect.objectContaining({
        node: expect.objectContaining({ id: 'node-new' }),
        removedEdgeIds: ['edge-ab'],
        edges: [
          expect.objectContaining({ id: 'edge-in' }),
          expect.objectContaining({ id: 'edge-out' }),
        ],
      }),
    )
  })

  it('bridges two nodes without removing edges when no direct edge exists', async () => {
    mockGetGraphForModule.mockResolvedValue({
      success: true,
      data: { nodes: graphWithDirectEdge.data.nodes, edges: [] },
    })
    const executeTool = createToolExecutor('proj-1')

    const result = await executeTool('insert_node_between', {
      moduleId: 'mod-1',
      sourceNodeId: 'node-a',
      targetNodeId: 'node-b',
      label: 'Review Quote',
      nodeType: 'process',
    })

    expect(result.isError).toBe(false)
    expect(mockRemoveEdge).not.toHaveBeenCalled()
    expect(result.data?.removedEdgeIds).toEqual([])
  })

  it('fails with the known node list when a referenced node does not exist', async () => {
    mockGetGraphForModule.mockResolvedValue(graphWithDirectEdge)
    const executeTool = createToolExecutor('proj-1')

    const result = await executeTool('insert_node_between', {
      moduleId: 'mod-1',
      sourceNodeId: 'node-a',
      targetNodeId: 'node-missing',
      label: 'Review Quote',
      nodeType: 'process',
    })

    expect(result.isError).toBe(true)
    expect(result.content).toContain('node-missing')
    expect(result.content).toContain('Send Quote')
    expect(mockAddNode).not.toHaveBeenCalled()
  })
})

describe('createToolExecutor promote_project', () => {
  beforeEach(() => {
    mockUpdateProject.mockResolvedValue({ success: true, data: {} })
  })

  it('promotes to architecture by default', async () => {
    const executeTool = createToolExecutor('proj-1')
    const result = await executeTool('promote_project', {})

    expect(mockUpdateProject).toHaveBeenCalledWith('proj-1', { mode: 'architecture' })
    expect(result.data).toEqual({ promoted: true, mode: 'architecture' })
  })

  it('promotes to scope when requested', async () => {
    const executeTool = createToolExecutor('proj-1')
    const result = await executeTool('promote_project', { to: 'scope' })

    expect(mockUpdateProject).toHaveBeenCalledWith('proj-1', { mode: 'scope' })
    expect(result.data).toEqual({ promoted: true, mode: 'scope' })
  })
})

describe('createToolExecutor graph checks', () => {
  it('returns graph issue feedback after a graph edit leaves broken invariants', async () => {
    mockAddEdge.mockResolvedValue({
      success: true,
      data: {
        id: 'edge-start-cart',
        module_id: 'mod-1',
        source_node_id: 'start',
        target_node_id: 'cart',
        label: null,
        condition: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    })
    mockGetGraphForModule.mockResolvedValue({
      success: true,
      data: {
        nodes: [
          {
            id: 'start',
            module_id: 'mod-1',
            node_type: 'start',
            label: 'Start',
            pseudocode: '',
            position: { x: 0, y: 0 },
            color: '',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'cart',
            module_id: 'mod-1',
            node_type: 'process',
            label: 'View Cart',
            pseudocode: '',
            position: { x: 0, y: 0 },
            color: '',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'discount',
            module_id: 'mod-1',
            node_type: 'process',
            label: 'Enter Discount Code',
            pseudocode: '',
            position: { x: 0, y: 0 },
            color: '',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        edges: [
          {
            id: 'edge-start-cart',
            module_id: 'mod-1',
            source_node_id: 'start',
            target_node_id: 'cart',
            label: null,
            condition: null,
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    })

    const executeTool = createToolExecutor('proj-1')

    const result = await executeTool('create_edge', {
      moduleId: 'mod-1',
      sourceNodeId: 'start',
      targetNodeId: 'cart',
    })

    expect(result.isError).toBe(false)
    expect(result.content).toContain('Graph check:')
    expect(result.content).toContain('Repair before replying')
    expect(result.content).toContain('unreachable_node')
    expect(result.data?.graphIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unreachable_node',
          nodeId: 'discount',
        }),
      ]),
    )
  })
})
