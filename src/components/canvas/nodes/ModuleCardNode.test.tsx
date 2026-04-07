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
    expect((loginHandle as HTMLDivElement).style.top).toBe(`${(1 / 3) * 100}%`)
    expect(registerHandle).toBeInTheDocument()
    expect((registerHandle as HTMLDivElement).style.top).toBe(`${(2 / 3) * 100}%`)
  })

  it('renders exit handles for each exit point', () => {
    render(<ModuleCardNode {...baseProps} />)
    const dashboardHandle = screen.getByTestId('handle-source-exit-dashboard')
    const errorHandle = screen.getByTestId('handle-source-exit-error')
    expect(dashboardHandle).toBeInTheDocument()
    expect(dashboardHandle).toHaveAttribute('data-handle-type', 'source')
    expect(dashboardHandle).toHaveAttribute('data-handle-position', 'right')
    expect((dashboardHandle as HTMLDivElement).style.top).toBe(`${(1 / 3) * 100}%`)
    expect(errorHandle).toBeInTheDocument()
    expect((errorHandle as HTMLDivElement).style.top).toBe(`${(2 / 3) * 100}%`)
  })

  it('renders with null description gracefully', () => {
    const props = {
      ...baseProps,
      data: { ...baseProps.data, description: null },
    }
    render(<ModuleCardNode {...props} />)
    expect(screen.getByText('Auth Module')).toBeInTheDocument()
  })

  it('does not render unnamed fallback handles when entry/exit points are empty', () => {
    const props = {
      ...baseProps,
      data: { ...baseProps.data, entry_points: [], exit_points: [] },
    }
    const { container } = render(<ModuleCardNode {...props} />)
    const handles = container.querySelectorAll('[data-testid^="handle-"]')
    expect(handles).toHaveLength(0)
  })

  it('separates entry and exit handles that share the same side', () => {
    const props = {
      ...baseProps,
      data: {
        ...baseProps.data,
        entry_points: ['checkout_data'],
        exit_points: ['return_to_cart'],
        handleSides: {
          'entry-checkout_data': 'left',
          'exit-return_to_cart': 'left',
        },
      },
    }

    render(<ModuleCardNode {...props} />)

    const entryHandle = screen.getByTestId('handle-target-entry-checkout_data') as HTMLDivElement
    const exitHandle = screen.getByTestId('handle-source-exit-return_to_cart') as HTMLDivElement

    expect(entryHandle.style.top).toBe(`${(1 / 3) * 100}%`)
    expect(exitHandle.style.top).toBe(`${(2 / 3) * 100}%`)
  })
})
