'use client'

import { useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import type { Edge, Node, NodeMouseHandler } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import RequirementNode, {
  REQUIREMENT_CARD_HEIGHT,
  REQUIREMENT_CARD_WIDTH,
  type RequirementNodeData,
} from '@/components/canvas/nodes/RequirementNode'
import {
  buildRequirementGraph,
  findConflicts,
  REQUIREMENT_LINK_STYLE,
} from '@/lib/canvas/requirement-graph'
import type {
  Module,
  OpenQuestion,
  Requirement,
  RequirementLink,
  RequirementNode as RequirementNodeLink,
} from '@/types/graph'

const nodeTypes = { requirement: RequirementNode }

export type RequirementsViewProps = {
  requirements: Requirement[]
  links: RequirementLink[]
  requirementNodes?: RequirementNodeLink[]
  modules?: Module[]
  openQuestions?: OpenQuestion[]
  /** Selecting a requirement reports the flow nodes it governs, for cross-highlighting. */
  onRequirementSelect?: (requirementId: string, governedNodeIds: string[]) => void
}

/** Open questions in the same coverage area still block that area's requirements. */
export function countBlockingQuestions(
  requirements: Requirement[],
  openQuestions: OpenQuestion[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  const open = openQuestions.filter((q) => q.status === 'open')

  for (const requirement of requirements) {
    const area = requirement.coverage_area
    if (!area) continue
    counts[requirement.id] = open.filter((q) => (q.coverage_area ?? q.section) === area).length
  }

  return counts
}

function RequirementsFlow({
  requirements,
  links,
  requirementNodes,
  modules,
  openQuestions,
  onRequirementSelect,
}: RequirementsViewProps) {
  const graph = useMemo(
    () =>
      buildRequirementGraph({
        requirements,
        links,
        requirementNodes,
        modules,
        blockingQuestionCounts: countBlockingQuestions(requirements, openQuestions ?? []),
      }),
    [requirements, links, requirementNodes, modules, openQuestions],
  )

  const conflictedIds = useMemo(() => new Set(findConflicts(graph).map((n) => n.id)), [graph])

  const nodes = useMemo<Node[]>(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: 'requirement',
        position: node.position,
        width: REQUIREMENT_CARD_WIDTH,
        height: REQUIREMENT_CARD_HEIGHT,
        data: {
          statement: node.requirement.statement,
          status: node.requirement.status,
          kind: node.requirement.kind,
          groupLabel: node.groupLabel,
          blockedBy: node.blockedBy,
          conflicted: conflictedIds.has(node.id),
        } satisfies RequirementNodeData,
      })),
    [graph, conflictedIds],
  )

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => {
        const style = REQUIREMENT_LINK_STYLE[edge.kind]
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: style.label,
          labelStyle: { fontSize: 10, fill: style.stroke },
          markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke, width: 14, height: 14 },
          style: {
            stroke: style.stroke,
            strokeWidth: edge.kind === 'conflicts_with' ? 2 : 1.5,
            strokeDasharray: style.dashed ? '6 3' : undefined,
          },
        }
      }),
    [graph],
  )

  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    const match = graph.nodes.find((n) => n.id === node.id)
    onRequirementSelect?.(node.id, match?.governs ?? [])
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.15}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
    >
      <Controls />
      <Background variant={BackgroundVariant.Dots} />
    </ReactFlow>
  )
}

export default function RequirementsView(props: RequirementsViewProps) {
  if (props.requirements.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid="requirements-empty-state"
      >
        <div className="flex max-w-sm flex-col items-center gap-2 text-center">
          <p className="text-base font-medium text-gray-500">No requirements yet.</p>
          <p className="text-sm text-gray-400">
            Requirements appear here as the client answers open questions — each answer becomes one.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <RequirementsFlow {...props} />
    </ReactFlowProvider>
  )
}
