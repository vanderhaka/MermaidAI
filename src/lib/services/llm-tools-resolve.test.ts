// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockResolveOpenQuestion, mockCreateRequirement, mockRemoveNode } = vi.hoisted(() => ({
  mockResolveOpenQuestion: vi.fn(),
  mockCreateRequirement: vi.fn(),
  mockRemoveNode: vi.fn(),
}))

vi.mock('@/lib/services/open-question-service', () => ({
  createOpenQuestion: vi.fn(),
  resolveOpenQuestion: mockResolveOpenQuestion,
  listOpenQuestions: vi.fn(),
}))
vi.mock('@/lib/services/requirement-service', () => ({
  createRequirement: mockCreateRequirement,
}))
vi.mock('@/lib/services/graph-service', () => ({
  addNode: vi.fn(),
  updateNode: vi.fn(),
  removeNode: mockRemoveNode,
  addEdge: vi.fn(),
  removeEdge: vi.fn(),
  getGraphForModule: vi.fn(),
}))
vi.mock('@/lib/services/module-service', () => ({
  createModule: vi.fn(),
  updateModule: vi.fn(),
  deleteModule: vi.fn(),
  getModuleById: vi.fn(),
}))
vi.mock('@/lib/services/module-connection-service', () => ({ connectModules: vi.fn() }))
vi.mock('@/lib/services/doc-lookup-service', () => ({ lookupDocumentation: vi.fn() }))
vi.mock('@/lib/services/project-service', () => ({ updateProject: vi.fn() }))
vi.mock('server-only', () => ({}))

import { createToolExecutor } from '@/lib/services/llm-tools'

const PROJECT_ID = 'project-1'

const resolvedQuestion = {
  id: 'oq-1',
  project_id: PROJECT_ID,
  module_id: 'module-1',
  node_id: 'question-node-1',
  section: 'Payments',
  question: 'Do we retry a declined card automatically?',
  status: 'resolved' as const,
  resolution: 'Retry once, then show the decline message.',
  coverage_area: null,
  created_at: '2026-01-01T00:00:00Z',
  resolved_at: '2026-01-01T00:05:00Z',
}

describe('resolve_open_question — the answer is promoted, not destroyed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveOpenQuestion.mockResolvedValue({ success: true, data: resolvedQuestion })
    mockCreateRequirement.mockResolvedValue({
      success: true,
      data: { id: 'req-1', statement: resolvedQuestion.resolution, status: 'agreed' },
    })
    mockRemoveNode.mockResolvedValue({ success: true, data: null })
  })

  it('creates an agreed requirement carrying the resolution text', async () => {
    const execute = createToolExecutor(PROJECT_ID)

    await execute('resolve_open_question', {
      questionId: 'oq-1',
      resolution: resolvedQuestion.resolution,
    })

    expect(mockCreateRequirement).toHaveBeenCalledTimes(1)
    expect(mockCreateRequirement).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: PROJECT_ID,
        module_id: 'module-1',
        statement: resolvedQuestion.resolution,
        status: 'agreed',
        source_question_id: 'oq-1',
      }),
    )
  })

  it('promotes before removing the marker node, so the answer cannot be lost', async () => {
    const order: string[] = []
    mockCreateRequirement.mockImplementation(async () => {
      order.push('createRequirement')
      return { success: true, data: { id: 'req-1' } }
    })
    mockRemoveNode.mockImplementation(async () => {
      order.push('removeNode')
      return { success: true, data: null }
    })

    const execute = createToolExecutor(PROJECT_ID)
    await execute('resolve_open_question', { questionId: 'oq-1', resolution: 'Retry once.' })

    expect(order).toEqual(['createRequirement', 'removeNode'])
  })

  it('still removes the marker node from the canvas', async () => {
    const execute = createToolExecutor(PROJECT_ID)

    await execute('resolve_open_question', { questionId: 'oq-1', resolution: 'Retry once.' })

    expect(mockRemoveNode).toHaveBeenCalledWith('question-node-1')
  })

  it('does not call removeNode when the marker is already gone', async () => {
    mockResolveOpenQuestion.mockResolvedValue({
      success: true,
      data: { ...resolvedQuestion, node_id: null },
    })

    const execute = createToolExecutor(PROJECT_ID)
    await execute('resolve_open_question', { questionId: 'oq-1', resolution: 'Retry once.' })

    expect(mockRemoveNode).not.toHaveBeenCalled()
  })

  it('returns the created requirement to the client', async () => {
    const execute = createToolExecutor(PROJECT_ID)

    const result = await execute('resolve_open_question', {
      questionId: 'oq-1',
      resolution: 'Retry once.',
    })

    expect(result.isError).toBe(false)
    expect(result.data?.requirement).toBeDefined()
  })

  it('falls back to the question section when no coverage area is set', async () => {
    const execute = createToolExecutor(PROJECT_ID)

    await execute('resolve_open_question', { questionId: 'oq-1', resolution: 'Retry once.' })

    expect(mockCreateRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ coverage_area: 'Payments' }),
    )
  })
})
