// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CanvasContainer from '@/components/canvas/CanvasContainer'
import type {
  Module,
  FlowNode,
  FlowEdge,
  ModuleConnection,
  OpenQuestion,
  Requirement,
  RequirementLink,
  RequirementNode as RequirementNodeLink,
} from '@/types/graph'

// --- Mock graph store ---
const mockStore = {
  modules: [] as Module[],
  nodes: [] as FlowNode[],
  edges: [] as FlowEdge[],
  connections: [] as ModuleConnection[],
  openQuestions: [] as OpenQuestion[],
  requirements: [] as Requirement[],
  requirementLinks: [] as RequirementLink[],
  requirementNodes: [] as RequirementNodeLink[],
  activeModuleId: null as string | null,
  canvasView: 'flow' as 'flow' | 'requirements',
  setActiveModuleId: vi.fn(),
  setCanvasView: vi.fn(),
  setHighlightedNodeIds: vi.fn(),
}

vi.mock('@/store/graph-store', () => ({
  useGraphStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}))

// --- Mock child views ---
vi.mock('@/components/canvas/views/RequirementsView', () => ({
  default: ({ requirements }: { requirements: Requirement[] }) => (
    <div data-testid="requirements-view">
      <span data-testid="requirement-count">{requirements.length}</span>
    </div>
  ),
}))

