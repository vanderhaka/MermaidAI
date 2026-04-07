import ELK from 'elkjs/lib/elk.bundled.js'
import type {
  ElkExtendedEdge,
  ElkNode,
  ElkPort,
  ElkEdgeSection,
  LayoutOptions,
} from 'elkjs/lib/elk-api'
import dagre from 'dagre'
import type {
  FlowNode,
  FlowEdge,
  FlowNodeType,
  Module,
  ModuleConnection,
  Position,
} from '@/types/graph'
import { MODULE_CARD_WIDTH, MODULE_CARD_HEIGHT } from '@/components/canvas/nodes/ModuleCardNode'
import type { HandleSide } from '@/components/canvas/nodes/ModuleCardNode'
import { expandConnectionHandlePoints } from '@/lib/canvas/handleSlots'
import { inferDecisionSourceHandle } from '@/lib/canvas/flow-edge-style'

/** Fallback when node type is unknown; prefer {@link getFlowDetailNodeDimensions}. */
export const DEFAULT_NODE_WIDTH = 172
export const DEFAULT_NODE_HEIGHT = 36

/** Matches rendered node sizes in the module detail canvas so Dagre spacing is trustworthy. */
export function getFlowDetailNodeDimensions(nodeType: FlowNodeType): {
  width: number
  height: number
} {
  switch (nodeType) {
    case 'decision':
      /** Matches `DecisionNode` outer box (`h-44 w-44` = 176px). */
      return { width: 176, height: 176 }
    case 'process':
      return { width: 260, height: 56 }
    case 'entry':
    case 'exit':
      return { width: 200, height: 44 }
    case 'start':
    case 'end':
      return { width: 64, height: 64 }
    default:
      return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
  }
}

const MODULE_GAP_X = 120
const MODULE_GAP_Y = 100

const DEFAULT_PORT_SIZE = 12
const PORT_POSITION_MIN = 12
const PORT_POSITION_MAX = 88

const elk = new ELK()

const MODULE_MAP_LAYOUT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.padding': '[top=40,left=40,bottom=40,right=40]',
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.layered.spacing.edgeNodeBetweenLayers': '60',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.separateConnectedComponents': 'true',
}

export type ModuleConnectionSection = {
  startPoint: Position
  endPoint: Position
  bendPoints?: Position[]
}

export type ModulePortLayout = {
  side: HandleSide
  order: number
  position: number
}

export type ModuleMapNodeLayout = {
  id: string
  position: Position
  portLayout: Record<string, ModulePortLayout>
}

export type ModuleMapEdgeLayout = {
  id: string
  sections: ModuleConnectionSection[]
}

export type ModuleMapLayoutResult = {
  nodes: ModuleMapNodeLayout[]
  edges: ModuleMapEdgeLayout[]
}

/**
 * Layout for internal module nodes (process, decision, start, end, etc.).
 * Uses dagre when edges exist, grid fallback otherwise.
 * Per-node width/height match canvas nodes so decision diamonds and process steps do not overlap.
 */
export function computeLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  if (nodes.length === 0) return []

  if (edges.length === 0) {
    const widths = nodes.map((n) => getFlowDetailNodeDimensions(n.node_type).width)
    const heights = nodes.map((n) => getFlowDetailNodeDimensions(n.node_type).height)
    const cellW = Math.max(...widths, DEFAULT_NODE_WIDTH)
    const cellH = Math.max(...heights, DEFAULT_NODE_HEIGHT)
    return computeGridLayout(nodes, cellW, cellH, 112, 128)
  }

  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: 'TB',
    nodesep: 128,
    ranksep: 184,
    edgesep: 64,
    marginx: 80,
    marginy: 80,
    ranker: 'network-simplex',
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    const dim = getFlowDetailNodeDimensions(node.node_type)
    g.setNode(node.id, { width: dim.width, height: dim.height })
  }

  for (const edge of edges) {
    g.setEdge(edge.source_node_id, edge.target_node_id)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    const dim = getFlowDetailNodeDimensions(node.node_type)
    return {
      ...node,
      position: { x: pos.x - dim.width / 2, y: pos.y - dim.height / 2 },
    }
  })
}

