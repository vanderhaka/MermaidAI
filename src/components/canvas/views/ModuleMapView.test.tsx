// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Module } from '@/types/graph'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    children,
    nodes,
    nodeTypes,
    onNodeClick,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="react-flow" {...props}>
      {Array.isArray(nodes) &&
        (nodes as Array<{ id: string; data: Record<string, unknown>; type?: string }>).map(
          (node) => (
            <div
              key={node.id}
              data-testid={`node-${node.id}`}
              data-node-type={node.type}
              data-node-name={String(node.data.name)}
              onClick={() =>
                typeof onNodeClick === 'function' &&
                (onNodeClick as (event: unknown, node: { id: string }) => void)(null, node)
              }
            />
          ),
        )}
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: React.PropsWithChildren) => (
    <div data-testid="react-flow-provider">{children}</div>
  ),
  MiniMap: () => <div data-testid="minimap" />,
  Controls: () => <div data-testid="controls" />,
  Background: () => <div data-testid="background" />,
  BackgroundVariant: { Dots: 'dots' },
}))

vi.mock('@/lib/canvas/layout', () => ({
  computeLayout: vi.fn((nodes: unknown[]) => nodes),
}))

import { computeLayout } from '@/lib/canvas/layout'

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod-1',
    project_id: 'proj-1',
    name: 'Auth Module',
    description: 'Handles authentication',
    position: { x: 0, y: 0 },
    color: '#6366f1',
    entry_points: ['login'],
    exit_points: ['token'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

import ModuleMapView from '@/components/canvas/views/ModuleMapView'

describe('ModuleMapView', () => {
  it('renders each module as a node on the canvas', () => {
    const modules = [
      makeModule({ id: 'mod-1', name: 'Auth' }),
      makeModule({ id: 'mod-2', name: 'Billing' }),
    ]
    render(<ModuleMapView modules={modules} />)

    expect(screen.getByTestId('node-mod-1')).toBeInTheDocument()
    expect(screen.getByTestId('node-mod-2')).toBeInTheDocument()
  })

  it('uses ModuleCardNode custom node type', () => {
    const modules = [makeModule()]
    render(<ModuleMapView modules={modules} />)

    const node = screen.getByTestId('node-mod-1')
    expect(node.dataset.nodeType).toBe('moduleCard')
  })

  it('passes module data to node', () => {
    const modules = [makeModule({ name: 'Payments' })]
    render(<ModuleMapView modules={modules} />)

    const node = screen.getByTestId('node-mod-1')
    expect(node.dataset.nodeName).toBe('Payments')
  })

  it('shows empty state message when no modules', () => {
    render(<ModuleMapView modules={[]} />)

    expect(screen.getByText(/no modules/i)).toBeInTheDocument()
    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument()
  })

  it('calls onModuleClick when a node is clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const modules = [makeModule({ id: 'mod-1' })]
    render(<ModuleMapView modules={modules} onModuleClick={onClick} />)

    await user.click(screen.getByTestId('node-mod-1'))

    expect(onClick).toHaveBeenCalledWith('mod-1')
  })

  it('applies computeLayout to position nodes', () => {
    const mockedLayout = vi.mocked(computeLayout)
    mockedLayout.mockClear()
    const modules = [makeModule(), makeModule({ id: 'mod-2', name: 'Billing' })]
    render(<ModuleMapView modules={modules} />)

    expect(mockedLayout).toHaveBeenCalledTimes(1)
    expect(mockedLayout).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mod-1' }),
        expect.objectContaining({ id: 'mod-2' }),
      ]),
      [],
    )
  })
})
