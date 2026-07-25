import type { FlowEdge, FlowNode } from '@/types/graph'

/** Node types that describe structure rather than sequence — excluded from the flow diagram. */
const NON_FLOW_TYPES = new Set<FlowNode['node_type']>(['screen', 'role', 'data', 'question'])

/** Mermaid ids must be alphanumeric-ish; ids from the DB are uuids with dashes. */
function mermaidId(nodeId: string, index: number): string {
  const cleaned = nodeId.replace(/[^a-zA-Z0-9]/g, '')
  return cleaned ? `n${cleaned}` : `n${index}`
}

/**
 * Mermaid treats several characters as syntax. Quoting the label and escaping inner quotes
 * covers the cases a real label hits — brackets, braces, parens, pipes and hashes.
 */
function escapeLabel(label: string): string {
  const cleaned = label.replace(/"/g, '#quot;').replace(/\n+/g, ' ').trim()
  return `"${cleaned}"`
}

function shapeFor(node: FlowNode, id: string): string {
  const label = escapeLabel(node.label)
  switch (node.node_type) {
    case 'decision':
      return `${id}{${label}}`
    case 'start':
    case 'end':
      return `${id}([${label}])`
    case 'entry':
    case 'exit':
      return `${id}[/${label}/]`
    default:
      return `${id}[${label}]`
  }
}

/**
 * Render a module's flow as a Mermaid `graph TD` block. Mermaid is the one diagram format
 * that pastes into Notion, Linear, GitHub and Confluence — where requirements documents live.
 */
export function renderFlowMermaid(nodes: FlowNode[], edges: FlowEdge[]): string {
  const flowNodes = nodes.filter((n) => !NON_FLOW_TYPES.has(n.node_type))
  if (flowNodes.length === 0) return ''

  const idMap = new Map<string, string>()
  flowNodes.forEach((node, index) => idMap.set(node.id, mermaidId(node.id, index)))

  const lines = ['graph TD']

  for (const node of flowNodes) {
    lines.push(`  ${shapeFor(node, idMap.get(node.id)!)}`)
  }

  for (const edge of edges) {
    const source = idMap.get(edge.source_node_id)
    const target = idMap.get(edge.target_node_id)
    // Skip edges touching an excluded node — an open question is not a branch of the flow.
    if (!source || !target) continue

    const label = edge.condition || edge.label
    lines.push(
      label ? `  ${source} -->|${escapeLabel(label)}| ${target}` : `  ${source} --> ${target}`,
    )
  }

  return lines.join('\n')
}

/** Wrap the diagram in a fenced block so it renders natively wherever markdown is read. */
export function renderFlowMermaidBlock(nodes: FlowNode[], edges: FlowEdge[]): string {
  const diagram = renderFlowMermaid(nodes, edges)
  if (!diagram) return ''

  return ['```mermaid', diagram, '```'].join('\n')
}
