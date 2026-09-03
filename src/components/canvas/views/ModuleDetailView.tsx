'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import type { Node, Edge } from '@xyflow/react'
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  BackgroundVariant,
  useReactFlow,
  useStore,
  useStoreApi,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FlowNode, FlowEdge } from '@/types/graph'
import {
  computeFlowDetailLayout,
  getFlowDetailNodeDimensions,
  type FlowDetailLayoutResult,
} from '@/lib/canvas/layout'
import { getModuleFlowEdgeStyle, inferDecisionSourceHandle } from '@/lib/canvas/flow-edge-style'
import type { ModuleConnectionSection } from '@/lib/canvas/layout'
import DecisionNode from '@/components/canvas/nodes/DecisionNode'
import ProcessNode from '@/components/canvas/nodes/ProcessNode'
import EntryNode from '@/components/canvas/nodes/EntryNode'
import ExitNode from '@/components/canvas/nodes/ExitNode'
import StartNode from '@/components/canvas/nodes/StartNode'
import EndNode from '@/components/canvas/nodes/EndNode'
import QuestionNode from '@/components/canvas/nodes/QuestionNode'
import ConditionEdge from '@/components/canvas/edges/ConditionEdge'
import ModuleNotesSheet from '@/components/canvas/views/ModuleNotesSheet'

type FunnelLaneData = {
  title: string
  description: string
  width: number
  height: number
  tone: 'teal' | 'blue' | 'amber' | 'emerald' | 'rose'
}

function NotesGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M4 2a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
        clipRule="evenodd"
      />
    </svg>
  )
}

const nodeTypes = {
  decision: DecisionNode,
  process: ProcessNode,
  entry: EntryNode,
  exit: ExitNode,
  start: StartNode,
  end: EndNode,
  question: QuestionNode,
  funnelLane: FunnelLaneNode,
}

const edgeTypes = {
  condition: ConditionEdge,
}

/** Stable identity so an unset prop does not bust the node memo every render. */
const NO_CHANGED_NODE_IDS: ReadonlySet<string> = new Set<string>()

type ModuleDetailViewProps = {
  moduleName: string
  /** L1 domain label (e.g. Payments) for hierarchy context */
  domainLabel?: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  /** Nodes the last assistant turn touched — rendered with a fading change ring. */
  changedNodeIds?: ReadonlySet<string>
  showFunnelLanes?: boolean
  onBack?: () => void
}

function FunnelLaneNode({ data }: { data: FunnelLaneData }) {
  const toneStyles = {
    teal: 'border-teal-200 bg-teal-50/50 text-teal-700',
    blue: 'border-blue-200 bg-blue-50/50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50/50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50/50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50/50 text-rose-700',
  }

  return (
    <div
      className={`pointer-events-none rounded-md border border-dashed px-4 py-3 shadow-sm ${toneStyles[data.tone]}`}
      style={{ width: data.width, height: data.height }}
    >
      <p className="text-xs font-bold uppercase tracking-wide">{data.title}</p>
      <p className="mt-1 max-w-sm text-[11px] leading-snug opacity-80">{data.description}</p>
    </div>
  )
}

function toReactFlowNodes(
  nodes: FlowNode[],
  layoutNodes: Map<string, { id: string; position: { x: number; y: number } }>,
  showFunnelLanes = false,
  changedNodeIds: ReadonlySet<string> = NO_CHANGED_NODE_IDS,
): Node[] {
  const getNodeData = (node: FlowNode) => {
    const base = {
      label: node.label,
      pseudocode: node.pseudocode,
      recentlyChanged: changedNodeIds.has(node.id),
    }
    return node.node_type === 'question' ? { ...base, question: node.label } : base
  }

  if (showFunnelLanes) {
    const funnelLayout = buildFunnelLaneLayout(nodes, layoutNodes)
    const flowNodes = nodes.map((n) => {
      const dim = getFlowDetailNodeDimensions(n.node_type)
      const layoutPos = funnelLayout.positions.get(n.id) ?? n.position
      return {
        id: n.id,
        type: n.node_type,
        position: layoutPos,
        width: dim.width,
        height: dim.height,
        data: getNodeData(n),
      }
    })

    return [...funnelLayout.lanes, ...flowNodes]
  }

  const flowNodes = nodes.map((n) => {
    const dim = getFlowDetailNodeDimensions(n.node_type)
    const layoutPos = layoutNodes.get(n.id)?.position ?? n.position
    return {
      id: n.id,
      type: n.node_type,
      position: layoutPos,
      width: dim.width,
      height: dim.height,
      data: getNodeData(n),
    }
  })

  return flowNodes
}

