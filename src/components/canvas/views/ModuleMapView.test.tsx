// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Module } from '@/types/graph'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    children,
    nodes,
    edges,
    nodeTypes,
    edgeTypes,
    onNodeClick,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div
      data-testid="react-flow"
      data-node-types={Object.keys((nodeTypes ?? {}) as Record<string, unknown>).join(',')}
      data-edge-types={Object.keys((edgeTypes ?? {}) as Record<string, unknown>).join(',')}
      {...props}
    >
      {Array.isArray(nodes) &&
        (nodes as Array<{ id: string; data: Record<string, unknown>; type?: string }>).map(
          (node) => (
            <div
              key={node.id}
              data-testid={`node-${node.id}`}
              data-node-type={node.type}
              data-node-name={String(node.data.name)}
              data-entry-points={JSON.stringify(node.data.entry_points ?? [])}
              data-exit-points={JSON.stringify(node.data.exit_points ?? [])}
              data-handle-sides={JSON.stringify(node.data.handleSides ?? {})}
              onClick={() =>
                typeof onNodeClick === 'function' &&
                (onNodeClick as (event: unknown, node: { id: string }) => void)(null, node)
              }
            />
          ),
        )}
      {Array.isArray(edges) &&
        (
          edges as Array<{
            id: string
            type?: string
            sourceHandle?: string
            targetHandle?: string
            data?: {
              routeBias?: string
              routeBand?: string
              laneGap?: number
              offset?: number
              laneCoordinate?: number
            }
          }>
        ).map((edge) => (
          <div
            key={edge.id}
            data-testid={`edge-${edge.id}`}
            data-edge-type={edge.type}
            data-source-handle={edge.sourceHandle}
            data-target-handle={edge.targetHandle}
            data-route-bias={edge.data?.routeBias}
            data-route-band={edge.data?.routeBand}
            data-lane-gap={String(edge.data?.laneGap ?? '')}
            data-offset={String(edge.data?.offset ?? '')}
            data-lane-coordinate={String(edge.data?.laneCoordinate ?? '')}
          />
        ))}
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
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ fitView: vi.fn() }),
}))

vi.mock('@/lib/canvas/layout', () => ({
  computeModuleLayout: vi.fn((nodes: unknown[]) => nodes),
}))

