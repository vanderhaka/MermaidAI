// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockResolveOpenQuestion = vi.fn()
const mockRemoveNode = vi.fn()
const mockAddNode = vi.fn()
const mockUpdateNode = vi.fn()
const mockAddEdge = vi.fn()
const mockGetGraphForModule = vi.fn()

vi.mock('@/lib/services/open-question-service', () => ({
  createOpenQuestion: vi.fn(),
  resolveOpenQuestion: (...args: unknown[]) => mockResolveOpenQuestion(...args),
}))

vi.mock('@/lib/services/graph-service', () => ({
  addNode: (...args: unknown[]) => mockAddNode(...args),
  updateNode: (...args: unknown[]) => mockUpdateNode(...args),
  removeNode: (...args: unknown[]) => mockRemoveNode(...args),
  addEdge: (...args: unknown[]) => mockAddEdge(...args),
  removeEdge: vi.fn(),
  getGraphForModule: (...args: unknown[]) => mockGetGraphForModule(...args),
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
