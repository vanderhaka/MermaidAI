// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
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
              data-handle-order={JSON.stringify(node.data.handleOrder ?? {})}
              data-handle-positions={JSON.stringify(node.data.handlePositions ?? {})}
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
              label?: string
              tooltipDescription?: string
              sections?: Array<unknown>
            }
          }>
        ).map((edge) => (
          <div
            key={edge.id}
            data-testid={`edge-${edge.id}`}
            data-edge-type={edge.type}
            data-source-handle={edge.sourceHandle}
            data-target-handle={edge.targetHandle}
            data-label={edge.data?.label}
            data-tooltip-description={edge.data?.tooltipDescription}
            data-sections={JSON.stringify(edge.data?.sections ?? [])}
          />
        ))}
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: React.PropsWithChildren) => (
    <div data-testid="react-flow-provider">{children}</div>
  ),
  Controls: () => <div data-testid="controls" />,
  Background: () => <div data-testid="background" />,
  BackgroundVariant: { Dots: 'dots' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ fitView: vi.fn() }),
}))

vi.mock('@/lib/canvas/layout', () => ({
  computeModuleMapLayout: vi.fn(async (modules: Module[]) => ({
    nodes: modules.map((module, index) => ({
      id: module.id,
      position: { x: index * 320, y: index * 180 },
      portLayout: {},
    })),
    edges: [],
  })),
}))

