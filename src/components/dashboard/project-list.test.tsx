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
const mockListProjectsByUser = vi.fn()
vi.mock('@/lib/services/project-service', () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
  listProjectsByUser: (...args: unknown[]) => mockListProjectsByUser(...args),
}))

const sampleProjects = [
  {
    id: 'p1',
    name: 'Project Alpha',
    description: 'First project',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'p2',
    name: 'Project Beta',
    description: null,
    created_at: '2026-02-20T14:30:00Z',
    updated_at: '2026-02-20T14:30:00Z',
  },
]

describe('ProjectList', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockCreateProject.mockReset()
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

    const alphaCard = screen.getByText('Project Alpha').closest('button')
    expect(alphaCard).toBeInTheDocument()

    await user.click(alphaCard!)

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

  it('calls createProject and navigates when "New Project" is clicked', async () => {
    const user = userEvent.setup()
    mockCreateProject.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'p3',
        name: 'Untitled Project',
        description: null,
        created_at: '',
        updated_at: '',
      },
    })

    render(<ProjectList projects={sampleProjects} />)

    await user.click(screen.getByRole('button', { name: /new project/i }))

    expect(mockCreateProject).toHaveBeenCalledWith({ name: 'Untitled Project' })
    expect(mockPush).toHaveBeenCalledWith('/dashboard/p3')
  })

  it('does not navigate when createProject fails', async () => {
    const user = userEvent.setup()
    mockCreateProject.mockResolvedValueOnce({
      success: false,
      error: 'Failed to create project',
    })

    render(<ProjectList projects={sampleProjects} />)

    await user.click(screen.getByRole('button', { name: /new project/i }))

    expect(mockCreateProject).toHaveBeenCalledOnce()
    expect(mockPush).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to create project')
  })
})
