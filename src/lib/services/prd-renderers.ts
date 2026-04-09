import type { Module, FlowNode, FlowEdge, ModuleConnection, OpenQuestion } from '@/types/graph'

/**
 * Walk the graph from start nodes in order, producing a numbered flow sequence.
 * Falls back to listing by type if no start node exists.
 */
function walkFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const startNodes = nodes.filter((n) => n.node_type === 'start' || n.node_type === 'entry')
  if (startNodes.length === 0) return nodes.filter((n) => n.node_type !== 'end')

  const visited = new Set<string>()
  const ordered: FlowNode[] = []
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (!node) return
    ordered.push(node)

    const outgoing = edges
      .filter((e) => e.source_node_id === nodeId)
      .sort((a, b) => {
        // Put the "main" path first (no condition or label), branches after
        if (!a.condition && !a.label) return -1
        if (!b.condition && !b.label) return 1
        return 0
      })

    for (const edge of outgoing) {
      visit(edge.target_node_id)
    }
  }

  for (const start of startNodes) visit(start.id)

  // Append any unvisited non-end nodes (disconnected islands)
  for (const node of nodes) {
    if (!visited.has(node.id) && node.node_type !== 'end') {
      ordered.push(node)
    }
  }

  return ordered
}

export function renderFlowSection(nodes: FlowNode[], edges: FlowEdge[]): string {
  const ordered = walkFlow(nodes, edges)
  if (ordered.length === 0) return ''

  const lines: string[] = []
  let stepNum = 1

  for (const node of ordered) {
    if (node.node_type === 'start') {
      continue // Skip "Start" label — the flow begins at step 1
    }

    if (node.node_type === 'decision') {
      lines.push(`${stepNum}. **${node.label}** *(decision)*`)
      stepNum++
      if (node.pseudocode) {
        lines.push(`   > ${node.pseudocode}`)
      }

      const outgoing = edges.filter((e) => e.source_node_id === node.id)
      if (outgoing.length > 0) {
        lines.push('')
        for (const edge of outgoing) {
          const target = nodes.find((n) => n.id === edge.target_node_id)
          const condition = edge.condition || edge.label || 'Default'
          lines.push(`   - **${condition}** → ${target?.label ?? 'Unknown'}`)
        }
      }
      lines.push('')
    } else if (node.node_type === 'end') {
      lines.push(`${stepNum}. **End** — ${node.label}`)
      stepNum++
      lines.push('')
    } else {
      lines.push(`${stepNum}. **${node.label}**`)
      stepNum++
      if (node.pseudocode) {
        lines.push(`   > ${node.pseudocode}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

export function renderQuestionsSection(questions: OpenQuestion[]): string {
  const open = questions.filter((q) => q.status === 'open')
  const resolved = questions.filter((q) => q.status === 'resolved')

  if (open.length === 0 && resolved.length === 0) return ''

  const lines: string[] = []

  if (open.length > 0) {
    lines.push('### Open', '')
    for (const q of open) {
      lines.push(`- [ ] **${q.section}** — ${q.question}`)
    }
    lines.push('')
  }

  if (resolved.length > 0) {
    lines.push('### Resolved', '')
    for (const q of resolved) {
      lines.push(`- [x] **${q.section}** — ${q.question}`)
      if (q.resolution) lines.push(`  - ${q.resolution}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function renderModulePrd(
  module: Module,
  nodes: FlowNode[],
  edges: FlowEdge[],
  connections: ModuleConnection[],
  questions: OpenQuestion[],
  allModules: Module[],
  options?: { skipHeader?: boolean },
): string {
  const moduleNodes = nodes.filter((n) => n.module_id === module.id)
  const moduleEdges = edges.filter((e) => e.module_id === module.id)
  const moduleNodeIds = new Set(moduleNodes.map((n) => n.id))
  const moduleQuestions = questions.filter((q) => moduleNodeIds.has(q.node_id))

  const lines: string[] = []

  if (!options?.skipHeader) {
    lines.push(`# ${module.name}`, '')
    if (module.domain) lines.push(`> **Domain**: ${module.domain}`, '')
    if (module.description && !module.description.startsWith('Auto-created')) {
      lines.push(module.description, '')
    }
  }

  // Interface — compact inline format
  if (module.entry_points.length > 0 || module.exit_points.length > 0) {
    lines.push('## Interface', '')
    if (module.entry_points.length > 0) {
      lines.push(`**In:** ${module.entry_points.join(', ')}`)
    }
    if (module.exit_points.length > 0) {
      lines.push(`**Out:** ${module.exit_points.join(', ')}`)
    }
    lines.push('')
  }

  // Dependencies
  const inbound = connections.filter((c) => c.target_module_id === module.id)
  const outbound = connections.filter((c) => c.source_module_id === module.id)

  if (inbound.length > 0 || outbound.length > 0) {
    lines.push('## Dependencies', '')
    for (const conn of inbound) {
      const src = allModules.find((m) => m.id === conn.source_module_id)
      lines.push(
        `- ← ${src?.name ?? 'Unknown'} (${conn.source_exit_point} → ${conn.target_entry_point})`,
      )
    }
    for (const conn of outbound) {
      const tgt = allModules.find((m) => m.id === conn.target_module_id)
      lines.push(
        `- → ${tgt?.name ?? 'Unknown'} (${conn.source_exit_point} → ${conn.target_entry_point})`,
      )
    }
    lines.push('')
  }

  // Flow — as numbered sequence
  if (moduleNodes.length > 0) {
    lines.push('## Flow', '')
    lines.push(renderFlowSection(moduleNodes, moduleEdges))
  }

  // Questions
  const questionsSection = renderQuestionsSection(moduleQuestions)
  if (questionsSection) {
    lines.push('## Questions', '')
    lines.push(questionsSection)
  }

  return lines.join('\n')
}