import { computeModuleMapLayout } from '@/lib/canvas/layout'
import ModuleMapView from '@/components/canvas/views/ModuleMapView'

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod-1',
    project_id: 'proj-1',
    domain: null,
    name: 'Auth Module',
    description: 'Handles authentication',
    prd_content: '',
    position: { x: 0, y: 0 },
    color: '#6366f1',
    entry_points: ['login'],
    exit_points: ['token'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('ModuleMapView', () => {
  beforeEach(() => {
    vi.mocked(computeModuleMapLayout).mockClear()
  })

  it('renders each module as a node on the canvas', async () => {
    const modules = [
      makeModule({ id: 'mod-1', name: 'Auth' }),
      makeModule({ id: 'mod-2', name: 'Billing' }),
    ]

    render(<ModuleMapView modules={modules} connections={[]} />)

    expect(await screen.findByTestId('node-mod-1')).toBeInTheDocument()
    expect(screen.getByTestId('node-mod-2')).toBeInTheDocument()
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-edge-types', 'moduleConnection')
  })

  it('uses ModuleCardNode custom node type', async () => {
    const modules = [makeModule()]
    render(<ModuleMapView modules={modules} connections={[]} />)

    const node = await screen.findByTestId('node-mod-1')
    expect(node.dataset.nodeType).toBe('moduleCard')
  })

  it('passes module data to node', async () => {
    const modules = [makeModule({ name: 'Payments' })]
    render(<ModuleMapView modules={modules} connections={[]} />)

    const node = await screen.findByTestId('node-mod-1')
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

    await user.click(await screen.findByTestId('node-mod-1'))

    expect(onClick).toHaveBeenCalledWith('mod-1')
  })

  it('requests a downward module-map layout from the layout layer', async () => {
    const modules = [makeModule(), makeModule({ id: 'mod-2', name: 'Billing' })]
    render(<ModuleMapView modules={modules} connections={[]} />)

    await waitFor(() => {
      expect(computeModuleMapLayout).toHaveBeenCalledTimes(1)
    })

    expect(computeModuleMapLayout).toHaveBeenCalledWith(modules, [])
  })

  it('renders layout-derived handle sides, order, and positions', async () => {
    vi.mocked(computeModuleMapLayout).mockResolvedValueOnce({
      nodes: [
        {
          id: 'payment',
          position: { x: 80, y: 40 },
          portLayout: {
            'entry-checkout_data': { side: 'top', order: 0, position: 38 },
            'entry-settlement_event': { side: 'top', order: 1, position: 62 },
            'exit-payment_succeeded': { side: 'bottom', order: 0, position: 50 },
          },
        },
      ],
      edges: [],
    })

    render(
      <ModuleMapView
        modules={[
          makeModule({
            id: 'payment',
            name: 'Payment',
            entry_points: ['checkout_data'],
            exit_points: ['payment_succeeded'],
          }),
        ]}
        connections={[
          {
            id: 'edge-1',
            project_id: 'proj-1',
            source_module_id: 'payment',
            target_module_id: 'payment',
            source_exit_point: 'payment_succeeded',
            target_entry_point: 'settlement_event',
            created_at: '2026-01-01T00:00:00Z',
          },
        ]}
      />,
    )

    const node = await screen.findByTestId('node-payment')
    expect(node.dataset.handleSides).toBe(
      JSON.stringify({
        'entry-checkout_data': 'top',
        'entry-settlement_event': 'top',
        'exit-payment_succeeded': 'bottom',
      }),
    )
    expect(node.dataset.handleOrder).toBe(
      JSON.stringify({
        'entry-checkout_data': 0,
        'entry-settlement_event': 1,
        'exit-payment_succeeded': 0,
      }),
    )
    expect(node.dataset.handlePositions).toBe(
      JSON.stringify({
        'entry-checkout_data': 38,
        'entry-settlement_event': 62,
        'exit-payment_succeeded': 50,
      }),
    )
  })

  it('keeps saved connection handles visible even when module metadata drifted', async () => {
    vi.mocked(computeModuleMapLayout).mockResolvedValueOnce({
      nodes: [
        {
          id: 'payment',
          position: { x: 0, y: 0 },
          portLayout: {
            'entry-checkout_data': { side: 'top', order: 0, position: 40 },
            'entry-payment_result': { side: 'top', order: 1, position: 60 },
          },
        },
      ],
      edges: [],
    })

    render(
      <ModuleMapView
        modules={[
          makeModule({
            id: 'payment',
            name: 'Payment',
            entry_points: ['checkout_data'],
            exit_points: [],
          }),
        ]}
        connections={[
          {
            id: 'edge-1',
            project_id: 'proj-1',
            source_module_id: 'payment',
            target_module_id: 'payment',
            source_exit_point: 'payment_result',
            target_entry_point: 'payment_result',
            created_at: '2026-01-01T00:00:00Z',
          },
        ]}
      />,
    )

    const node = await screen.findByTestId('node-payment')
    expect(node.dataset.entryPoints).toBe(JSON.stringify(['checkout_data', 'payment_result']))
  })

  it('passes ELK edge sections through to the custom edge renderer', async () => {
    vi.mocked(computeModuleMapLayout).mockResolvedValueOnce({
      nodes: [
        { id: 'checkout', position: { x: 0, y: 0 }, portLayout: {} },
        { id: 'payment', position: { x: 0, y: 220 }, portLayout: {} },
      ],
      edges: [
        {
          id: 'edge-1',
          sections: [
            {
              startPoint: { x: 130, y: 100 },
              bendPoints: [{ x: 130, y: 150 }],
              endPoint: { x: 130, y: 220 },
            },
          ],
        },
      ],
    })

    render(
      <ModuleMapView
        modules={[
          makeModule({ id: 'checkout', name: 'Checkout' }),
          makeModule({ id: 'payment', name: 'Payment' }),
        ]}
        connections={[
          {
            id: 'edge-1',
            project_id: 'proj-1',
            source_module_id: 'checkout',
            target_module_id: 'payment',
            source_exit_point: 'checkout_data',
            target_entry_point: 'checkout_data',
            created_at: '2026-01-01T00:00:00Z',
          },
        ]}
      />,
    )

    const edge = await screen.findByTestId('edge-edge-1')
    expect(edge.dataset.label).toBe('checkout_data')
    expect(edge.dataset.sections).toBe(
      JSON.stringify([
        {
          startPoint: { x: 130, y: 100 },
          bendPoints: [{ x: 130, y: 150 }],
          endPoint: { x: 130, y: 220 },
        },
      ]),
    )
  })
})