export async function computeModuleMapLayout(
  modules: Module[],
  connections: ModuleConnection[],
): Promise<ModuleMapLayoutResult> {
  if (modules.length === 0) {
    return { nodes: [], edges: [] }
  }

  if (connections.length === 0) {
    return buildFallbackModuleMapLayout(modules, connections)
  }

  const { sourcePointByConnectionId, targetPointByConnectionId } =
    expandConnectionHandlePoints(connections)

  const orderedModules = buildPreferredModuleOrder(modules, connections)
  const portMetadata = new Map<string, { moduleId: string; handleId: string; side: HandleSide }>()

  const graph: ElkNode = {
    id: 'module-map',
    layoutOptions: MODULE_MAP_LAYOUT_OPTIONS,
    children: orderedModules.map((module) =>
      buildElkModuleNode(
        module,
        connections,
        sourcePointByConnectionId,
        targetPointByConnectionId,
        portMetadata,
      ),
    ),
    edges: connections.map<ElkExtendedEdge>((connection) => ({
      id: connection.id,
      sources: [
        getPortId(
          connection.source_module_id,
          'exit',
          sourcePointByConnectionId.get(connection.id) ?? connection.source_exit_point,
        ),
      ],
      targets: [
        getPortId(
          connection.target_module_id,
          'entry',
          targetPointByConnectionId.get(connection.id) ?? connection.target_entry_point,
        ),
      ],
    })),
  }

  let laidOutGraph: ElkNode

  try {
    laidOutGraph = await elk.layout(graph)
  } catch {
    return buildFallbackModuleMapLayout(modules, connections)
  }

  const laidOutNodes = new Map((laidOutGraph.children ?? []).map((node) => [node.id, node]))
  const laidOutEdges = new Map((laidOutGraph.edges ?? []).map((edge) => [edge.id, edge]))

  return {
    nodes: orderedModules.map((module) => {
      const laidOutNode = laidOutNodes.get(module.id)
      return {
        id: module.id,
        position: {
          x: laidOutNode?.x ?? module.position.x,
          y: laidOutNode?.y ?? module.position.y,
        },
        portLayout:
          laidOutNode != null
            ? {
                ...buildDefaultPortLayout(
                  module,
                  connections,
                  sourcePointByConnectionId,
                  targetPointByConnectionId,
                ),
                ...extractPortLayout(laidOutNode, portMetadata),
              }
            : buildDefaultPortLayout(
                module,
                connections,
                sourcePointByConnectionId,
                targetPointByConnectionId,
              ),
      }
    }),
    edges: connections.map((connection) => ({
      id: connection.id,
      sections: extractSections(laidOutEdges.get(connection.id)),
    })),
  }
}

// ─── Flow detail ELK layout ────────────────────────────────────────────

const FLOW_DETAIL_LAYOUT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.padding': '[top=40,left=40,bottom=40,right=40]',
  'elk.spacing.nodeNode': '60',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.separateConnectedComponents': 'true',
}

export type FlowDetailLayoutResult = {
  nodes: Array<{ id: string; position: Position }>
  edges: Array<{ id: string; sections: ModuleConnectionSection[] }>
}

/**
 * ELK-based layout for flow detail nodes/edges.
 * Produces both node positions AND orthogonal edge sections,
 * matching the module map's routing quality.
 */
