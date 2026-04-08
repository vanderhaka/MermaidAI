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

vi.mock('server-only', () => ({}))

vi.mock('@/components/dashboard/project-workspace', () => ({
  ProjectWorkspace: () => null,
}))

vi.mock('@/components/dashboard/scope-workspace', () => ({
  ScopeWorkspace: () => null,
}))

// --- Helpers ---

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

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
      data: { id: VALID_UUID, name: 'Test', created_at: '2026-01-01T00:00:00Z' },
    })
    mockListModulesByProject.mockResolvedValue({ success: true, data: [] })
    mockListChatMessages.mockResolvedValue({ success: true, data: [] })
    mockListConnectionsByProject.mockResolvedValue({ success: true, data: [] })
    mockListOpenQuestions.mockResolvedValue({ success: true, data: [] })
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
})