vi.mock('@/components/canvas/views/ModuleMapView', () => ({
  default: ({
    modules,
    onModuleClick,
  }: {
    modules: Module[]
    onModuleClick?: (id: string) => void
  }) => (
    <div data-testid="module-map-view">
      <span data-testid="module-count">{modules.length}</span>
      {modules.map((m) => (
        <button key={m.id} data-testid={`module-${m.id}`} onClick={() => onModuleClick?.(m.id)}>
          {m.name}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/canvas/views/ModuleDetailView', () => ({
  default: ({
    moduleName,
    nodes,
    edges,
    showFunnelLanes,
    onBack,
  }: {
    moduleName: string
    nodes: FlowNode[]
    edges: FlowEdge[]
    showFunnelLanes?: boolean
    onBack?: () => void
  }) => (
    <div data-testid="module-detail-view">
      <span data-testid="module-name">{moduleName}</span>
      <span data-testid="node-count">{nodes.length}</span>
      <span data-testid="edge-count">{edges.length}</span>
      <span data-testid="show-funnel-lanes">{String(Boolean(showFunnelLanes))}</span>
      <button data-testid="back-button" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}))

// --- Test data ---
function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod-1',
    project_id: 'proj-1',
    domain: null,
    name: 'Auth Module',
    description: null,
    prd_content: '',
    position: { x: 0, y: 0 },
    color: '#3b82f6',
    entry_points: [],
    exit_points: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeNode(overrides: Partial<FlowNode> = {}): FlowNode {
  return {
    id: 'node-1',
    module_id: 'mod-1',
    node_type: 'process',
    label: 'Process step',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '#3b82f6',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeEdge(overrides: Partial<FlowEdge> = {}): FlowEdge {
  return {
    id: 'edge-1',
    module_id: 'mod-1',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    label: null,
    condition: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  mockStore.modules = []
  mockStore.nodes = []
  mockStore.edges = []
  mockStore.activeModuleId = null
  mockStore.setActiveModuleId.mockClear()
})

describe('CanvasContainer', () => {
  describe('default view (no activeModuleId)', () => {
    it('renders ModuleMapView when activeModuleId is null', () => {
      mockStore.modules = [makeModule()]
      render(<CanvasContainer />)
      expect(screen.getByTestId('module-map-view')).toBeInTheDocument()
      expect(screen.queryByTestId('module-detail-view')).not.toBeInTheDocument()
    })

    it('passes all modules to ModuleMapView', () => {
      mockStore.modules = [
        makeModule({ id: 'mod-1', name: 'Auth' }),
        makeModule({ id: 'mod-2', name: 'Billing' }),
      ]
      render(<CanvasContainer />)
      expect(screen.getByTestId('module-count')).toHaveTextContent('2')
    })
  })

  describe('drill-down to module detail', () => {
    it('calls setActiveModuleId when a module is clicked', async () => {
      const user = userEvent.setup()
      mockStore.modules = [makeModule({ id: 'mod-1', name: 'Auth' })]
      render(<CanvasContainer />)
      await user.click(screen.getByTestId('module-mod-1'))
      expect(mockStore.setActiveModuleId).toHaveBeenCalledWith('mod-1')
    })

    it('renders ModuleDetailView when activeModuleId is set', () => {
      mockStore.modules = [makeModule({ id: 'mod-1', name: 'Auth Module' })]
      mockStore.nodes = [makeNode({ id: 'node-1', module_id: 'mod-1' })]
      mockStore.edges = [makeEdge({ id: 'edge-1', module_id: 'mod-1' })]
      mockStore.activeModuleId = 'mod-1'
      render(<CanvasContainer />)
      expect(screen.getByTestId('module-detail-view')).toBeInTheDocument()
      expect(screen.queryByTestId('module-map-view')).not.toBeInTheDocument()
    })

    it('passes module name to ModuleDetailView', () => {
      mockStore.modules = [makeModule({ id: 'mod-1', name: 'Auth Module' })]
      mockStore.activeModuleId = 'mod-1'
      render(<CanvasContainer />)
      expect(screen.getByTestId('module-name')).toHaveTextContent('Auth Module')
    })

    it('filters nodes for the active module only', () => {
      mockStore.modules = [
        makeModule({ id: 'mod-1', name: 'Auth' }),
        makeModule({ id: 'mod-2', name: 'Billing' }),
      ]
      mockStore.nodes = [
        makeNode({ id: 'n1', module_id: 'mod-1' }),
        makeNode({ id: 'n2', module_id: 'mod-2' }),
        makeNode({ id: 'n3', module_id: 'mod-1' }),
      ]
      mockStore.activeModuleId = 'mod-1'
      render(<CanvasContainer />)
      expect(screen.getByTestId('node-count')).toHaveTextContent('2')
    })

    it('filters edges for the active module only', () => {
      mockStore.modules = [makeModule({ id: 'mod-1', name: 'Auth' })]
      mockStore.nodes = [makeNode({ id: 'n1', module_id: 'mod-1' })]
      mockStore.edges = [
        makeEdge({ id: 'e1', module_id: 'mod-1' }),
        makeEdge({ id: 'e2', module_id: 'mod-2' }),
      ]
      mockStore.activeModuleId = 'mod-1'
      render(<CanvasContainer />)
      expect(screen.getByTestId('edge-count')).toHaveTextContent('1')
    })

    it('passes funnel lanes flag to ModuleDetailView when enabled', () => {
      mockStore.modules = [makeModule({ id: 'mod-1', name: 'Marketing Flowchart' })]
      mockStore.nodes = [makeNode({ id: 'n1', module_id: 'mod-1' })]
      mockStore.activeModuleId = 'mod-1'
      render(<CanvasContainer showFunnelLanes />)
      expect(screen.getByTestId('show-funnel-lanes')).toHaveTextContent('true')
    })
  })

  describe('back navigation', () => {
    it('calls setActiveModuleId(null) when back button is clicked', async () => {
      const user = userEvent.setup()
      mockStore.modules = [makeModule({ id: 'mod-1', name: 'Auth' })]
      mockStore.activeModuleId = 'mod-1'
      render(<CanvasContainer />)
      await user.click(screen.getByTestId('back-button'))
      expect(mockStore.setActiveModuleId).toHaveBeenCalledWith(null)
    })
  })

  describe('edge cases', () => {
    it('falls back to ModuleMapView if activeModuleId does not match any module', () => {
      mockStore.modules = [makeModule({ id: 'mod-1', name: 'Auth' })]
      mockStore.activeModuleId = 'nonexistent'
      render(<CanvasContainer />)
      expect(screen.getByTestId('module-map-view')).toBeInTheDocument()
      expect(screen.queryByTestId('module-detail-view')).not.toBeInTheDocument()
    })
  })
})

describe('requirements view', () => {
  beforeEach(() => {
    mockStore.canvasView = 'flow'
    mockStore.requirements = []
    mockStore.setCanvasView.mockClear()
    mockStore.setHighlightedNodeIds.mockClear()
  })

  it('offers a toggle between the flow and the requirements graph', () => {
    render(<CanvasContainer />)

    expect(screen.getByRole('button', { name: /flow/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /requirements/i })).toBeInTheDocument()
  })

  it('shows the flow by default', () => {
    render(<CanvasContainer />)

    expect(screen.getByTestId('module-map-view')).toBeInTheDocument()
    expect(screen.queryByTestId('requirements-view')).not.toBeInTheDocument()
  })

  it('switches the store to the requirements view when clicked', async () => {
    const user = userEvent.setup()
    render(<CanvasContainer />)

    await user.click(screen.getByRole('button', { name: /requirements/i }))

    expect(mockStore.setCanvasView).toHaveBeenCalledWith('requirements')
  })

  it('renders the requirements graph when that view is active', () => {
    mockStore.canvasView = 'requirements'
    render(<CanvasContainer />)

    expect(screen.getByTestId('requirements-view')).toBeInTheDocument()
    expect(screen.queryByTestId('module-map-view')).not.toBeInTheDocument()
  })

  it('takes precedence over module drill-down, so the toggle always works', () => {
    mockStore.canvasView = 'requirements'
    mockStore.modules = [makeModule({ id: 'mod-1' })]
    mockStore.activeModuleId = 'mod-1'
    render(<CanvasContainer />)

    expect(screen.getByTestId('requirements-view')).toBeInTheDocument()
    expect(screen.queryByTestId('module-detail-view')).not.toBeInTheDocument()
  })
})
