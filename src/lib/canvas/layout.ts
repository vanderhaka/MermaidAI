import dagre from 'dagre'
import type { FlowNode, FlowEdge } from '@/types/graph'

export const DEFAULT_NODE_WIDTH = 172
export const DEFAULT_NODE_HEIGHT = 36

export function computeLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  if (nodes.length === 0) return []

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB' })
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
      position: { x: pos.x, y: pos.y },
    }
  })
}
