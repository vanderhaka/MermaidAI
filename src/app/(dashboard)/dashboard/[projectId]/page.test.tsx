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

const mockIsStagedPlanningRolloutEnabled = vi.fn(() => true)
vi.mock('@/lib/planning-feature', () => ({
  isStagedPlanningRolloutEnabled: () => mockIsStagedPlanningRolloutEnabled(),
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

const mockRecoverAbandonedChatChangeSets = vi.fn()
vi.mock('@/lib/services/change-set-service', () => ({
  recoverAbandonedChatChangeSets: (...args: unknown[]) =>
    mockRecoverAbandonedChatChangeSets(...args),
}))

const mockGetOrInitializePlanningState = vi.fn()
const mockGetPlanningState = vi.fn()
vi.mock('@/lib/services/planning-state-service', () => ({
  getOrInitializePlanningState: (...args: unknown[]) => mockGetOrInitializePlanningState(...args),
  getPlanningState: (...args: unknown[]) => mockGetPlanningState(...args),
}))

const mockGetActivePlanningArtifactVersion = vi.fn()
const mockGetPlanningArtifactVersion = vi.fn()
const mockGetPlanningArtifactStaleness = vi.fn()
vi.mock('@/lib/services/planning-artifact-service', () => ({
  getActivePlanningArtifactVersion: (...args: unknown[]) =>
    mockGetActivePlanningArtifactVersion(...args),
  getPlanningArtifactVersion: (...args: unknown[]) => mockGetPlanningArtifactVersion(...args),
  getPlanningArtifactStaleness: (...args: unknown[]) => mockGetPlanningArtifactStaleness(...args),
}))

const mockListPlanningDecisions = vi.fn()
vi.mock('@/lib/services/planning-decision-service', () => ({
  listPlanningDecisions: (...args: unknown[]) => mockListPlanningDecisions(...args),
}))

const mockEvaluateArchitectureReadiness = vi.fn()
const mockGetLatestArchitectureReadinessReport = vi.fn()
const mockPersistArchitectureReadinessReport = vi.fn()
vi.mock('@/lib/services/architecture-readiness', () => ({
  evaluateArchitectureReadiness: (...args: unknown[]) => mockEvaluateArchitectureReadiness(...args),
  getLatestArchitectureReadinessReport: (...args: unknown[]) =>
    mockGetLatestArchitectureReadinessReport(...args),
  persistArchitectureReadinessReport: (...args: unknown[]) =>
    mockPersistArchitectureReadinessReport(...args),
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

const mockWorkPlanWorkspace = vi.fn((_props: unknown) => null)
const mockWorkPlanWorkspaceComponent = (props: unknown) => mockWorkPlanWorkspace(props)
vi.mock('@/components/dashboard/work-plan-workspace', () => ({
  WorkPlanWorkspace: mockWorkPlanWorkspaceComponent,
}))

const mockExecutionHandoffWorkspace = vi.fn((_props: unknown) => null)
const mockExecutionHandoffWorkspaceComponent = (props: unknown) =>
  mockExecutionHandoffWorkspace(props)
vi.mock('@/components/dashboard/execution-handoff-workspace', () => ({
  ExecutionHandoffWorkspace: mockExecutionHandoffWorkspaceComponent,
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

function makePageInput(
  projectId: string,
  searchParams: { stage?: string; generate?: string } = {},
) {
  return {
    params: Promise.resolve({ projectId }),
    searchParams: Promise.resolve(searchParams),
  }
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
    mockRecoverAbandonedChatChangeSets.mockResolvedValue({
      success: true,
      data: { recoveredChangeSetIds: [] },
    })
    mockGetPlanningState.mockResolvedValue({ success: true, data: null })
    mockGetOrInitializePlanningState.mockResolvedValue({
      success: true,
      data: {
        project_id: VALID_UUID,
        stage: 'architecture',
        readiness_state: 'draft',
        auto_decide_enabled: true,
        staged_workflow_enabled: true,
        write_safety_revision: 4,
        active_architecture_artifact_id: '11111111-1111-4111-8111-111111111111',
        active_work_plan_artifact_id: null,
        active_execution_handoff_artifact_id: null,
        architecture_viewport: { x: 0, y: 0, zoom: 1 },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    })
    mockGetActivePlanningArtifactVersion.mockImplementation(
      async (_projectId: string, kind: string) => ({
        success: true,
        data:
          kind === 'architecture'
            ? {
                id: '22222222-2222-4222-8222-222222222222',
                artifact_id: '11111111-1111-4111-8111-111111111111',
                project_id: VALID_UUID,
                artifact_kind: 'architecture',
                version: 1,
                content_state: 'draft',
                content: null,
                content_hash: 'draft',
                request_key: null,
                request_hash: null,
                readiness_report: null,
                rendered_markdown: null,
                provenance: {},
                source_version_id: null,
                secondary_source_version_id: null,
                created_at: '2026-01-01T00:00:00Z',
              }
            : null,
      }),
    )
    mockGetPlanningArtifactStaleness.mockResolvedValue({
      success: true,
      data: { isStale: false, reasons: [] },
    })
    mockGetPlanningArtifactVersion.mockResolvedValue({ success: true, data: null })
    mockListConnectionsByProject.mockResolvedValue({ success: true, data: [] })
    mockListOpenQuestions.mockResolvedValue({ success: true, data: [] })
    mockListPlanningDecisions.mockResolvedValue({ success: true, data: [] })
    mockGetLatestArchitectureReadinessReport.mockResolvedValue({ success: true, data: null })
    mockPersistArchitectureReadinessReport.mockResolvedValue({ success: true, data: null })
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

  it('recovers aged unfinalized turns before loading Architecture chat identity', async () => {
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    const result = await ProjectPage(makeParams(VALID_UUID))

    expect(mockGetOrInitializePlanningState).toHaveBeenCalledWith(VALID_UUID)
    expect(mockRecoverAbandonedChatChangeSets).toHaveBeenCalledWith(VALID_UUID)
    expect(mockGetActivePlanningArtifactVersion).toHaveBeenCalledWith(VALID_UUID, 'architecture')
    expect((result as { props: { planningLink: unknown } }).props.planningLink).toEqual({
      stage: 'architecture',
      artifactId: '11111111-1111-4111-8111-111111111111',
      artifactVersionId: '22222222-2222-4222-8222-222222222222',
      expectedRevision: 4,
    })
    expect(
      (result as { props: { architecturePlanning: unknown } }).props.architecturePlanning,
    ).toEqual({
      expectedRevision: 4,
      autoDecideEnabled: true,
      version: {
        id: '22222222-2222-4222-8222-222222222222',
        artifactId: '11111111-1111-4111-8111-111111111111',
        version: 1,
        contentHash: 'draft',
        contentState: 'draft',
        content: null,
      },
      readinessReport: null,
      decisions: [],
    })
  })

  it('evaluates and persists readiness for the exact complete Architecture version', async () => {
    const content = {
      objective: 'Coordinate bookings.',
      outcomes: ['Customers receive a confirmed booking.'],
      actors: ['Customer'],
      capabilities: [],
      connections: [],
      important_flows: [],
      assumptions: [],
      blockers: [],
    }
    const readinessReport = {
      schemaVersion: 2,
      projectId: VALID_UUID,
      architectureVersionId: '22222222-2222-4222-8222-222222222222',
      architectureVersion: 2,
      architectureContentHash: 'hash-v2',
      evaluatedRevision: 4,
      state: 'draft',
      freshness: 'current',
      handoffEligible: false,
      checks: [],
      reasons: ['The capability map is incomplete.'],
      blockingQuestionIds: [],
      nonBlockingQuestionIds: [],
      deferredQuestionIds: [],
      proposedDecisionIds: [],
      acceptedDecisionIds: [],
      supersededDecisionIds: [],
      invalidInputIds: [],
      staleInputIds: [],
    }
    mockGetActivePlanningArtifactVersion.mockResolvedValueOnce({
      success: true,
      data: {
        id: '22222222-2222-4222-8222-222222222222',
        artifact_id: '11111111-1111-4111-8111-111111111111',
        project_id: VALID_UUID,
        artifact_kind: 'architecture',
        version: 2,
        content_state: 'complete',
        content,
        content_hash: 'hash-v2',
        request_key: '33333333-3333-4333-8333-333333333333',
        request_hash: 'request-hash',
        readiness_report: null,
        rendered_markdown: null,
        provenance: {},
        source_version_id: null,
        secondary_source_version_id: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    })
    mockEvaluateArchitectureReadiness.mockReturnValueOnce(readinessReport)
    mockPersistArchitectureReadinessReport.mockResolvedValueOnce({
      success: true,
      data: { report: readinessReport },
    })

    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')
    const result = await ProjectPage(makeParams(VALID_UUID))

    expect(mockEvaluateArchitectureReadiness).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: VALID_UUID,
        evaluatedRevision: 4,
        architecture: content,
      }),
    )
    expect(mockPersistArchitectureReadinessReport).toHaveBeenCalledWith({
      projectId: VALID_UUID,
      report: readinessReport,
    })
    expect(
      (result as { props: { architecturePlanning: { readinessReport: unknown } } }).props
        .architecturePlanning.readinessReport,
    ).toBe(readinessReport)
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
    expect(mockGetOrInitializePlanningState).not.toHaveBeenCalled()
    expect(mockRecoverAbandonedChatChangeSets).not.toHaveBeenCalled()
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

  it('renders a deep-linked Work Plan with stage chat and without loading canvas data', async () => {
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    const result = await ProjectPage(makePageInput(VALID_UUID, { stage: 'work-plan' }))

    expect((result as { type: unknown }).type).toBe(mockWorkPlanWorkspaceComponent)
    expect(mockListModulesByProject).not.toHaveBeenCalled()
    expect(mockListChatMessages).toHaveBeenCalledWith(VALID_UUID)
    expect(mockListConnectionsByProject).not.toHaveBeenCalled()
    expect(mockEnsureDefaultModuleGraph).not.toHaveBeenCalled()
  })

  it('keeps new production Architecture projects on the legacy path while rollout is off', async () => {
    mockIsStagedPlanningRolloutEnabled.mockReturnValueOnce(false)
    const { default: ProjectPage } = await import('@/app/(dashboard)/dashboard/[projectId]/page')

    const result = await ProjectPage(makeParams(VALID_UUID))

    expect((result as { type: unknown }).type).toBe(mockProjectWorkspaceComponent)
    expect(mockGetOrInitializePlanningState).not.toHaveBeenCalled()
    expect(mockRecoverAbandonedChatChangeSets).not.toHaveBeenCalled()
    expect(mockListModulesByProject).toHaveBeenCalledWith(VALID_UUID)
  })
})