export async function computeFlowDetailLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
): Promise<FlowDetailLayoutResult> {
  if (nodes.length === 0) return { nodes: [], edges: [] }

  if (edges.length === 0) {
    const widths = nodes.map((n) => getFlowDetailNodeDimensions(n.node_type).width)
    const heights = nodes.map((n) => getFlowDetailNodeDimensions(n.node_type).height)
    const cellW = Math.max(...widths, DEFAULT_NODE_WIDTH)
    const cellH = Math.max(...heights, DEFAULT_NODE_HEIGHT)
    const gridNodes = computeGridLayout(nodes, cellW, cellH, 112, 128)
    return {
      nodes: gridNodes.map((n) => ({ id: n.id, position: n.position })),
      edges: [],
    }
  }

  const nodesById = new Map(nodes.map((n) => [n.id, n]))

  const graph: ElkNode = {
    id: 'flow-detail',
    layoutOptions: FLOW_DETAIL_LAYOUT_OPTIONS,
    children: nodes.map((node) => {
      const dim = getFlowDetailNodeDimensions(node.node_type)
      const ports: ElkPort[] = buildFlowNodePorts(node)

      return {
        id: node.id,
        width: dim.width,
        height: dim.height,
        layoutOptions: {
          'elk.portConstraints': 'FIXED_SIDE',
        },
        ports,
      }
    }),
    edges: edges.map<ElkExtendedEdge>((edge) => {
      const sourceNode = nodesById.get(edge.source_node_id)
      const sourcePortId = getFlowNodeSourcePortId(edge, sourceNode)
      return {
        id: edge.id,
        sources: [sourcePortId],
        targets: [`${edge.target_node_id}::in`],
      }
    }),
  }

  let laidOutGraph: ElkNode

  try {
    laidOutGraph = await elk.layout(graph)
  } catch {
    const dagreNodes = computeLayout(nodes, edges)
    return {
      nodes: dagreNodes.map((n) => ({ id: n.id, position: n.position })),
      edges: [],
    }
  }

  const laidOutNodes = new Map((laidOutGraph.children ?? []).map((n) => [n.id, n]))
  const laidOutEdges = new Map((laidOutGraph.edges ?? []).map((e) => [e.id, e]))

  return {
    nodes: nodes.map((node) => {
      const layoutNode = laidOutNodes.get(node.id)
      return {
        id: node.id,
        position: {
          x: layoutNode?.x ?? node.position.x,
          y: layoutNode?.y ?? node.position.y,
        },
      }
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      sections: extractSections(laidOutEdges.get(edge.id)),
    })),
  }
}

function buildFlowNodePorts(node: FlowNode): ElkPort[] {
  const ports: ElkPort[] = []

  const hasTarget = node.node_type !== 'start' && node.node_type !== 'entry'
  const hasSource = node.node_type !== 'end' && node.node_type !== 'exit'

  if (hasTarget) {
    ports.push({
      id: `${node.id}::in`,
      width: DEFAULT_PORT_SIZE,
      height: DEFAULT_PORT_SIZE,
      layoutOptions: { 'elk.port.side': 'NORTH' },
    })
  }

  if (node.node_type === 'decision') {
    ports.push(
      {
        id: `${node.id}::yes`,
        width: DEFAULT_PORT_SIZE,
        height: DEFAULT_PORT_SIZE,
        layoutOptions: { 'elk.port.side': 'SOUTH' },
      },
      {
        id: `${node.id}::no`,
        width: DEFAULT_PORT_SIZE,
        height: DEFAULT_PORT_SIZE,
        layoutOptions: { 'elk.port.side': 'EAST' },
      },
    )
  } else if (hasSource) {
    ports.push({
      id: `${node.id}::out`,
      width: DEFAULT_PORT_SIZE,
      height: DEFAULT_PORT_SIZE,
      layoutOptions: { 'elk.port.side': 'SOUTH' },
    })
  }

  return ports
}

function getFlowNodeSourcePortId(edge: FlowEdge, sourceNode: FlowNode | undefined): string {
  if (sourceNode?.node_type === 'decision') {
    const handle = inferDecisionSourceHandle(edge.label, edge.condition)
    if (handle === 'yes' || handle === 'no') {
      return `${edge.source_node_id}::${handle}`
    }
    return `${edge.source_node_id}::yes`
  }
  return `${edge.source_node_id}::out`
}

function computeGridLayout<T extends { id: string; position: Position }>(
  nodes: T[],
  itemWidth: number,
  itemHeight: number,
  gapX: number,
  gapY: number,
): T[] {
  const cols = Math.ceil(Math.sqrt(nodes.length))

  return nodes.map((node, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      ...node,
      position: {
        x: col * (itemWidth + gapX),
        y: row * (itemHeight + gapY),
      },
    }
  })
}

function buildFallbackModuleMapLayout(
  modules: Module[],
  connections: ModuleConnection[],
): ModuleMapLayoutResult {
  const { sourcePointByConnectionId, targetPointByConnectionId } =
    expandConnectionHandlePoints(connections)

  return {
    nodes: computeGridLayout(
      modules,
      MODULE_CARD_WIDTH,
      MODULE_CARD_HEIGHT,
      MODULE_GAP_X,
      MODULE_GAP_Y,
    ).map((module) => ({
      id: module.id,
      position: module.position,
      portLayout: buildDefaultPortLayout(
        module,
        connections,
        sourcePointByConnectionId,
        targetPointByConnectionId,
      ),
    })),
    edges: connections.map((connection) => ({
      id: connection.id,
      sections: [],
    })),
  }
}

