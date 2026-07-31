// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetGraphForModule = vi.fn()
const mockListConnectionsByProject = vi.fn()
const mockGetModuleById = vi.fn()
const mockListModulesByProject = vi.fn()
const mockLoadModuleNotesForChat = vi.fn()
const mockListOpenOpenQuestions = vi.fn()

vi.mock('@/lib/services/graph-service', () => ({
  getGraphForModule: mockGetGraphForModule,
}))
vi.mock('@/lib/services/module-connection-service', () => ({
  listConnectionsByProject: mockListConnectionsByProject,
}))
vi.mock('@/lib/services/module-service', () => ({
  getModuleById: mockGetModuleById,
  listModulesByProject: mockListModulesByProject,
}))
vi.mock('@/lib/module-notes/load-for-prompt', () => ({
  loadModuleNotesForChat: mockLoadModuleNotesForChat,
}))
vi.mock('@/lib/services/open-question-service', () => ({
  listOpenOpenQuestions: mockListOpenOpenQuestions,
}))

const projectId = '550e8400-e29b-41d4-a716-446655440000'
const moduleId = '660e8400-e29b-41d4-a716-446655440001'

const moduleRow = { id: moduleId, name: 'Scope', project_id: projectId }
const graphData = { nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] }

describe('loadChatPromptContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListModulesByProject.mockResolvedValue({ success: true, data: [moduleRow] })
    mockListConnectionsByProject.mockResolvedValue({ success: true, data: [] })
    mockListOpenOpenQuestions.mockResolvedValue({ success: true, data: [] })
    mockGetModuleById.mockResolvedValue({ success: true, data: moduleRow })
    mockGetGraphForModule.mockResolvedValue({ success: true, data: graphData })
    mockLoadModuleNotesForChat.mockResolvedValue({ source: 'none', markdown: null })
  })

  it('loads modules, connections, and open questions independently', async () => {
    const { loadChatPromptContext } = await import('@/lib/services/chat-context-loader')

    const result = await loadChatPromptContext({
      projectId,
      projectName: 'Test Project',
      mode: 'discovery',
      activeModuleId: null,
    })

    expect(result.projectName).toBe('Test Project')
    expect(result.modules).toEqual([moduleRow])
    expect(result.connections).toEqual([])
    expect(result.openQuestions).toEqual([])
    expect(mockListModulesByProject).toHaveBeenCalledWith(projectId)
    expect(mockListConnectionsByProject).toHaveBeenCalledWith(projectId)
    expect(mockListOpenOpenQuestions).toHaveBeenCalledWith(projectId)
  })

  it('loads module and graph in parallel, then chains module notes', async () => {
    const { loadChatPromptContext } = await import('@/lib/services/chat-context-loader')

    const result = await loadChatPromptContext({
      projectId,
      projectName: 'Test Project',
      mode: 'discovery',
      activeModuleId: moduleId,
    })

    expect(result.currentModule).toEqual(moduleRow)
    expect(result.nodes).toEqual(graphData.nodes)
    expect(result.edges).toEqual(graphData.edges)
    expect(result.moduleNotes).toEqual({ source: 'none', markdown: null })
    expect(mockGetModuleById).toHaveBeenCalledWith(moduleId)
    expect(mockGetGraphForModule).toHaveBeenCalledWith(moduleId)
    expect(mockLoadModuleNotesForChat).toHaveBeenCalledWith(moduleRow.name)
  })

  it('skips module notes when module lookup fails', async () => {
    mockGetModuleById.mockResolvedValue({ success: false, error: 'not found' })

    const { loadChatPromptContext } = await import('@/lib/services/chat-context-loader')

    const result = await loadChatPromptContext({
      projectId,
      projectName: 'Test Project',
      mode: 'discovery',
      activeModuleId: moduleId,
    })

    expect(result.currentModule).toBeUndefined()
    expect(mockLoadModuleNotesForChat).not.toHaveBeenCalled()
    expect(result.nodes).toEqual(graphData.nodes)
  })

  it('resolves scope module graph in module_map mode without an active module', async () => {
    const { loadChatPromptContext } = await import('@/lib/services/chat-context-loader')

    const result = await loadChatPromptContext({
      projectId,
      projectName: 'Test Project',
      mode: 'module_map',
      activeModuleId: null,
    })

    expect(result.scopeNodes).toEqual(graphData.nodes)
    expect(result.scopeEdges).toEqual(graphData.edges)
    expect(mockGetGraphForModule).toHaveBeenCalledWith(moduleId)
  })

  it('includes resolvingOpenQuestion when provided', async () => {
    const { loadChatPromptContext } = await import('@/lib/services/chat-context-loader')
    const resolvingOpenQuestion = {
      id: 'q1',
      section: 'scope',
      question: 'What?',
    } as never

    const result = await loadChatPromptContext({
      projectId,
      projectName: 'Test Project',
      mode: 'discovery',
      activeModuleId: null,
      resolvingOpenQuestion,
    })

    expect(result.resolvingOpenQuestion).toEqual(resolvingOpenQuestion)
  })
})