type FunnelLaneDefinition = {
  id: string
  title: string
  description: string
  tone: FunnelLaneData['tone']
}

const FUNNEL_LANES: FunnelLaneDefinition[] = [
  {
    id: 'sources',
    title: 'Sources',
    description: 'Where leads enter the funnel.',
    tone: 'teal',
  },
  {
    id: 'capture',
    title: 'Capture',
    description: 'Pages, magnets, and forms that convert attention into a lead.',
    tone: 'blue',
  },
  {
    id: 'score',
    title: 'Score',
    description: 'Qualification and lead-score routing before the next action.',
    tone: 'amber',
  },
  {
    id: 'sales',
    title: 'Sales',
    description: 'High-intent booking, sales call, quote, and won-job path.',
    tone: 'emerald',
  },
  {
    id: 'nurture',
    title: 'Nurture & Outlets',
    description: 'Follow-up, lost reasons, redirects, and re-engagement paths.',
    tone: 'rose',
  },
]

function getFunnelLaneId(node: FlowNode): FunnelLaneDefinition['id'] {
  const label = node.label.toLowerCase()

  if (
    node.node_type === 'start' ||
    /\b(instagram|meta|google|referral|website direct|past client|source|ad|search)\b/.test(label)
  ) {
    return 'sources'
  }

  if (/\b(landing|lead magnet|form|quote request|capture)\b/.test(label)) {
    return 'capture'
  }

  if (/\b(score|qualif|intent|disqualified|out of service|service area)\b/.test(label)) {
    return 'score'
  }

  if (/\b(high|fast book|booked|sales call|quote sent|quote response|won|job won)\b/.test(label)) {
    return 'sales'
  }

  return 'nurture'
}

function buildFunnelLaneLayout(
  nodes: FlowNode[],
  layoutNodes: Map<string, { id: string; position: { x: number; y: number } }>,
): { positions: Map<string, { x: number; y: number }>; lanes: Node<FunnelLaneData>[] } {
  if (nodes.length === 0) return { positions: new Map(), lanes: [] }

  const positionedNodes = nodes.map((node) => {
    const dim = getFlowDetailNodeDimensions(node.node_type)
    const position = layoutNodes.get(node.id)?.position ?? node.position
    return { node, dim, position, laneId: getFunnelLaneId(node) }
  })

  const positions = new Map<string, { x: number; y: number }>()
  const laneWidth = 230
  const laneGap = 56
  const laneTop = 0
  const nodeTop = 132
  const laneLeft = -20
  const laneHeights = new Map<string, number>()

  for (const [laneIndex, lane] of FUNNEL_LANES.entries()) {
    const laneItems = positionedNodes
      .filter((item) => item.laneId === lane.id)
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    const laneX = laneLeft + laneIndex * (laneWidth + laneGap)
    let nextY = nodeTop

    for (const item of laneItems) {
      positions.set(item.node.id, {
        x: laneX + (laneWidth - item.dim.width) / 2,
        y: nextY,
      })
      nextY += item.dim.height + 58
    }

    laneHeights.set(lane.id, Math.max(520, nextY - laneTop + 32))
  }

  const maxLaneHeight = Math.max(...Array.from(laneHeights.values()))
  const lanes = FUNNEL_LANES.map((lane, laneIndex) => ({
    id: `funnel-lane-${lane.id}`,
    type: 'funnelLane',
    position: { x: laneLeft + laneIndex * (laneWidth + laneGap), y: laneTop },
    selectable: false,
    draggable: false,
    focusable: false,
    zIndex: -10,
    data: {
      title: lane.title,
      description: lane.description,
      width: laneWidth,
      height: maxLaneHeight,
      tone: lane.tone,
    },
  }))

  return { positions, lanes }
}