function buildPreferredModuleOrder(modules: Module[], connections: ModuleConnection[]) {
  const originalOrder = new Map(modules.map((module, index) => [module.id, index]))
  const adjacency = new Map<string, Set<string>>()
  const indegree = new Map(modules.map((module) => [module.id, 0]))

  for (const connection of connections) {
    const targets = adjacency.get(connection.source_module_id) ?? new Set<string>()
    if (!targets.has(connection.target_module_id)) {
      targets.add(connection.target_module_id)
      adjacency.set(connection.source_module_id, targets)
      indegree.set(
        connection.target_module_id,
        (indegree.get(connection.target_module_id) ?? 0) + 1,
      )
    }
  }

  const queue = modules
    .filter((module) => (indegree.get(module.id) ?? 0) === 0)
    .sort((a, b) => (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0))

  const ordered: Module[] = []
  const seen = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!
    if (seen.has(current.id)) continue

    seen.add(current.id)
    ordered.push(current)

    const neighbors = Array.from(adjacency.get(current.id) ?? []).sort(
      (a, b) => (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0),
    )

    for (const neighbor of neighbors) {
      const nextIndegree = (indegree.get(neighbor) ?? 0) - 1
      indegree.set(neighbor, nextIndegree)
      if (nextIndegree <= 0) {
        const nextModule = modules.find((module) => module.id === neighbor)
        if (nextModule && !seen.has(nextModule.id)) {
          queue.push(nextModule)
          queue.sort((a, b) => (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0))
        }
      }
    }
  }

  for (const graphModule of modules) {
    if (!seen.has(graphModule.id)) {
      ordered.push(graphModule)
    }
  }

  return ordered
}

function collectSlottedEntryPointsForModule(
  moduleId: string,
  module: Module,
  connections: ModuleConnection[],
  targetPointByConnectionId: Map<string, string>,
): string[] {
  const names = new Set<string>()
  const logicalConnected = new Set<string>()
  for (const c of connections) {
    if (c.target_module_id === moduleId) {
      names.add(targetPointByConnectionId.get(c.id) ?? c.target_entry_point)
      logicalConnected.add(c.target_entry_point)
    }
  }
  for (const ep of module.entry_points) {
    if (!logicalConnected.has(ep)) {
      names.add(ep)
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b))
}

function collectSlottedExitPointsForModule(
  moduleId: string,
  module: Module,
  connections: ModuleConnection[],
  sourcePointByConnectionId: Map<string, string>,
): string[] {
  const names = new Set<string>()
  const logicalConnected = new Set<string>()
  for (const c of connections) {
    if (c.source_module_id === moduleId) {
      names.add(sourcePointByConnectionId.get(c.id) ?? c.source_exit_point)
      logicalConnected.add(c.source_exit_point)
    }
  }
  for (const ep of module.exit_points) {
    if (!logicalConnected.has(ep)) {
      names.add(ep)
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b))
}

function buildElkModuleNode(
  module: Module,
  connections: ModuleConnection[],
  sourcePointByConnectionId: Map<string, string>,
  targetPointByConnectionId: Map<string, string>,
  portMetadata: Map<string, { moduleId: string; handleId: string; side: HandleSide }>,
): ElkNode {
  const entryPoints = collectSlottedEntryPointsForModule(
    module.id,
    module,
    connections,
    targetPointByConnectionId,
  )
  const exitPoints = collectSlottedExitPointsForModule(
    module.id,
    module,
    connections,
    sourcePointByConnectionId,
  )

  const ports: ElkPort[] = [
    ...entryPoints.map((entryPoint) =>
      buildElkPort(module.id, 'entry', entryPoint, 'top', portMetadata),
    ),
    ...exitPoints.map((exitPoint) =>
      buildElkPort(module.id, 'exit', exitPoint, 'bottom', portMetadata),
    ),
  ]

  return {
    id: module.id,
    width: MODULE_CARD_WIDTH,
    height: MODULE_CARD_HEIGHT,
    layoutOptions: {
      'elk.portConstraints': 'FIXED_SIDE',
    },
    ports,
  }
}

