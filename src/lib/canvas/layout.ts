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
import { getModuleFlowEdgeStyle, inferDecisionSourceHandle } from '@/lib/canvas/flow-edge-style'
import { separateOverlappingSegments } from '@/lib/canvas/edge-separation'

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
      return { width: 300, height: 60 }
    case 'entry':
    case 'exit':
      return { width: 200, height: 44 }
    case 'question':
      return { width: 300, height: 60 }
    case 'screen':
      return { width: 300, height: 96 }
    case 'role':
      return { width: 220, height: 60 }
    case 'data':
      return { width: 240, height: 92 }
    case 'start':
    case 'end':
      return { width: 96, height: 96 }
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
  'elk.spacing.nodeNode': '64',
  'elk.layered.spacing.nodeNodeBetweenLayers': '72',
  'elk.layered.spacing.edgeNodeBetweenLayers': '36',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
  'elk.separateConnectedComponents': 'true',
}

const FLOW_ROUTE_STUB = 44
const FLOW_ROUTE_LANE_GAP = 136
const FLOW_ROUTE_LANE_STEP = 34
const FLOW_ROUTE_NODE_PADDING = 24
const FLOW_ROUTE_GAP_MARGIN = 6

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

  const sortedNodes = buildPreferredFlowNodeOrder(nodes, edges)

  const nodesById = new Map(nodes.map((n) => [n.id, n]))

  const graph: ElkNode = {
    id: 'flow-detail',
    layoutOptions: FLOW_DETAIL_LAYOUT_OPTIONS,
    children: sortedNodes.map((node) => {
      const dim = getFlowDetailNodeDimensions(node.node_type)
      const ports: ElkPort[] = buildFlowNodePorts(node)

      const nodeLayoutOptions: LayoutOptions = {
        'elk.portConstraints': 'FIXED_SIDE',
      }
      if (node.node_type === 'start' || node.node_type === 'entry') {
        nodeLayoutOptions['elk.layered.layering.layerConstraint'] = 'FIRST'
      } else if (node.node_type === 'end' || node.node_type === 'exit') {
        nodeLayoutOptions['elk.layered.layering.layerConstraint'] = 'LAST'
      }

      return {
        id: node.id,
        width: dim.width,
        height: dim.height,
        layoutOptions: nodeLayoutOptions,
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
  const layoutNodes = nodes.map((node) => {
    const layoutNode = laidOutNodes.get(node.id)
    return {
      id: node.id,
      position: {
        x: layoutNode?.x ?? node.position.x,
        y: layoutNode?.y ?? node.position.y,
      },
    }
  })
  const layoutNodeById = new Map(layoutNodes.map((node) => [node.id, node.position]))
  const routedEdges = routeFlowDetailEdges(nodes, edges, layoutNodeById)

  return {
    nodes: layoutNodes,
    // Routes are picked per edge with no knowledge of each other — spread
    // corridors that landed on top of one another before rendering.
    edges: separateOverlappingSegments(routedEdges),
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

function buildPreferredFlowNodeOrder(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const originalOrder = new Map(nodes.map((node, index) => [node.id, index]))
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    if (!nodesById.has(edge.source_node_id) || !nodesById.has(edge.target_node_id)) continue
    adjacency.get(edge.source_node_id)?.push(edge.target_node_id)
  }

  for (const targets of adjacency.values()) {
    targets.sort((a, b) => (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0))
  }

  const components = findStronglyConnectedComponents(
    nodes.map((node) => node.id),
    adjacency,
  )
  const componentByNode = new Map<string, number>()
  components.forEach((component, componentIndex) => {
    for (const nodeId of component) {
      componentByNode.set(nodeId, componentIndex)
    }
  })

  const componentGraph = new Map<number, Set<number>>()
  const componentIndegree = new Map<number, number>()
  const componentRank = new Map<number, number>()

  components.forEach((component, componentIndex) => {
    componentGraph.set(componentIndex, new Set())
    componentIndegree.set(componentIndex, 0)
    componentRank.set(
      componentIndex,
      component.some((id) => isFlowStart(nodesById.get(id))) ? 0 : 1,
    )
  })

  for (const edge of edges) {
    const sourceComponent = componentByNode.get(edge.source_node_id)
    const targetComponent = componentByNode.get(edge.target_node_id)
    if (sourceComponent == null || targetComponent == null || sourceComponent === targetComponent) {
      continue
    }

    const targets = componentGraph.get(sourceComponent)
    if (!targets?.has(targetComponent)) {
      targets?.add(targetComponent)
      componentIndegree.set(targetComponent, (componentIndegree.get(targetComponent) ?? 0) + 1)
    }
  }

  const queue = Array.from(componentIndegree.entries())
    .filter(([, indegree]) => indegree === 0)
    .map(([componentIndex]) => componentIndex)
    .sort((a, b) => compareComponentsByOriginalOrder(components, originalOrder, a, b))

  while (queue.length > 0) {
    const componentIndex = queue.shift()!
    const nextRank = (componentRank.get(componentIndex) ?? 0) + 1

    for (const targetComponent of componentGraph.get(componentIndex) ?? []) {
      componentRank.set(
        targetComponent,
        Math.max(componentRank.get(targetComponent) ?? 0, nextRank),
      )
      const nextIndegree = (componentIndegree.get(targetComponent) ?? 0) - 1
      componentIndegree.set(targetComponent, nextIndegree)
      if (nextIndegree === 0) {
        queue.push(targetComponent)
        queue.sort((a, b) => compareComponentsByOriginalOrder(components, originalOrder, a, b))
      }
    }
  }

  const internalRank = buildInternalComponentRanks(
    components,
    edges,
    componentByNode,
    originalOrder,
  )

  return [...nodes].sort((a, b) => {
    const componentA = componentByNode.get(a.id) ?? 0
    const componentB = componentByNode.get(b.id) ?? 0
    const rankDiff = (componentRank.get(componentA) ?? 0) - (componentRank.get(componentB) ?? 0)
    if (rankDiff !== 0) return rankDiff

    const internalDiff = (internalRank.get(a.id) ?? 0) - (internalRank.get(b.id) ?? 0)
    if (internalDiff !== 0) return internalDiff

    const typeDiff = getFlowNodeTypeOrder(a.node_type) - getFlowNodeTypeOrder(b.node_type)
    if (typeDiff !== 0) return typeDiff

    return (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0)
  })
}

function findStronglyConnectedComponents(
  nodeIds: string[],
  adjacency: Map<string, string[]>,
): string[][] {
  const indexByNode = new Map<string, number>()
  const lowlinkByNode = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: string[][] = []
  let index = 0

  function visit(nodeId: string) {
    indexByNode.set(nodeId, index)
    lowlinkByNode.set(nodeId, index)
    index += 1
    stack.push(nodeId)
    onStack.add(nodeId)

    for (const targetId of adjacency.get(nodeId) ?? []) {
      if (!indexByNode.has(targetId)) {
        visit(targetId)
        lowlinkByNode.set(
          nodeId,
          Math.min(lowlinkByNode.get(nodeId) ?? 0, lowlinkByNode.get(targetId) ?? 0),
        )
      } else if (onStack.has(targetId)) {
        lowlinkByNode.set(
          nodeId,
          Math.min(lowlinkByNode.get(nodeId) ?? 0, indexByNode.get(targetId) ?? 0),
        )
      }
    }

    if (lowlinkByNode.get(nodeId) !== indexByNode.get(nodeId)) return

    const component: string[] = []
    let current: string | undefined
    do {
      current = stack.pop()
      if (!current) break
      onStack.delete(current)
      component.push(current)
    } while (current !== nodeId)

    components.push(component)
  }

  for (const nodeId of nodeIds) {
    if (!indexByNode.has(nodeId)) {
      visit(nodeId)
    }
  }

  return components
}

function buildInternalComponentRanks(
  components: string[][],
  edges: FlowEdge[],
  componentByNode: Map<string, number>,
  originalOrder: Map<string, number>,
) {
  const rankByNode = new Map<string, number>()

  components.forEach((component, componentIndex) => {
    if (component.length === 1) {
      rankByNode.set(component[0], 0)
      return
    }

    const componentSet = new Set(component)
    const internalAdjacency = new Map(component.map((nodeId) => [nodeId, [] as string[]]))
    const entryNodes = new Set<string>()

    for (const edge of edges) {
      const sourceComponent = componentByNode.get(edge.source_node_id)
      const targetComponent = componentByNode.get(edge.target_node_id)
      if (targetComponent !== componentIndex) continue

      if (sourceComponent !== componentIndex) {
        entryNodes.add(edge.target_node_id)
      } else if (componentSet.has(edge.source_node_id) && componentSet.has(edge.target_node_id)) {
        internalAdjacency.get(edge.source_node_id)?.push(edge.target_node_id)
      }
    }

    for (const targets of internalAdjacency.values()) {
      targets.sort((a, b) => (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0))
    }

    const startNodes =
      entryNodes.size > 0
        ? Array.from(entryNodes)
        : [
            [...component].sort(
              (a, b) => (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0),
            )[0],
          ]
    const queue = startNodes.map((nodeId) => ({ nodeId, rank: 0 }))

    while (queue.length > 0) {
      const current = queue.shift()!
      const previousRank = rankByNode.get(current.nodeId)
      if (previousRank != null && previousRank <= current.rank) continue

      rankByNode.set(current.nodeId, current.rank)

      for (const targetId of internalAdjacency.get(current.nodeId) ?? []) {
        queue.push({ nodeId: targetId, rank: current.rank + 1 })
      }
    }

    for (const nodeId of component) {
      if (!rankByNode.has(nodeId)) {
        rankByNode.set(nodeId, component.length)
      }
    }
  })

  return rankByNode
}

function compareComponentsByOriginalOrder(
  components: string[][],
  originalOrder: Map<string, number>,
  a: number,
  b: number,
) {
  return (
    getComponentOriginalOrder(components[a], originalOrder) -
    getComponentOriginalOrder(components[b], originalOrder)
  )
}

function getComponentOriginalOrder(component: string[], originalOrder: Map<string, number>) {
  return Math.min(
    ...component.map((nodeId) => originalOrder.get(nodeId) ?? Number.MAX_SAFE_INTEGER),
  )
}

function getFlowNodeTypeOrder(type: FlowNodeType) {
  if (type === 'start' || type === 'entry') return 0
  if (type === 'decision') return 1
  if (type === 'process' || type === 'question' || type === 'screen') return 2
  if (type === 'role' || type === 'data') return 2
  if (type === 'end' || type === 'exit') return 3
  return 2
}

function isFlowStart(node: FlowNode | undefined) {
  return node?.node_type === 'start' || node?.node_type === 'entry'
}

type FlowDetailBox = {
  id: string
  type: FlowNodeType
  x: number
  y: number
  width: number
  height: number
  right: number
  bottom: number
}

function routeFlowDetailEdges(
  nodes: FlowNode[],
  edges: FlowEdge[],
  layoutNodeById: Map<string, Position>,
): Array<{ id: string; sections: ModuleConnectionSection[] }> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const boxes = nodes
    .map((node) => {
      const position = layoutNodeById.get(node.id)
      if (!position) return null
      const dim = getFlowDetailNodeDimensions(node.node_type)
      return {
        id: node.id,
        type: node.node_type,
        x: position.x,
        y: position.y,
        width: dim.width,
        height: dim.height,
        right: position.x + dim.width,
        bottom: position.y + dim.height,
      }
    })
    .filter((box): box is FlowDetailBox => box != null)
  const boxById = new Map(boxes.map((box) => [box.id, box]))

  if (boxes.length === 0) {
    return edges.map((edge) => ({ id: edge.id, sections: [] }))
  }

  const bounds = {
    minX: Math.min(...boxes.map((box) => box.x)),
    maxX: Math.max(...boxes.map((box) => box.right)),
  }

  // Outgoing edges that share a source port get distinct start offsets so they
  // leave the node from visibly different spots instead of one stacked stub.
  // Incoming edges land apart by path kind (green success vs orange error) —
  // same-kind edges still converge on one entry point.
  const sourcePortCounts = new Map<string, number>()
  const sourcePortOrder = new Map<string, number>()
  const targetKinds = new Map<string, string[]>()
  const edgeKindById = new Map<string, string>()
  for (const edge of edges) {
    const sourceNode = nodeById.get(edge.source_node_id)
    const inferredHandle =
      sourceNode?.node_type === 'decision'
        ? inferDecisionSourceHandle(edge.label, edge.condition)
        : undefined
    const key = `${edge.source_node_id}::${inferredHandle ?? 'out'}`
    const order = sourcePortCounts.get(key) ?? 0
    sourcePortOrder.set(edge.id, order)
    sourcePortCounts.set(key, order + 1)

    const kind = getModuleFlowEdgeStyle({
      label: edge.label,
      condition: edge.condition,
      sourceHandle: inferredHandle ?? null,
    }).stroke
    edgeKindById.set(edge.id, kind)
    const kinds = targetKinds.get(edge.target_node_id) ?? []
    if (!kinds.includes(kind)) kinds.push(kind)
    targetKinds.set(edge.target_node_id, kinds)
  }

  return edges.map((edge, index) => {
    const sourceBox = boxById.get(edge.source_node_id)
    const targetBox = boxById.get(edge.target_node_id)
    if (!sourceBox || !targetBox) return { id: edge.id, sections: [] }

    const sourceNode = nodeById.get(edge.source_node_id)
    const sourceHandle =
      sourceNode?.node_type === 'decision'
        ? inferDecisionSourceHandle(edge.label, edge.condition)
        : undefined
    const handleKey = `${edge.source_node_id}::${sourceHandle ?? 'out'}`
    const siblingCount = sourcePortCounts.get(handleKey) ?? 1
    const spreadIndex = (sourcePortOrder.get(edge.id) ?? 0) - (siblingCount - 1) / 2
    const kinds = targetKinds.get(edge.target_node_id) ?? []
    const kindIndex = kinds.indexOf(edgeKindById.get(edge.id) ?? '')
    const targetSpreadIndex =
      kinds.length > 1 && kindIndex !== -1 ? kindIndex - (kinds.length - 1) / 2 : 0
    const candidates = buildFlowRouteCandidates(
      sourceBox,
      targetBox,
      sourceHandle,
      bounds,
      index,
      spreadIndex,
      targetSpreadIndex,
    )
    const collisionRects = boxes
      .filter((box) => box.id !== sourceBox.id && box.id !== targetBox.id)
      .map(padFlowBox)
    const bestCandidate = candidates
      .map((points) => ({
        points: collapseFlowRoutePoints(points),
        collisions: countFlowRouteCollisions(points, collisionRects),
        length: measureFlowRoute(points),
      }))
      .sort((a, b) => a.collisions - b.collisions || a.length - b.length)[0]

    return {
      id: edge.id,
      sections: bestCandidate ? pointsToFlowSections(bestCandidate.points) : [],
    }
  })
}

function buildFlowRouteCandidates(
  sourceBox: FlowDetailBox,
  targetBox: FlowDetailBox,
  sourceHandle: string | undefined,
  bounds: { minX: number; maxX: number },
  edgeIndex: number,
  spreadIndex = 0,
  targetSpreadIndex = 0,
): Position[][] {
  const sourcePoint = getFlowRouteSourcePoint(sourceBox, sourceHandle, spreadIndex)
  const targetPoint = getFlowRouteTargetPoint(targetBox, targetSpreadIndex)
  const candidates: Position[][] = []
  const sourceExitsRight = sourceHandle === 'no'
  const downwardGap = targetPoint.y - sourcePoint.y

  if (!sourceExitsRight && downwardGap > FLOW_ROUTE_STUB) {
    const midY = sourcePoint.y + downwardGap / 2
    candidates.push([
      sourcePoint,
      { x: sourcePoint.x, y: midY },
      { x: targetPoint.x, y: midY },
      targetPoint,
    ])
  }

  if (sourceExitsRight && downwardGap > FLOW_ROUTE_STUB / 2) {
    const sideX = Math.max(sourcePoint.x + FLOW_ROUTE_STUB, sourceBox.right + FLOW_ROUTE_STUB)
    const gapLaneX = targetBox.x - FLOW_ROUTE_NODE_PADDING - FLOW_ROUTE_GAP_MARGIN
    const targetInY = targetPoint.y - FLOW_ROUTE_STUB

    if (gapLaneX > sourceBox.right + FLOW_ROUTE_NODE_PADDING) {
      candidates.push([
        sourcePoint,
        { x: gapLaneX, y: sourcePoint.y },
        { x: gapLaneX, y: targetInY },
        { x: targetPoint.x, y: targetInY },
        targetPoint,
      ])
    }

    candidates.push([
      sourcePoint,
      { x: sideX, y: sourcePoint.y },
      { x: sideX, y: targetInY },
      { x: targetPoint.x, y: targetInY },
      targetPoint,
    ])
  }

  if (
    !sourceExitsRight &&
    downwardGap < -FLOW_ROUTE_STUB &&
    targetBox.right + FLOW_ROUTE_NODE_PADDING < sourceBox.x
  ) {
    const gapLaneX = sourceBox.x - FLOW_ROUTE_NODE_PADDING - FLOW_ROUTE_GAP_MARGIN
    const targetInY = targetPoint.y - FLOW_ROUTE_STUB
    const sourceOutY = sourcePoint.y + FLOW_ROUTE_STUB

    if (gapLaneX > targetBox.right + FLOW_ROUTE_NODE_PADDING) {
      candidates.push([
        sourcePoint,
        { x: sourcePoint.x, y: sourceOutY },
        { x: gapLaneX, y: sourceOutY },
        { x: gapLaneX, y: targetInY },
        { x: targetPoint.x, y: targetInY },
        targetPoint,
      ])
    }
  }

  const laneOffset = (edgeIndex % 5) * FLOW_ROUTE_LANE_STEP
  const rightLane = bounds.maxX + FLOW_ROUTE_LANE_GAP + laneOffset
  const leftLane = bounds.minX - FLOW_ROUTE_LANE_GAP - laneOffset
  const preferredLanes = sourceExitsRight ? [rightLane, leftLane] : [leftLane, rightLane]

  for (const laneX of preferredLanes) {
    candidates.push(buildPerimeterFlowRoute(sourcePoint, targetPoint, sourceExitsRight, laneX))
  }

  return candidates
}

/** Node shapes whose top/bottom edges are straight lines — safe to spread stubs along. */
const SPREADABLE_NODE_TYPES = new Set<FlowNodeType>([
  'process',
  'question',
  'entry',
  'exit',
  'screen',
  'data',
])

const STUB_SPREAD_STEP = 24

/** Diamonds and circles connect at a single vertex point, where offset stubs would float. */
function getStubSpread(box: FlowDetailBox, spreadIndex: number): number {
  if (!SPREADABLE_NODE_TYPES.has(box.type)) return 0
  const limit = box.width / 2 - 20
  return Math.max(Math.min(spreadIndex * STUB_SPREAD_STEP, limit), -limit)
}

function getFlowRouteSourcePoint(
  box: FlowDetailBox,
  sourceHandle: string | undefined,
  spreadIndex = 0,
): Position {
  if (sourceHandle === 'no') {
    return { x: box.right, y: box.y + box.height / 2 }
  }
  return { x: box.x + box.width / 2 + getStubSpread(box, spreadIndex), y: box.bottom }
}

function getFlowRouteTargetPoint(box: FlowDetailBox, spreadIndex = 0): Position {
  return { x: box.x + box.width / 2 + getStubSpread(box, spreadIndex), y: box.y }
}

function buildPerimeterFlowRoute(
  sourcePoint: Position,
  targetPoint: Position,
  sourceExitsRight: boolean,
  laneX: number,
): Position[] {
  const targetInY = targetPoint.y - FLOW_ROUTE_STUB

  if (sourceExitsRight) {
    return [
      sourcePoint,
      { x: laneX, y: sourcePoint.y },
      { x: laneX, y: targetInY },
      { x: targetPoint.x, y: targetInY },
      targetPoint,
    ]
  }

  const sourceOutY = sourcePoint.y + FLOW_ROUTE_STUB
  return [
    sourcePoint,
    { x: sourcePoint.x, y: sourceOutY },
    { x: laneX, y: sourceOutY },
    { x: laneX, y: targetInY },
    { x: targetPoint.x, y: targetInY },
    targetPoint,
  ]
}

function padFlowBox(box: FlowDetailBox) {
  return {
    x: box.x - FLOW_ROUTE_NODE_PADDING,
    y: box.y - FLOW_ROUTE_NODE_PADDING,
    right: box.right + FLOW_ROUTE_NODE_PADDING,
    bottom: box.bottom + FLOW_ROUTE_NODE_PADDING,
  }
}

function countFlowRouteCollisions(
  points: Position[],
  rects: Array<{ x: number; y: number; right: number; bottom: number }>,
) {
  let count = 0
  for (const rect of rects) {
    if (flowRouteIntersectsRect(points, rect)) count += 1
  }
  return count
}

function flowRouteIntersectsRect(
  points: Position[],
  rect: { x: number; y: number; right: number; bottom: number },
) {
  for (let index = 1; index < points.length; index += 1) {
    if (segmentIntersectsRect(points[index - 1], points[index], rect)) return true
  }
  return false
}

function segmentIntersectsRect(
  a: Position,
  b: Position,
  rect: { x: number; y: number; right: number; bottom: number },
) {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true

  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.right, y: rect.y },
    { x: rect.right, y: rect.bottom },
    { x: rect.x, y: rect.bottom },
  ]

  return corners.some((corner, index) =>
    segmentsIntersect(a, b, corner, corners[(index + 1) % corners.length]),
  )
}

function pointInRect(
  point: Position,
  rect: { x: number; y: number; right: number; bottom: number },
) {
  return point.x >= rect.x && point.x <= rect.right && point.y >= rect.y && point.y <= rect.bottom
}

function segmentsIntersect(a: Position, b: Position, c: Position, d: Position) {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x)
  if (denominator === 0) return false

  const ua = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / denominator
  const ub = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / denominator

  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
}

function measureFlowRoute(points: Position[]) {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index]
    return total + Math.hypot(point.x - previous.x, point.y - previous.y)
  }, 0)
}

function collapseFlowRoutePoints(points: Position[]) {
  const collapsed: Position[] = []

  for (const point of points) {
    const last = collapsed[collapsed.length - 1]
    if (last && last.x === point.x && last.y === point.y) continue

    collapsed.push(point)

    while (collapsed.length >= 3) {
      const first = collapsed[collapsed.length - 3]
      const middle = collapsed[collapsed.length - 2]
      const lastPoint = collapsed[collapsed.length - 1]
      const vertical = first.x === middle.x && middle.x === lastPoint.x
      const horizontal = first.y === middle.y && middle.y === lastPoint.y
      if (!vertical && !horizontal) break
      collapsed.splice(collapsed.length - 2, 1)
    }
  }

  return collapsed
}

function pointsToFlowSections(points: Position[]): ModuleConnectionSection[] {
  const collapsed = collapseFlowRoutePoints(points)
  if (collapsed.length < 2) return []

  return [
    {
      startPoint: collapsed[0],
      endPoint: collapsed[collapsed.length - 1],
      bendPoints: collapsed.slice(1, -1),
    },
  ]
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
