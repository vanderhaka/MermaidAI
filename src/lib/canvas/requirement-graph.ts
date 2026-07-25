import type {
  Module,
  Requirement,
  RequirementLink,
  RequirementLinkKind,
  RequirementNode,
  RequirementStatus,
} from '@/types/graph'

export const REQUIREMENT_STATUS_COLOR: Record<RequirementStatus, string> = {
  proposed: '#94a3b8',
  agreed: '#10b981',
  disputed: '#f59e0b',
  out_of_scope: '#cbd5e1',
}

export const REQUIREMENT_LINK_STYLE: Record<
  RequirementLinkKind,
  { stroke: string; dashed: boolean; label: string }
> = {
  depends_on: { stroke: '#64748b', dashed: false, label: 'depends on' },
  conflicts_with: { stroke: '#ef4444', dashed: true, label: 'conflicts with' },
  refines: { stroke: '#8b5cf6', dashed: true, label: 'refines' },
}

const COLUMN_WIDTH = 320
const ROW_HEIGHT = 132
const GROUP_GAP = 64

export type RequirementGraphNode = {
  id: string
  position: { x: number; y: number }
  requirement: Requirement
  groupLabel: string
  /** Node ids this requirement governs, for cross-highlighting onto the flow view. */
  governs: string[]
  /** Count of unresolved questions still blocking this requirement. */
  blockedBy: number
}

export type RequirementGraphEdge = {
  id: string
  source: string
  target: string
  kind: RequirementLinkKind
}

export type RequirementGraph = {
  nodes: RequirementGraphNode[]
  edges: RequirementGraphEdge[]
}

function groupLabelFor(requirement: Requirement, modules: Module[]): string {
  if (requirement.module_id) {
    const owningModule = modules.find((m) => m.id === requirement.module_id)
    if (owningModule) return owningModule.name
  }
  return requirement.coverage_area?.trim() || 'Unassigned'
}

/**
 * Lay requirements out in columns by group (module, else coverage area). Deterministic —
 * no layout engine needed, because requirement graphs are small and readability beats density.
 */
export function buildRequirementGraph(input: {
  requirements: Requirement[]
  links: RequirementLink[]
  requirementNodes?: RequirementNode[]
  modules?: Module[]
  blockingQuestionCounts?: Record<string, number>
}): RequirementGraph {
  const { requirements, links } = input
  const modules = input.modules ?? []
  const requirementNodes = input.requirementNodes ?? []
  const blocking = input.blockingQuestionCounts ?? {}

  const groups = new Map<string, Requirement[]>()
  for (const requirement of requirements) {
    const label = groupLabelFor(requirement, modules)
    const bucket = groups.get(label) ?? []
    bucket.push(requirement)
    groups.set(label, bucket)
  }

  const governsByRequirement = new Map<string, string[]>()
  for (const link of requirementNodes) {
    const list = governsByRequirement.get(link.requirement_id) ?? []
    list.push(link.node_id)
    governsByRequirement.set(link.requirement_id, list)
  }

  const orderedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))

  const nodes: RequirementGraphNode[] = []
  orderedGroups.forEach(([groupLabel, group], columnIndex) => {
    group.forEach((requirement, rowIndex) => {
      nodes.push({
        id: requirement.id,
        position: {
          x: columnIndex * (COLUMN_WIDTH + GROUP_GAP),
          y: rowIndex * ROW_HEIGHT,
        },
        requirement,
        groupLabel,
        governs: governsByRequirement.get(requirement.id) ?? [],
        blockedBy: blocking[requirement.id] ?? 0,
      })
    })
  })

  // Drop links whose endpoints are not both present, so a deleted requirement cannot
  // leave a dangling edge on the canvas.
  const presentIds = new Set(requirements.map((r) => r.id))
  const edges: RequirementGraphEdge[] = links
    .filter(
      (link) =>
        presentIds.has(link.source_requirement_id) && presentIds.has(link.target_requirement_id),
    )
    .map((link) => ({
      id: link.id,
      source: link.source_requirement_id,
      target: link.target_requirement_id,
      kind: link.kind,
    }))

  return { nodes, edges }
}

/** Requirements that conflict with something — the set worth surfacing first. */
export function findConflicts(graph: RequirementGraph): RequirementGraphNode[] {
  const conflicting = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.kind === 'conflicts_with') {
      conflicting.add(edge.source)
      conflicting.add(edge.target)
    }
  }

  return graph.nodes.filter((node) => conflicting.has(node.id))
}