function buildElkPort(
  moduleId: string,
  kind: 'entry' | 'exit',
  pointName: string,
  side: HandleSide,
  portMetadata: Map<string, { moduleId: string; handleId: string; side: HandleSide }>,
): ElkPort {
  const id = getPortId(moduleId, kind, pointName)
  portMetadata.set(id, {
    moduleId,
    handleId: `${kind}-${pointName}`,
    side,
  })

  return {
    id,
    width: DEFAULT_PORT_SIZE,
    height: DEFAULT_PORT_SIZE,
    layoutOptions: {
      'elk.port.side': side === 'top' ? 'NORTH' : 'SOUTH',
    },
  }
}

function buildDefaultPortLayout(
  module: Module,
  connections: ModuleConnection[],
  sourcePointByConnectionId: Map<string, string>,
  targetPointByConnectionId: Map<string, string>,
) {
  const entryPoints = collectSlottedEntryPointsForModule(
    module.id,
    module,
    connections,
    targetPointByConnectionId,
  )
  const exitPoints = collectSlottedExitPointsForModule(
    module.id,
    module,
    connections,
    sourcePointByConnectionId,
  )

  return {
    ...buildSidePortLayout(entryPoints, 'entry', 'top'),
    ...buildSidePortLayout(exitPoints, 'exit', 'bottom'),
  }
}

function buildSidePortLayout(
  points: string[],
  kind: 'entry' | 'exit',
  side: HandleSide,
): Record<string, ModulePortLayout> {
  const positions = buildDefaultPortPositions(points.length)
  return Object.fromEntries(
    points.map((pointName, index) => [
      `${kind}-${pointName}`,
      {
        side,
        order: index,
        position: positions[index] ?? 50,
      },
    ]),
  )
}

function buildDefaultPortPositions(count: number) {
  if (count <= 0) return []
  return Array.from({ length: count }, (_, index) =>
    normalizePercent(((index + 1) / (count + 1)) * 100),
  )
}

function extractPortLayout(
  node: ElkNode,
  portMetadata: Map<string, { moduleId: string; handleId: string; side: HandleSide }>,
) {
  const nodeWidth = node.width ?? MODULE_CARD_WIDTH
  const nodeHeight = node.height ?? MODULE_CARD_HEIGHT
  const bySide = new Map<
    HandleSide,
    Array<{ handleId: string; coordinate: number; position: number }>
  >()

  for (const port of node.ports ?? []) {
    const metadata = portMetadata.get(port.id)
    if (!metadata) continue

    const portWidth = port.width ?? DEFAULT_PORT_SIZE
    const portHeight = port.height ?? DEFAULT_PORT_SIZE
    const coordinate =
      metadata.side === 'top' || metadata.side === 'bottom'
        ? (port.x ?? 0) + portWidth / 2
        : (port.y ?? 0) + portHeight / 2
    const dimension = metadata.side === 'top' || metadata.side === 'bottom' ? nodeWidth : nodeHeight
    const list = bySide.get(metadata.side) ?? []
    list.push({
      handleId: metadata.handleId,
      coordinate,
      position: normalizePercent((coordinate / Math.max(dimension, 1)) * 100),
    })
    bySide.set(metadata.side, list)
  }

  const layout: Record<string, ModulePortLayout> = {}

  for (const [side, ports] of bySide) {
    ports
      .sort((a, b) => a.coordinate - b.coordinate || a.handleId.localeCompare(b.handleId))
      .forEach((port, index) => {
        layout[port.handleId] = {
          side,
          order: index,
          position: port.position,
        }
      })
  }

  return layout
}

function extractSections(edge: ElkExtendedEdge | undefined): ModuleConnectionSection[] {
  return (edge?.sections ?? []).map((section) => serializeSection(section))
}

function serializeSection(section: ElkEdgeSection): ModuleConnectionSection {
  return {
    startPoint: { x: section.startPoint.x, y: section.startPoint.y },
    endPoint: { x: section.endPoint.x, y: section.endPoint.y },
    bendPoints: section.bendPoints?.map((point) => ({ x: point.x, y: point.y })),
  }
}

function mergeHandleNames(base: string[], derived: Iterable<string>) {
  const merged = new Set(base)
  for (const name of derived) {
    merged.add(name)
  }
  return Array.from(merged)
}

function getPortId(moduleId: string, kind: 'entry' | 'exit', pointName: string) {
  return `${moduleId}::${kind}::${pointName}`
}

function normalizePercent(value: number) {
  return Number(Math.max(PORT_POSITION_MIN, Math.min(PORT_POSITION_MAX, value)).toFixed(2))
}
