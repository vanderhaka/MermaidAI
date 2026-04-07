// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Handle: ({ id, type, position, ...rest }: Record<string, unknown>) => (
    <div
      data-testid={id ? `handle-${type}-${id}` : `handle-${type}-default`}
      data-handle-type={type}
      data-handle-position={position}
      {...rest}
    />
  ),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}))

import ModuleCardNode from '@/components/canvas/nodes/ModuleCardNode'

const baseProps = {
  id: 'node-1',
  type: 'moduleCard' as const,
  data: {
    name: 'Auth Module',
    description: 'Handles user authentication',
    entry_points: ['login', 'register'],
    exit_points: ['dashboard', 'error'],
  },
  selected: false,
  isConnectable: true,
  zIndex: 0,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  dragging: false,
  draggable: true,
  dragHandle: undefined,
  parentId: undefined,
  deletable: true,
  selectable: true,
  connectable: true,
  width: undefined,
  height: undefined,
  sourcePosition: undefined,
  targetPosition: undefined,
}

describe('ModuleCardNode', () => {
  it('renders the module name', () => {
    render(<ModuleCardNode {...baseProps} />)
    expect(screen.getByText('Auth Module')).toBeInTheDocument()
  })

  it('renders the module description', () => {
    render(<ModuleCardNode {...baseProps} />)
    expect(screen.getByText('Handles user authentication')).toBeInTheDocument()
  })

  it('renders entry handles for each entry point', () => {
    render(<ModuleCardNode {...baseProps} />)
    const loginHandle = screen.getByTestId('handle-target-entry-login')
    const registerHandle = screen.getByTestId('handle-target-entry-register')
    expect(loginHandle).toBeInTheDocument()
    expect(loginHandle).toHaveAttribute('data-handle-type', 'target')
    expect(loginHandle).toHaveAttribute('data-handle-position', 'left')
    expect(registerHandle).toBeInTheDocument()
  })

  it('renders exit handles for each exit point', () => {
    render(<ModuleCardNode {...baseProps} />)
    const dashboardHandle = screen.getByTestId('handle-source-exit-dashboard')
    const errorHandle = screen.getByTestId('handle-source-exit-error')
    expect(dashboardHandle).toBeInTheDocument()
    expect(dashboardHandle).toHaveAttribute('data-handle-type', 'source')
    expect(dashboardHandle).toHaveAttribute('data-handle-position', 'right')
    expect(errorHandle).toBeInTheDocument()
  })

  it('renders with null description gracefully', () => {
    const props = {
      ...baseProps,
      data: { ...baseProps.data, description: null },
    }
    render(<ModuleCardNode {...props} />)
    expect(screen.getByText('Auth Module')).toBeInTheDocument()
  })

  it('renders default top/bottom handles when entry/exit points are empty', () => {
    const props = {
      ...baseProps,
      data: { ...baseProps.data, entry_points: [], exit_points: [] },
    }
    const { container } = render(<ModuleCardNode {...props} />)
    // Default top (target) and bottom (source) handles always render
    const handles = container.querySelectorAll('[data-testid^="handle-"]')
    expect(handles).toHaveLength(2)
  })
})
