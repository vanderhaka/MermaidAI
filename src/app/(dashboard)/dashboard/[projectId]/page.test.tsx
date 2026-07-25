// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks ---

class NotFoundError extends Error {
  constructor() {
    super('NEXT_NOT_FOUND')
  }
}

const mockNotFound = vi.fn(() => {
  throw new NotFoundError()
})
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}))

const mockGetProjectById = vi.fn()
vi.mock('@/lib/services/project-service', () => ({
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
}))

const mockListModulesByProject = vi.fn()
vi.mock('@/lib/services/module-service', () => ({
  listModulesByProject: (...args: unknown[]) => mockListModulesByProject(...args),
}))

const mockListChatMessages = vi.fn()
vi.mock('@/lib/services/chat-message-service', () => ({
  listChatMessages: (...args: unknown[]) => mockListChatMessages(...args),
}))

const mockListConnectionsByProject = vi.fn()
vi.mock('@/lib/services/module-connection-service', () => ({
  listConnectionsByProject: (...args: unknown[]) => mockListConnectionsByProject(...args),
}))

const mockEnsureDefaultModuleGraph = vi.fn()
vi.mock('@/lib/services/graph-service', () => ({
  ensureDefaultModuleGraph: (...args: unknown[]) => mockEnsureDefaultModuleGraph(...args),
}))

const mockListOpenQuestions = vi.fn()
vi.mock('@/lib/services/open-question-service', () => ({
  listOpenQuestions: (...args: unknown[]) => mockListOpenQuestions(...args),
}))

vi.mock('@/lib/services/requirement-service', () => ({
  listRequirements: vi.fn(() => Promise.resolve({ success: true, data: [] })),
}))

vi.mock('@/lib/services/requirement-link-service', () => ({
  listRequirementLinks: vi.fn(() => Promise.resolve({ success: true, data: [] })),
  listRequirementNodes: vi.fn(() => Promise.resolve({ success: true, data: [] })),
}))

vi.mock('server-only', () => ({}))

const mockProjectWorkspace = vi.fn((_props: unknown) => null)
const mockProjectWorkspaceComponent = (props: unknown) => mockProjectWorkspace(props)
vi.mock('@/components/dashboard/project-workspace', () => ({
  ProjectWorkspace: mockProjectWorkspaceComponent,
}))

const mockScopeWorkspace = vi.fn((_props: unknown) => null)
const mockScopeWorkspaceComponent = (props: unknown) => mockScopeWorkspace(props)
vi.mock('@/components/dashboard/scope-workspace', () => ({
  ScopeWorkspace: mockScopeWorkspaceComponent,
}))

// --- Helpers ---

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const DEFAULT_MODULE = {
  id: 'mod-scope',
  project_id: VALID_UUID,
  domain: null,
  name: 'Scope',
  description: null,
  prd_content: '',
  position: { x: 0, y: 0 },
  color: '#F59E0B',
  entry_points: [],
  exit_points: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function makeParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) }
}

// --- Tests ---

describe('ProjectPage UUID validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: services return success so non-UUID tests isolate the guard
    mockGetProjectById.mockResolvedValue({
      success: true,
      data: {
        id: VALID_UUID,
        name: 'Test',
        description: null,
        mode: 'architecture',
        created_at: '2026-01-01T00:00:00Z',
      },
    })
    mockListModulesByProject.mockResolvedValue({ success: true, data: [] })
    mockListChatMessages.mockResolvedValue({ success: true, data: [] })
    mockListConnectionsByProject.mockResolvedValue({ success: true, data: [] })
    mockListOpenQuestions.mockResolvedValue({ success: true, data: [] })
    mockEnsureDefaultModuleGraph.mockResolvedValue({
      success: true,
      data: { nodes: [], edges: [] },
    })
  })

  it('calls notFound for a non-UUID string', async () => {
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    await expect(ProjectPage(makeParams('hello'))).rejects.toThrow(NotFoundError)
    expect(mockNotFound).toHaveBeenCalled()
    expect(mockGetProjectById).not.toHaveBeenCalled()
    expect(mockListModulesByProject).not.toHaveBeenCalled()
    expect(mockListChatMessages).not.toHaveBeenCalled()
    expect(mockListConnectionsByProject).not.toHaveBeenCalled()
  })

  it('calls notFound for a path-traversal string', async () => {
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    await expect(ProjectPage(makeParams('../admin'))).rejects.toThrow(NotFoundError)
    expect(mockNotFound).toHaveBeenCalled()
    expect(mockGetProjectById).not.toHaveBeenCalled()
  })

  it('calls notFound for an empty string', async () => {
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    await expect(ProjectPage(makeParams(''))).rejects.toThrow(NotFoundError)
    expect(mockNotFound).toHaveBeenCalled()
    expect(mockGetProjectById).not.toHaveBeenCalled()
  })

  it('proceeds to data fetching for a valid UUID v4', async () => {
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    await ProjectPage(makeParams(VALID_UUID))

    // notFound should NOT have been called for the UUID guard
    // (it may be called later if project not found, but services must be called)
    expect(mockGetProjectById).toHaveBeenCalledWith(VALID_UUID)
    expect(mockListModulesByProject).toHaveBeenCalledWith(VALID_UUID)
  })

  it('renders the scope workspace for scope projects', async () => {
    mockGetProjectById.mockResolvedValue({
      success: true,
      data: {
        id: VALID_UUID,
        name: 'Scope Project',
        description: null,
        mode: 'scope',
        created_at: '2026-01-01T00:00:00Z',
      },
    })
    mockListModulesByProject.mockResolvedValue({ success: true, data: [DEFAULT_MODULE] })
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    const result = await ProjectPage(makeParams(VALID_UUID))

    expect((result as { type: unknown }).type).toBe(mockScopeWorkspaceComponent)
    expect((result as { props: { initialModules: unknown } }).props.initialModules).toEqual([
      DEFAULT_MODULE,
    ])
  })

  it('renders the scope workspace for flowchart projects', async () => {
    const flowchartModule = {
      ...DEFAULT_MODULE,
      id: 'mod-flowchart',
      name: 'Marketing Flowchart',
      color: '#14B8A6',
    }
    mockGetProjectById.mockResolvedValue({
      success: true,
      data: {
        id: VALID_UUID,
        name: 'Flowchart Project',
        description: null,
        mode: 'flowchart',
        created_at: '2026-01-01T00:00:00Z',
      },
    })
    mockListModulesByProject.mockResolvedValue({ success: true, data: [flowchartModule] })
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    const result = await ProjectPage(makeParams(VALID_UUID))

    expect((result as { type: unknown }).type).toBe(mockScopeWorkspaceComponent)
    expect((result as { props: { initialModules: unknown } }).props.initialModules).toEqual([
      flowchartModule,
    ])
  })

  it('calls notFound for a single-canvas project without its required module', async () => {
    mockGetProjectById.mockResolvedValue({
      success: true,
      data: {
        id: VALID_UUID,
        name: 'Broken Flowchart Project',
        description: null,
        mode: 'flowchart',
        created_at: '2026-01-01T00:00:00Z',
      },
    })
    mockListModulesByProject.mockResolvedValue({ success: true, data: [] })
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    await expect(ProjectPage(makeParams(VALID_UUID))).rejects.toThrow(NotFoundError)
    expect(mockNotFound).toHaveBeenCalled()
    expect(mockScopeWorkspace).not.toHaveBeenCalled()
  })

  it('renders the project workspace for architecture projects', async () => {
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    const result = await ProjectPage(makeParams(VALID_UUID))

    expect((result as { type: unknown }).type).toBe(mockProjectWorkspaceComponent)
  })
})
