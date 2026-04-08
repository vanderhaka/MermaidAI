// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectList } from '@/components/dashboard/project-list'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockCreateProject = vi.fn()
const mockDeleteProject = vi.fn()
const mockListProjectsByUser = vi.fn()
vi.mock('@/lib/services/project-service', () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
  deleteProject: (...args: unknown[]) => mockDeleteProject(...args),
  listProjectsByUser: (...args: unknown[]) => mockListProjectsByUser(...args),
}))

const sampleProjects = [
  {
    id: 'p1',
    name: 'Project Alpha',
    description: 'First project',
    mode: 'architecture' as const,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'p2',
    name: 'Project Beta',
    description: null,
    mode: 'scope' as const,
    created_at: '2026-02-20T14:30:00Z',
    updated_at: '2026-02-20T14:30:00Z',
  },
]

describe('ProjectList', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockCreateProject.mockReset()
    mockDeleteProject.mockReset()
    mockListProjectsByUser.mockReset()
  })

  it('renders project names and descriptions', () => {
    render(<ProjectList projects={sampleProjects} />)

    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('First project')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
  })

  it('renders created date for each project', () => {
    const { container } = render(<ProjectList projects={sampleProjects} />)

    const timeElements = container.querySelectorAll('time')
    expect(timeElements).toHaveLength(2)
    expect(timeElements[0]).toHaveAttribute('datetime', '2026-01-15T10:00:00Z')
    expect(timeElements[1]).toHaveAttribute('datetime', '2026-02-20T14:30:00Z')
  })

  it('renders project cards as clickable links to /dashboard/[projectId]', async () => {
    const user = userEvent.setup()
    render(<ProjectList projects={sampleProjects} />)

    const alphaButton = screen.getByRole('button', { name: /open project alpha/i })
    expect(alphaButton).toBeInTheDocument()

    await user.click(alphaButton)

    expect(mockPush).toHaveBeenCalledWith('/dashboard/p1')
  })

  it('shows empty state with prompt when no projects', () => {
    render(<ProjectList projects={[]} />)

    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument()
  })

  it('renders a "New Project" button', () => {
    render(<ProjectList projects={sampleProjects} />)

    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
  })

  it('shows mode selector when "New Project" is clicked', async () => {
    const user = userEvent.setup()
    render(<ProjectList projects={sampleProjects} />)

    await user.click(screen.getByRole('button', { name: /new project/i }))

    expect(screen.getByRole('button', { name: /quick capture/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /full design/i })).toBeInTheDocument()
  })

  it('creates project with scope mode', async () => {
    const user = userEvent.setup()
    mockCreateProject.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'p3',
        name: 'Untitled Project',
        description: null,
        mode: 'scope',
        created_at: '',
        updated_at: '',
      },
    })

    render(<ProjectList projects={sampleProjects} />)

    await user.click(screen.getByRole('button', { name: /new project/i }))
    await user.click(screen.getByRole('button', { name: /quick capture/i }))

    expect(mockCreateProject).toHaveBeenCalledWith({
      name: 'Untitled Project',
      mode: 'scope',
    })
    expect(mockPush).toHaveBeenCalledWith('/dashboard/p3')
  })

  it('creates project with architecture mode', async () => {
    const user = userEvent.setup()
    mockCreateProject.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'p4',
        name: 'Untitled Project',
        description: null,
        mode: 'architecture',
        created_at: '',
        updated_at: '',
      },
    })

    render(<ProjectList projects={sampleProjects} />)

    await user.click(screen.getByRole('button', { name: /new project/i }))
    await user.click(screen.getByRole('button', { name: /full design/i }))

    expect(mockCreateProject).toHaveBeenCalledWith({
      name: 'Untitled Project',
      mode: 'architecture',
    })
    expect(mockPush).toHaveBeenCalledWith('/dashboard/p4')
  })

  it('can dismiss the mode selector', async () => {
    const user = userEvent.setup()
    render(<ProjectList projects={sampleProjects} />)

    await user.click(screen.getByRole('button', { name: /new project/i }))
    expect(screen.getByTestId('mode-selector')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByTestId('mode-selector')).not.toBeInTheDocument()
  })

  it('does not navigate when createProject fails', async () => {
    const user = userEvent.setup()
    mockCreateProject.mockResolvedValueOnce({
      success: false,
      error: 'Failed to create project',
    })

    render(<ProjectList projects={sampleProjects} />)

    await user.click(screen.getByRole('button', { name: /new project/i }))
    await user.click(screen.getByRole('button', { name: /quick capture/i }))

    expect(mockCreateProject).toHaveBeenCalledOnce()
    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to create project')
  })
})