function toReactFlowEdges(
  nodes: FlowNode[],
  edges: FlowEdge[],
  layoutEdges: Map<string, ModuleConnectionSection[]>,
  showFunnelLanes = false,
): Edge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  return edges.map((e) => {
    const sourceNode = nodesById.get(e.source_node_id)
    const sourceHandle =
      sourceNode?.node_type === 'decision'
        ? inferDecisionSourceHandle(e.label, e.condition)
        : undefined
    const s = getModuleFlowEdgeStyle({
      label: e.label,
      condition: e.condition,
      sourceHandle: sourceHandle ?? null,
    })
    const flowEdge: Edge = {
      id: e.id,
      source: e.source_node_id,
      target: e.target_node_id,
      type: 'condition',
      data: {
        label: e.label,
        condition: e.condition,
        labelColor: s.labelColor,
        sections: showFunnelLanes ? [] : (layoutEdges.get(e.id) ?? []),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: s.markerColor, width: 16, height: 16 },
      style: {
        stroke: s.stroke,
        strokeWidth: s.isErrorPath ? 1.5 : 2,
        strokeDasharray: s.isErrorPath ? '6 3' : undefined,
      },
    }

    if (sourceHandle) {
      flowEdge.sourceHandle = sourceHandle
    }

    return flowEdge
  })
}

function normalizeEdgeDetail(value: string | null): string {
  return value?.trim().toLocaleLowerCase() ?? ''
}

function collapseDuplicateRoutes(edges: FlowEdge[]): FlowEdge[] {
  const collapsed: FlowEdge[] = []
  const routeIndexes = new Map<string, number[]>()

  for (const edge of edges) {
    const routeKey = `${edge.source_node_id}\u0000${edge.target_node_id}`
    const indexes = routeIndexes.get(routeKey) ?? []
    const label = normalizeEdgeDetail(edge.label)
    const condition = normalizeEdgeDetail(edge.condition)
    const isBare = !label && !condition
    const exactMatch = indexes.find((index) => {
      const candidate = collapsed[index]
      return (
        normalizeEdgeDetail(candidate.label) === label &&
        normalizeEdgeDetail(candidate.condition) === condition
      )
    })

    if (exactMatch !== undefined) continue

    const bareIndex = indexes.find((index) => {
      const candidate = collapsed[index]
      return !normalizeEdgeDetail(candidate.label) && !normalizeEdgeDetail(candidate.condition)
    })

    if (isBare && indexes.length > 0) continue
    if (bareIndex !== undefined) {
      collapsed[bareIndex] = edge
      continue
    }

    indexes.push(collapsed.length)
    routeIndexes.set(routeKey, indexes)
    collapsed.push(edge)
  }

  return collapsed
}

