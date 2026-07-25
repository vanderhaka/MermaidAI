// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Module, Project, Requirement } from '@/types/graph'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getProjectById: vi.fn(),
    listModulesByProject: vi.fn(),
    getGraphForModule: vi.fn(),
    listConnectionsByProject: vi.fn(),
    listOpenQuestions: vi.fn(),
    listRequirements: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND')
    }),
  },
}))

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('@/lib/services/project-service', () => ({ getProjectById: mocks.getProjectById }))
vi.mock('@/lib/services/module-service', () => ({
  listModulesByProject: mocks.listModulesByProject,
}))
vi.mock('@/lib/services/graph-service', () => ({ getGraphForModule: mocks.getGraphForModule }))
vi.mock('@/lib/services/module-connection-service', () => ({
  listConnectionsByProject: mocks.listConnectionsByProject,
}))
vi.mock('@/lib/services/open-question-service', () => ({
  listOpenQuestions: mocks.listOpenQuestions,
}))
vi.mock('@/lib/services/requirement-service', () => ({ listRequirements: mocks.listRequirements }))
vi.mock('server-only', () => ({}))

import SharePage from '@/app/share/[projectId]/page'

const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000'
const timestamp = '2026-07-25T00:00:00Z'

const project: Project = {
  id: PROJECT_ID,
  user_id: 'user-1',
  name: 'Acme Store',
  description: 'Online store',
  mode: 'scope',
  created_at: timestamp,
  updated_at: timestamp,
}

const module_: Module = {
  id: 'module-1',
  project_id: PROJECT_ID,
  domain: null,
  name: 'Checkout',
  description: null,
  prd_content: '',
  position: { x: 0, y: 0 },
  color: '#111827',
  entry_points: [],
  exit_points: [],
  created_at: timestamp,
  updated_at: timestamp,
}

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'req-1',
    project_id: PROJECT_ID,
    module_id: 'module-1',
    statement: 'Guests can check out without an account.',
    kind: 'functional',
    status: 'agreed',
    coverage_area: 'Core transaction',
    source_question_id: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

async function renderPage() {
  const ui = await SharePage({ params: Promise.resolve({ projectId: PROJECT_ID }) })
  return render(ui)
}

describe('share page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProjectById.mockResolvedValue({ success: true, data: project })
    mocks.listModulesByProject.mockResolvedValue({ success: true, data: [module_] })
    mocks.getGraphForModule.mockResolvedValue({ success: true, data: { nodes: [], edges: [] } })
    mocks.listConnectionsByProject.mockResolvedValue({ success: true, data: [] })
    mocks.listOpenQuestions.mockResolvedValue({ success: true, data: [] })
    mocks.listRequirements.mockResolvedValue({ success: true, data: [] })
  })

  it('renders the project as a read-only spec', async () => {
    await renderPage()

    expect(screen.getByText('Acme Store')).toBeInTheDocument()
    expect(screen.getByText('Read-only spec')).toBeInTheDocument()
  })

  it('exposes no editing controls', async () => {
    await renderPage()

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows how much of the scope is settled', async () => {
    mocks.listRequirements.mockResolvedValue({ success: true, data: [makeRequirement()] })
    await renderPage()

    expect(screen.getByText('1 of 11 areas settled')).toBeInTheDocument()
    expect(screen.getByTestId('share-coverage-core_transaction')).toHaveAttribute(
      'data-status',
      'covered',
    )
  })

  it('lists agreed requirements', async () => {
    mocks.listRequirements.mockResolvedValue({ success: true, data: [makeRequirement()] })
    await renderPage()

    expect(screen.getByText('Guests can check out without an account.')).toBeInTheDocument()
  })

  it('records what was explicitly ruled out', async () => {
    mocks.listRequirements.mockResolvedValue({
      success: true,
      data: [
        makeRequirement({
          id: 'req-2',
          status: 'out_of_scope',
          statement: 'No SMS notifications in v1.',
        }),
      ],
    })
    await renderPage()

    expect(screen.getByText('Explicitly out of scope')).toBeInTheDocument()
    expect(screen.getByText('No SMS notifications in v1.')).toBeInTheDocument()
  })

  it('omits the out-of-scope section when nothing was ruled out', async () => {
    mocks.listRequirements.mockResolvedValue({ success: true, data: [makeRequirement()] })
    await renderPage()

    expect(screen.queryByText('Explicitly out of scope')).not.toBeInTheDocument()
  })

  it('404s on a malformed project id without querying', async () => {
    await expect(
      SharePage({ params: Promise.resolve({ projectId: 'not-a-uuid' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.getProjectById).not.toHaveBeenCalled()
  })

  it('404s when the project is not readable', async () => {
    mocks.getProjectById.mockResolvedValue({ success: false, error: 'not found' })

    await expect(SharePage({ params: Promise.resolve({ projectId: PROJECT_ID }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
  })
})
