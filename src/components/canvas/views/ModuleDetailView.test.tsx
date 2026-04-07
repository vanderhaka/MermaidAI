// @vitest-environment happy-dom
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FlowNode, FlowEdge } from '@/types/graph'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div
      data-testid="react-flow"
      data-nodes={JSON.stringify(props.nodes)}
      data-edge-types={props.edgeTypes ? Object.keys(props.edgeTypes as object).join(',') : ''}
      data-node-types={props.nodeTypes ? Object.keys(props.nodeTypes as object).join(',') : ''}
    >
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  useReactFlow: () => ({ fitView: vi.fn() }),
  Controls: () => <div data-testid="controls" />,
  Background: () => <div data-testid="background" />,
  BackgroundVariant: { Dots: 'dots' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
}))

vi.mock('@/lib/canvas/layout', () => ({
  computeLayout: vi.fn((nodes: FlowNode[]) =>
    nodes.map((n, i) => ({ ...n, position: { x: i * 100, y: i * 50 } })),
  ),
  computeFlowDetailLayout: vi.fn(async (nodes: FlowNode[]) => ({
    nodes: nodes.map((n, i) => ({ id: n.id, position: { x: i * 100, y: i * 50 } })),
    edges: [],
  })),
  getFlowDetailNodeDimensions: (nodeType: FlowNode['node_type']) =>
    nodeType === 'decision' ? { width: 176, height: 176 } : { width: 172, height: 36 },
}))

import ModuleDetailView from '@/components/canvas/views/ModuleDetailView'

function makeNode(
  overrides: Partial<FlowNode> & { id: string; node_type: FlowNode['node_type'] },
): FlowNode {
  return {
    module_id: 'mod-1',
    label: overrides.node_type,
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: 'blue',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function makeEdge(overrides: Partial<FlowEdge> & { id: string }): FlowEdge {
  return {
    module_id: 'mod-1',
    source_node_id: 'n1',
    target_node_id: 'n2',
    label: null,
    condition: null,
    created_at: '',
    ...overrides,
  }
}

const sampleNodes: FlowNode[] = [
  makeNode({ id: 'n1', node_type: 'start', label: 'Begin' }),
  makeNode({ id: 'n2', node_type: 'process', label: 'Step A' }),
  makeNode({ id: 'n3', node_type: 'decision', label: 'Check?' }),
  makeNode({ id: 'n4', node_type: 'entry', label: 'In' }),
  makeNode({ id: 'n5', node_type: 'exit', label: 'Out' }),
  makeNode({ id: 'n6', node_type: 'end', label: 'Finish' }),
]

const sampleEdges: FlowEdge[] = [
  makeEdge({ id: 'e1', source_node_id: 'n1', target_node_id: 'n2' }),
  makeEdge({ id: 'e2', source_node_id: 'n2', target_node_id: 'n3' }),
]

describe('ModuleDetailView', () => {
  it('renders module name as header', () => {
    render(<ModuleDetailView moduleName="Auth Flow" nodes={[]} edges={[]} />)
    expect(screen.getByRole('heading', { name: 'Auth Flow' })).toBeInTheDocument()
  })

  it('renders empty state message when no nodes', () => {
    render(<ModuleDetailView moduleName="Empty" nodes={[]} edges={[]} />)
    expect(screen.getByText(/no flow detail yet/i)).toBeInTheDocument()
  })

  it('does not render ReactFlow when no nodes', () => {
    render(<ModuleDetailView moduleName="Empty" nodes={[]} edges={[]} />)
    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument()
  })

  it('renders ReactFlow canvas when nodes exist', () => {
    render(<ModuleDetailView moduleName="Auth" nodes={sampleNodes} edges={sampleEdges} />)
    expect(screen.getByTestId('react-flow')).toBeInTheDocument()
  })

  it('converts FlowNodes to React Flow nodes with correct types', async () => {
    render(<ModuleDetailView moduleName="Auth" nodes={sampleNodes} edges={sampleEdges} />)
    await waitFor(() => {
      const flow = screen.getByTestId('react-flow')
      const rfNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]')
      expect(rfNodes).toHaveLength(6)
      expect(rfNodes[0]).toMatchObject({ id: 'n1', type: 'start' })
      expect(rfNodes[1]).toMatchObject({ id: 'n2', type: 'process' })
      expect(rfNodes[2]).toMatchObject({ id: 'n3', type: 'decision' })
      expect(rfNodes[3]).toMatchObject({ id: 'n4', type: 'entry' })
      expect(rfNodes[4]).toMatchObject({ id: 'n5', type: 'exit' })
      expect(rfNodes[5]).toMatchObject({ id: 'n6', type: 'end' })
    })
  })

  it('applies computeFlowDetailLayout to position nodes', async () => {
    const { computeFlowDetailLayout } = (await import('@/lib/canvas/layout')) as unknown as {
      computeFlowDetailLayout: ReturnType<typeof vi.fn>
    }
    await act(async () => {
      render(<ModuleDetailView moduleName="Auth" nodes={sampleNodes} edges={sampleEdges} />)
    })
    expect(computeFlowDetailLayout).toHaveBeenCalledWith(sampleNodes, sampleEdges)
    await waitFor(() => {
      const flow = screen.getByTestId('react-flow')
      const rfNodes = JSON.parse(flow.getAttribute('data-nodes') ?? '[]')
      expect(rfNodes[0].position).toEqual({ x: 0, y: 0 })
      expect(rfNodes[1].position).toEqual({ x: 100, y: 50 })
    })
  })

  it('registers all custom nodeTypes', () => {
    render(<ModuleDetailView moduleName="Auth" nodes={sampleNodes} edges={sampleEdges} />)
    const flow = screen.getByTestId('react-flow')
    const types = flow.getAttribute('data-node-types')?.split(',') ?? []
    expect(types).toContain('decision')
    expect(types).toContain('process')
    expect(types).toContain('entry')
    expect(types).toContain('exit')
    expect(types).toContain('start')
    expect(types).toContain('end')
  })

  it('registers custom edgeTypes', () => {
    render(<ModuleDetailView moduleName="Auth" nodes={sampleNodes} edges={sampleEdges} />)
    const flow = screen.getByTestId('react-flow')
    const types = flow.getAttribute('data-edge-types')?.split(',') ?? []
    expect(types).toContain('condition')
  })

  it('calls onBack when back button is clicked', async () => {
    const onBack = vi.fn()
    render(
      <ModuleDetailView
        moduleName="Auth"
        nodes={sampleNodes}
        edges={sampleEdges}
        onBack={onBack}
      />,
    )
    const backBtn = screen.getByRole('button', { name: /back/i })
    await userEvent.click(backBtn)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('does not render back button when onBack is not provided', () => {
    render(<ModuleDetailView moduleName="Auth" nodes={sampleNodes} edges={sampleEdges} />)
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
  })
})
