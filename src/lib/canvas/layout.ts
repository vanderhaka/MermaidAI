import dagre from 'dagre'
import type { FlowNode, FlowEdge } from '@/types/graph'
import type { ModuleConnection } from '@/types/graph'
import { MODULE_CARD_WIDTH, MODULE_CARD_HEIGHT } from '@/components/canvas/nodes/ModuleCardNode'

export const DEFAULT_NODE_WIDTH = 172
export const DEFAULT_NODE_HEIGHT = 36

const MODULE_GAP_X = 60
const MODULE_GAP_Y = 50

/**
 * Layout for internal module nodes (process, decision, start, end, etc.).
 * Uses dagre when edges exist, grid fallback otherwise.
 */
export function computeLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  if (nodes.length === 0) return []

  if (edges.length === 0) {
    return computeGridLayout(nodes, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT, 40, 40)
  }

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    g.setNode(node.id, { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT })
  }

  for (const edge of edges) {
    g.setEdge(edge.source_node_id, edge.target_node_id)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: { x: pos.x - DEFAULT_NODE_WIDTH / 2, y: pos.y - DEFAULT_NODE_HEIGHT / 2 },
    }
  })
}

/**
 * Layout for module map view. Uses dagre for connected modules (directed flow),
 * grid for disconnected modules, and combines both when some modules are
 * connected and others aren't.
 */
export function computeModuleLayout(
  nodes: FlowNode[],
  connections: ModuleConnection[],
): FlowNode[] {
  if (nodes.length === 0) return []

  // No connections — clean grid
  if (connections.length === 0) {
    return computeGridLayout(
      nodes,
      MODULE_CARD_WIDTH,
      MODULE_CARD_HEIGHT,
      MODULE_GAP_X,
      MODULE_GAP_Y,
    )
  }

  // Build connection set to identify connected vs orphan modules
  const connectedIds = new Set<string>()
  for (const conn of connections) {
    connectedIds.add(conn.source_module_id)
    connectedIds.add(conn.target_module_id)
  }

  const connected = nodes.filter((n) => connectedIds.has(n.id))
  const orphans = nodes.filter((n) => !connectedIds.has(n.id))

  // Layout connected modules with dagre
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: MODULE_GAP_Y, ranksep: MODULE_GAP_X * 2 })
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of connected) {
    g.setNode(node.id, { width: MODULE_CARD_WIDTH, height: MODULE_CARD_HEIGHT })
  }

  for (const conn of connections) {
    g.setEdge(conn.source_module_id, conn.target_module_id)
  }

  dagre.layout(g)

  const positioned = new Map<string, { x: number; y: number }>()
  let maxX = 0
  let maxY = 0

  for (const node of connected) {
    const pos = g.node(node.id)
    const x = pos.x - MODULE_CARD_WIDTH / 2
    const y = pos.y - MODULE_CARD_HEIGHT / 2
    positioned.set(node.id, { x, y })
    maxX = Math.max(maxX, x + MODULE_CARD_WIDTH)
    maxY = Math.max(maxY, y + MODULE_CARD_HEIGHT)
  }

  // Place orphan modules in a row below the connected graph
  if (orphans.length > 0) {
    const orphanY = maxY + MODULE_GAP_Y * 2

    for (let i = 0; i < orphans.length; i++) {
      positioned.set(orphans[i].id, {
        x: i * (MODULE_CARD_WIDTH + MODULE_GAP_X),
        y: orphanY,
      })
    }
  }

  return nodes.map((node) => ({
    ...node,
    position: positioned.get(node.id) ?? node.position,
  }))
}

function computeGridLayout(
  nodes: FlowNode[],
  itemWidth: number,
  itemHeight: number,
  gapX: number,
  gapY: number,
): FlowNode[] {
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
