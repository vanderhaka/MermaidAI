import type { FlowEdge, FlowNode } from '@/types/graph'

export type FlowGraphIssueCode =
  | 'unreachable_node'
  | 'dead_end'
  | 'missing_decision_branch'
  | 'contradictory_terminal_recovery'

export type FlowGraphIssue = {
  code: FlowGraphIssueCode
  nodeId: string
  message: string
  edgeIds?: string[]
}

type GraphInput = {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

type BranchKind = 'positive' | 'negative' | 'recovery' | 'unknown'

const POSITIVE_OUTCOME =
  /\b(yes|y|true|valid|success|successful|pass|passed|approved|accept|accepted|available|sufficient|stock ok|not empty)\b/i
const NEGATIVE_OUTCOME =
  /\b(no|n|false|invalid|fail|failed|failure|error|reject|rejected|deny|denied|empty|insufficient|out of stock|low stock)\b/i
const RECOVERY_OUTCOME = /\b(retry|again|back|return|skip|continue)\b/i

function classifyBranch(edge: FlowEdge): BranchKind {
  const text = `${edge.label ?? ''} ${edge.condition ?? ''}`.trim()
  if (!text) return 'unknown'
  if (RECOVERY_OUTCOME.test(text)) return 'recovery'
  if (NEGATIVE_OUTCOME.test(text)) return 'negative'
  if (POSITIVE_OUTCOME.test(text)) return 'positive'
  return 'unknown'
}

function isTerminalNode(node: FlowNode | undefined): boolean {
  return node?.node_type === 'end' || node?.node_type === 'exit'
}

export function validateFlowGraph({ nodes, edges }: GraphInput): FlowGraphIssue[] {
  const issues: FlowGraphIssue[] = []
  const processNodes = nodes.filter((node) => node.node_type !== 'question')
  const processNodeIds = new Set(processNodes.map((node) => node.id))
  const nodeById = new Map(processNodes.map((node) => [node.id, node]))
  const processEdges = edges.filter(
    (edge) => processNodeIds.has(edge.source_node_id) && processNodeIds.has(edge.target_node_id),
  )
  const outgoing = new Map<string, FlowEdge[]>()
  const incoming = new Map<string, FlowEdge[]>()

  for (const edge of processEdges) {
    outgoing.set(edge.source_node_id, [...(outgoing.get(edge.source_node_id) ?? []), edge])
    incoming.set(edge.target_node_id, [...(incoming.get(edge.target_node_id) ?? []), edge])
  }

  const startNodes = processNodes.filter((node) => node.node_type === 'start')
  const roots =
    startNodes.length > 0
      ? startNodes
      : processNodes.filter((node) => (incoming.get(node.id) ?? []).length === 0)

  const reachable = new Set<string>()
  const queue = roots.map((node) => node.id)
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id || reachable.has(id)) continue
    reachable.add(id)
    for (const edge of outgoing.get(id) ?? []) {
      if (!reachable.has(edge.target_node_id)) queue.push(edge.target_node_id)
    }
  }

  for (const node of processNodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        code: 'unreachable_node',
        nodeId: node.id,
        message: `"${node.label}" is not reachable from the flow start.`,
      })
    }
  }

  for (const node of processNodes) {
    const nodeOutgoing = outgoing.get(node.id) ?? []
    if (!isTerminalNode(node) && node.node_type !== 'decision' && nodeOutgoing.length === 0) {
      issues.push({
        code: 'dead_end',
        nodeId: node.id,
        message: `"${node.label}" does not lead to another step or terminal node.`,
      })
    }

    if (node.node_type !== 'decision') continue

    const classified = nodeOutgoing.map((edge) => ({ edge, kind: classifyBranch(edge) }))
    const hasPositive = classified.some(({ kind }) => kind === 'positive')
    const hasNegative = classified.some(({ kind }) => kind === 'negative')

    if (
      nodeOutgoing.length === 1 ||
      (hasPositive !== hasNegative && (hasPositive || hasNegative))
    ) {
      issues.push({
        code: 'missing_decision_branch',
        nodeId: node.id,
        message: `"${node.label}" does not have both positive and negative decision outcomes.`,
        edgeIds: nodeOutgoing.map((edge) => edge.id),
      })
    }

    const negativeEdges = classified.filter(({ kind }) => kind === 'negative')
    const terminalNegativeEdges = negativeEdges.filter(({ edge }) =>
      isTerminalNode(nodeById.get(edge.target_node_id)),
    )
    const recoveryNegativeEdges = negativeEdges.filter(
      ({ edge }) => !isTerminalNode(nodeById.get(edge.target_node_id)),
    )
    if (terminalNegativeEdges.length > 0 && recoveryNegativeEdges.length > 0) {
      issues.push({
        code: 'contradictory_terminal_recovery',
        nodeId: node.id,
        message: `"${node.label}" sends a negative outcome to both a terminal node and a recovery path.`,
        edgeIds: [...terminalNegativeEdges, ...recoveryNegativeEdges].map(({ edge }) => edge.id),
      })
    }
  }

  return issues
}
