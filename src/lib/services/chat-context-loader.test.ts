// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetGraphForModule = vi.fn()
const mockListConnectionsByProject = vi.fn()
const mockGetModuleById = vi.fn()
const mockListModulesByProject = vi.fn()
const mockLoadModuleNotesForChat = vi.fn()
const mockListOpenOpenQuestions = vi.fn()
const mockGetPlanningState = vi.fn()
const mockGetActivePlanningArtifactVersion = vi.fn()
const mockListPlanningDecisions = vi.fn()
const mockGetLatestArchitectureReadinessReport = vi.fn()

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
vi.mock('@/lib/services/planning-state-service', () => ({
  getPlanningState: mockGetPlanningState,
}))
vi.mock('@/lib/services/planning-artifact-service', () => ({
  getActivePlanningArtifactVersion: mockGetActivePlanningArtifactVersion,
}))
vi.mock('@/lib/services/planning-decision-service', () => ({
  listPlanningDecisions: mockListPlanningDecisions,
}))
vi.mock('@/lib/services/architecture-readiness', () => ({
  getLatestArchitectureReadinessReport: mockGetLatestArchitectureReadinessReport,
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
    mockGetPlanningState.mockResolvedValue({ success: true, data: null })
    mockGetActivePlanningArtifactVersion.mockResolvedValue({ success: true, data: null })
    mockListPlanningDecisions.mockResolvedValue({ success: true, data: [] })
    mockGetLatestArchitectureReadinessReport.mockResolvedValue({ success: true, data: null })
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

  it('loads exact durable Architecture truth and preserves question readiness metadata', async () => {
    const versionId = '77777777-7777-4777-8777-777777777777'
    const planningState = {
      project_id: projectId,
      readiness_state: 'ready',
      auto_decide_enabled: true,
      write_safety_revision: 6,
    }
    const architectureVersion = {
      id: versionId,
      version: 2,
      content_hash: 'hash',
      content_state: 'complete',
      content: {
        objective: 'Book appointments.',
        outcomes: [],
        actors: [],
        capabilities: [],
        connections: [],
        important_flows: [],
        assumptions: [],
        blockers: [],
      },
    }
    const question = {
      id: '88888888-8888-4888-8888-888888888888',
      section: 'notifications',
      question: 'Which channel?',
      status: 'open',
      resolution: null,
      artifact_version_id: versionId,
      planning_decision_id: null,
      readiness_impact: 'deferred',
      provenance: 'assistant',
    }
    mockGetPlanningState.mockResolvedValue({ success: true, data: planningState })
    mockGetActivePlanningArtifactVersion.mockResolvedValue({
      success: true,
      data: architectureVersion,
    })
    mockListPlanningDecisions.mockResolvedValue({ success: true, data: [] })
    mockListOpenOpenQuestions.mockResolvedValue({ success: true, data: [question] })

    const { loadChatPromptContext } = await import('@/lib/services/chat-context-loader')
    const result = await loadChatPromptContext({
      projectId,
      projectName: 'Test Project',
      mode: 'discovery',
      activeModuleId: null,
    })

    expect(result.helperMode).toBe(true)
    expect(result.openQuestions).toEqual([question])
    expect(result.planningTruthSection).toContain(`Architecture version: v2 (${versionId})`)
    expect(mockGetLatestArchitectureReadinessReport).toHaveBeenCalledWith(projectId, versionId)
  })

  it('does not expose a partial truth section when a planning dependency fails', async () => {
    mockGetPlanningState.mockResolvedValue({ success: true, data: { auto_decide_enabled: true } })
    mockGetActivePlanningArtifactVersion.mockResolvedValue({
      success: false,
      error: 'database down',
    })

    const { loadChatPromptContext } = await import('@/lib/services/chat-context-loader')
    const result = await loadChatPromptContext({
      projectId,
      projectName: 'Test Project',
      mode: 'discovery',
      activeModuleId: null,
    })

    expect(result.planningTruthSection).toBeUndefined()
  })
})