function ModuleDetailFlow({
  nodes,
  edges,
  layout,
  changedNodeIds,
  showFunnelLanes = false,
}: {
  nodes: FlowNode[]
  edges: FlowEdge[]
  layout: FlowDetailLayoutResult
  changedNodeIds: ReadonlySet<string>
  showFunnelLanes?: boolean
}) {
  const { fitView } = useReactFlow()
  const store = useStoreApi()

  const { rfNodes, rfEdges } = useMemo(() => {
    const layoutNodesMap = new Map(layout.nodes.map((n) => [n.id, n]))
    const layoutEdgesMap = new Map(layout.edges.map((e) => [e.id, e.sections]))
    return {
      rfNodes: toReactFlowNodes(nodes, layoutNodesMap, showFunnelLanes, changedNodeIds),
      rfEdges: toReactFlowEdges(nodes, edges, layoutEdgesMap, showFunnelLanes),
    }
  }, [nodes, edges, layout, showFunnelLanes, changedNodeIds])
  const flowMeasurementReady = useStore(
    (state) =>
      Boolean(state.domNode) &&
      state.width > 0 &&
      state.height > 0 &&
      state.nodeLookup.size >= rfNodes.length,
  )
  const fitViewOptions = useMemo(() => {
    const processNodeTargets = rfNodes
      .filter((node) => node.type !== 'question')
      .map((node) => ({ id: node.id }))
    return {
      padding: 0.3,
      ...(processNodeTargets.length > 0 ? { nodes: processNodeTargets } : {}),
    }
  }, [rfNodes])

  useEffect(() => {
    if (rfNodes.length === 0 || !flowMeasurementReady) return
    const internalsTimer = setTimeout(() => {
      const { domNode, updateNodeInternals } = store.getState()
      const updates = new Map()

      for (const node of rfNodes) {
        const nodeElement = domNode?.querySelector(`.react-flow__node[data-id="${node.id}"]`)
        if (nodeElement instanceof HTMLDivElement) {
          updates.set(node.id, { id: node.id, nodeElement, force: true })
        }
      }

      if (updates.size > 0) {
        updateNodeInternals(updates, { triggerFitView: false })
      }
    }, 0)
    const fitTimer = setTimeout(() => fitView({ ...fitViewOptions, duration: 300 }), 80)
    return () => {
      clearTimeout(internalsTimer)
      clearTimeout(fitTimer)
    }
  }, [rfNodes, rfEdges, flowMeasurementReady, fitView, fitViewOptions, store])

  return (
    <div
      className="h-full w-full"
      data-testid="module-detail-flow"
      data-node-count={rfNodes.length}
      data-edge-count={rfEdges.length}
      data-layout-edge-count={layout.edges.length}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.12}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} />
      </ReactFlow>
    </div>
  )
}

export default function ModuleDetailView({
  moduleName,
  domainLabel,
  nodes,
  edges,
  changedNodeIds = NO_CHANGED_NODE_IDS,
  showFunnelLanes = false,
  onBack,
}: ModuleDetailViewProps) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [layout, setLayout] = useState<FlowDetailLayoutResult>({ nodes: [], edges: [] })
  const hasNodes = nodes.length > 0
  const displayEdges = useMemo(() => collapseDuplicateRoutes(edges), [edges])

  useEffect(() => {
    if (!hasNodes) return

    let cancelled = false

    async function runLayout() {
      const nextLayout = await computeFlowDetailLayout(nodes, displayEdges)
      if (cancelled) return

      startTransition(() => {
        setLayout(nextLayout)
      })
    }

    void runLayout()

    return () => {
      cancelled = true
    }
  }, [nodes, displayEdges, hasNodes])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start gap-2 border-b px-4 py-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="mt-0.5 rounded px-2 py-1 text-sm hover:bg-gray-100"
          >
            Back
          </button>
        )}
        <div className="min-w-0 flex-1">
          {domainLabel ? (
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {domainLabel}
            </p>
          ) : null}
          <h2 className="text-lg font-semibold leading-tight">{moduleName}</h2>
          <p className="mt-0.5 text-xs text-gray-400">Flow detail</p>
        </div>
        <div className="flex shrink-0 items-start pt-0.5">
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            aria-label="Open module notes"
            title="Module notes (markdown in public/module-notes)"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
          >
            <NotesGlyph className="h-5 w-5" />
          </button>
        </div>
      </header>

      <ModuleNotesSheet
        moduleName={moduleName}
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
      />

      {hasNodes ? (
        <div className="flex-1 min-h-0">
          <ReactFlowProvider>
            <ModuleDetailFlow
              nodes={nodes}
              edges={displayEdges}
              layout={layout}
              changedNodeIds={changedNodeIds}
              showFunnelLanes={showFunnelLanes}
            />
          </ReactFlowProvider>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <p className="text-sm font-medium text-gray-700">No flow detail yet</p>
          <p className="max-w-sm text-xs leading-relaxed text-gray-500">
            This module does not have any nodes or edges. Use the assistant to generate the internal
            flow, or open a module that ships with a default graph (for example, name a module{' '}
            <span className="font-mono text-gray-600">Cart</span> to auto-seed cart persistence,
            variants, and inventory checks).
          </p>
        </div>
      )}
    </div>
  )
}
