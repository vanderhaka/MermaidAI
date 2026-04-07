import dagre from 'dagre'
import type { FlowNode, FlowEdge } from '@/types/graph'
import type { ModuleConnection } from '@/types/graph'
import { MODULE_CARD_WIDTH, MODULE_CARD_HEIGHT } from '@/components/canvas/nodes/ModuleCardNode'

export const DEFAULT_NODE_WIDTH = 172
export const DEFAULT_NODE_HEIGHT = 36

const MODULE_GAP_X = 120
const MODULE_GAP_Y = 100

const ERROR_KEYWORDS = /failure|fail|error|cancel|retry|return|rollback|reject/i

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
 * Semantic layout for the module map view.
 *
 * Designed for non-technical users — the happy path flows in a clean
 * horizontal line (left → right). Error/failure branches drop below
 * the main flow. Orphan modules sit in a row at the bottom.
 *
 * Algorithm:
 * 1. Find the "happy path" — the longest forward-only chain from a root
 *    module (one with no incoming forward edges).
 * 2. Place happy-path modules in a horizontal row at y=0.
 * 3. Place branch modules (connected via error exits) below their
 *    parent, aligned to the same column or offset right.
 * 4. Place orphan modules in a grid below everything.
 */
export function computeModuleLayout(
  nodes: FlowNode[],
  connections: ModuleConnection[],
): FlowNode[] {
  if (nodes.length === 0) return []

  if (connections.length === 0) {
    return computeGridLayout(
      nodes,
      MODULE_CARD_WIDTH,
      MODULE_CARD_HEIGHT,
      MODULE_GAP_X,
      MODULE_GAP_Y,
    )
  }

  const connectedIds = new Set<string>()
  for (const conn of connections) {
    connectedIds.add(conn.source_module_id)
    connectedIds.add(conn.target_module_id)
  }

  const orphans = nodes.filter((n) => !connectedIds.has(n.id))

  // Build adjacency: only forward (non-error) edges define the happy path
  const forwardChildren = new Map<string, string[]>()
  const errorChildren = new Map<string, string[]>()
  const hasIncomingForward = new Set<string>()

  for (const conn of connections) {
    const isError = ERROR_KEYWORDS.test(conn.source_exit_point)
    if (isError) {
      const list = errorChildren.get(conn.source_module_id) ?? []
      list.push(conn.target_module_id)
      errorChildren.set(conn.source_module_id, list)
    } else {
      const list = forwardChildren.get(conn.source_module_id) ?? []
      list.push(conn.target_module_id)
      forwardChildren.set(conn.source_module_id, list)
      hasIncomingForward.add(conn.target_module_id)
    }
  }

  // Find root: a connected module with no incoming forward edges
  const roots = nodes.filter((n) => connectedIds.has(n.id) && !hasIncomingForward.has(n.id))
  const startId = roots.length > 0 ? roots[0].id : nodes.find((n) => connectedIds.has(n.id))!.id

  // Walk the forward chain to build the happy path
  const happyPath: string[] = []
  const visited = new Set<string>()

  let current: string | undefined = startId
  while (current && !visited.has(current)) {
    visited.add(current)
    happyPath.push(current)
    const children: string[] = forwardChildren.get(current) ?? []
    // Pick the first unvisited forward child
    current = children.find((c: string) => !visited.has(c))
  }

  // Collect branch modules (reachable via error edges, not on the happy path)
  const happySet = new Set(happyPath)
  const branchModules: Array<{ id: string; parentId: string; parentIndex: number }> = []

  for (const conn of connections) {
    if (!happySet.has(conn.target_module_id) && !visited.has(conn.target_module_id)) {
      const parentIndex = happyPath.indexOf(conn.source_module_id)
      branchModules.push({
        id: conn.target_module_id,
        parentId: conn.source_module_id,
        parentIndex: parentIndex >= 0 ? parentIndex : happyPath.length - 1,
      })
      visited.add(conn.target_module_id)
    }
  }

  // Also catch any connected modules we haven't placed yet
  for (const node of nodes) {
    if (connectedIds.has(node.id) && !visited.has(node.id)) {
      branchModules.push({
        id: node.id,
        parentId: happyPath[happyPath.length - 1],
        parentIndex: happyPath.length - 1,
      })
      visited.add(node.id)
    }
  }

  // Position happy path: horizontal row
  const positioned = new Map<string, { x: number; y: number }>()
  const stepX = MODULE_CARD_WIDTH + MODULE_GAP_X

  for (let i = 0; i < happyPath.length; i++) {
    positioned.set(happyPath[i], { x: i * stepX, y: 0 })
  }

  // Position branch modules: below their parent, grouped by column
  const branchesByColumn = new Map<number, string[]>()
  for (const branch of branchModules) {
    const col = branch.parentIndex
    const list = branchesByColumn.get(col) ?? []
    list.push(branch.id)
    branchesByColumn.set(col, list)
  }

  const branchY = MODULE_CARD_HEIGHT + MODULE_GAP_Y

  for (const [col, ids] of branchesByColumn) {
    for (let i = 0; i < ids.length; i++) {
      positioned.set(ids[i], {
        x: col * stepX + (i > 0 ? (i * stepX) / 2 : 0),
        y: branchY + i * (MODULE_CARD_HEIGHT + MODULE_GAP_Y / 2),
      })
    }
  }

  // Position orphans: row below everything
  if (orphans.length > 0) {
    let maxY = 0
    for (const pos of positioned.values()) {
      maxY = Math.max(maxY, pos.y + MODULE_CARD_HEIGHT)
    }
    const orphanY = maxY + MODULE_GAP_Y

    for (let i = 0; i < orphans.length; i++) {
      positioned.set(orphans[i].id, {
        x: i * stepX,
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