import { computeModuleLayout } from '@/lib/canvas/layout'

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
    render(<ModuleMapView modules={modules} connections={[]} />)

    expect(screen.getByTestId('node-mod-1')).toBeInTheDocument()
    expect(screen.getByTestId('node-mod-2')).toBeInTheDocument()
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-edge-types', 'moduleConnection')
  })

  it('uses ModuleCardNode custom node type', () => {
    const modules = [makeModule()]
    render(<ModuleMapView modules={modules} connections={[]} />)

    const node = screen.getByTestId('node-mod-1')
    expect(node.dataset.nodeType).toBe('moduleCard')
  })

  it('passes module data to node', () => {
    const modules = [makeModule({ name: 'Payments' })]
    render(<ModuleMapView modules={modules} connections={[]} />)

    const node = screen.getByTestId('node-mod-1')
    expect(node.dataset.nodeName).toBe('Payments')
  })

  it('shows empty state message when no modules', () => {
    render(<ModuleMapView modules={[]} connections={[]} />)

    expect(screen.getByText(/no modules/i)).toBeInTheDocument()
    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument()
  })

  it('calls onModuleClick when a node is clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const modules = [makeModule({ id: 'mod-1' })]
    render(<ModuleMapView modules={modules} connections={[]} onModuleClick={onClick} />)

    await user.click(screen.getByTestId('node-mod-1'))

    expect(onClick).toHaveBeenCalledWith('mod-1')
  })

  it('applies computeModuleLayout to position nodes', () => {
    const mockedLayout = vi.mocked(computeModuleLayout)
    mockedLayout.mockClear()
    const modules = [makeModule(), makeModule({ id: 'mod-2', name: 'Billing' })]
    render(<ModuleMapView modules={modules} connections={[]} />)

    expect(mockedLayout).toHaveBeenCalledTimes(1)
    expect(mockedLayout).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'mod-1' }),
        expect.objectContaining({ id: 'mod-2' }),
      ]),
      [],
    )
  })

  it('routes upward retry connections through top and bottom handles', () => {
    const modules = [
      makeModule({
        id: 'payment',
        name: 'Payment',
        position: { x: 300, y: 0 },
        entry_points: ['checkout_data', 'retry_payment'],
        exit_points: ['payment_failure'],
      }),
      makeModule({
        id: 'failure',
        name: 'Payment Failure',
        position: { x: 300, y: 220 },
        entry_points: ['payment_failure'],
        exit_points: ['retry_payment'],
      }),
    ]

    render(
      <ModuleMapView
        modules={modules}
        connections={[
          {
            id: 'conn-retry',
            project_id: 'proj-1',
            source_module_id: 'failure',
            target_module_id: 'payment',
            source_exit_point: 'retry_payment',
            target_entry_point: 'retry_payment',
            created_at: '2026-01-01T00:00:00Z',
          },
        ]}
      />,
    )

    const paymentSides = JSON.parse(
      screen.getByTestId('node-payment').dataset.handleSides ?? '{}',
    ) as Record<string, string>
    const failureSides = JSON.parse(
      screen.getByTestId('node-failure').dataset.handleSides ?? '{}',
    ) as Record<string, string>

    expect(paymentSides['entry-retry_payment']).toBe('bottom')
    expect(failureSides['exit-retry_payment']).toBe('top')
    expect(screen.getByTestId('edge-conn-retry')).toHaveAttribute(
      'data-edge-type',
      'moduleConnection',
    )
  })

  it('routes upward-left recovery connections through horizontal handles', () => {
    const modules = [
      makeModule({
        id: 'cart',
        name: 'Cart',
        position: { x: 0, y: 0 },
        entry_points: ['cart_items'],
        exit_points: ['checkout_data'],
      }),
      makeModule({
        id: 'payment',
        name: 'Payment',
        position: { x: 380, y: 0 },
        entry_points: ['checkout_data', 'payment_details'],
        exit_points: ['payment_failure'],
      }),
      makeModule({
        id: 'failure',
        name: 'Payment Failure',
        position: { x: 380, y: 220 },
        entry_points: ['payment_error'],
        exit_points: ['retry_payment', 'return_to_cart'],
      }),
    ]

    render(
      <ModuleMapView
        modules={modules}
        connections={[
          {
            id: 'conn-return',
            project_id: 'proj-1',
            source_module_id: 'failure',
            target_module_id: 'cart',
            source_exit_point: 'return_to_cart',
            target_entry_point: 'cart_items',
            created_at: '2026-01-01T00:00:00Z',
          },
        ]}
      />,
    )

    const cartSides = JSON.parse(
      screen.getByTestId('node-cart').dataset.handleSides ?? '{}',
    ) as Record<string, string>
    const failureSides = JSON.parse(
      screen.getByTestId('node-failure').dataset.handleSides ?? '{}',
    ) as Record<string, string>

    expect(cartSides['entry-cart_items']).toBe('bottom')
    expect(failureSides['exit-return_to_cart']).toBe('bottom')
    expect(screen.getByTestId('edge-conn-return')).toHaveAttribute('data-route-band', 'outer-y')
    expect(screen.getByTestId('edge-conn-return')).toHaveAttribute('data-offset', '32')
  })

  it('adds missing handle names referenced by connections', () => {
    const modules = [
      makeModule({
        id: 'payment',
        name: 'Payment',
        entry_points: ['checkout_data'],
        exit_points: ['payment_success', 'payment_failure'],
      }),
      makeModule({
        id: 'confirmation',
        name: 'Order Confirmation',
        entry_points: ['payment_result'],
        exit_points: [],
      }),
    ]

    render(
      <ModuleMapView
        modules={modules}
        connections={[
          {
            id: 'conn-result',
            project_id: 'proj-1',
            source_module_id: 'payment',
            target_module_id: 'confirmation',
            source_exit_point: 'payment_result',
            target_entry_point: 'payment_result',
            created_at: '2026-01-01T00:00:00Z',
          },
        ]}
      />,
    )

    const paymentExitPoints = JSON.parse(
      screen.getByTestId('node-payment').dataset.exitPoints ?? '[]',
    ) as string[]

    expect(paymentExitPoints).toContain('payment_result')
    expect(screen.getByTestId('edge-conn-result')).toHaveAttribute(
      'data-source-handle',
      'exit-payment_result',
    )
  })
})
