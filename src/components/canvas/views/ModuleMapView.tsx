'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
  useReactFlow,
} from '@xyflow/react'
import type { Edge, Node, NodeMouseHandler } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ModuleConnectionEdge, {
  type ModuleConnectionEdgeData,
} from '@/components/canvas/edges/ModuleConnectionEdge'
import ModuleCardNode, {
  MODULE_CARD_HEIGHT,
  MODULE_CARD_WIDTH,
} from '@/components/canvas/nodes/ModuleCardNode'
import {
  computeModuleMapLayout,
  type ModuleMapLayoutResult,
  type ModulePortLayout,
} from '@/lib/canvas/layout'
import { expandConnectionHandlePoints } from '@/lib/canvas/handleSlots'
import { ERROR_KEYWORDS, getEdgeStyle } from '@/lib/canvas/flow-edge-style'
import type { Module, ModuleConnection } from '@/types/graph'

const nodeTypes = { moduleCard: ModuleCardNode }
const edgeTypes = { moduleConnection: ModuleConnectionEdge }

interface ModuleMapViewProps {
  modules: Module[]
  connections: ModuleConnection[]
  onModuleClick?: (moduleId: string) => void
}

function mergeHandleNames(base: string[], derived: Iterable<string>): string[] {
  const merged = new Set(base)
  for (const name of derived) {
    merged.add(name)
  }
  return Array.from(merged)
}

function getConnectedEntryPoints(connections: ModuleConnection[]) {
  const connectedEntries = new Map<string, Set<string>>()

  for (const connection of connections) {
    const entries = connectedEntries.get(connection.target_module_id) ?? new Set<string>()
    entries.add(connection.target_entry_point)
    connectedEntries.set(connection.target_module_id, entries)
  }

  return connectedEntries
}

function getDerivedSlottedHandles(
  connections: ModuleConnection[],
  sourcePointByConnectionId: Map<string, string>,
  targetPointByConnectionId: Map<string, string>,
) {
  const derivedEntries = new Map<string, Set<string>>()
  const derivedExits = new Map<string, Set<string>>()

  for (const connection of connections) {
    const entryName = targetPointByConnectionId.get(connection.id) ?? connection.target_entry_point
    const entries = derivedEntries.get(connection.target_module_id) ?? new Set<string>()
    entries.add(entryName)
    derivedEntries.set(connection.target_module_id, entries)

    const exitName = sourcePointByConnectionId.get(connection.id) ?? connection.source_exit_point
    const exits = derivedExits.get(connection.source_module_id) ?? new Set<string>()
    exits.add(exitName)
    derivedExits.set(connection.source_module_id, exits)
  }

  return { derivedEntries, derivedExits }
}

function getHandleSideMap(portLayout: Record<string, ModulePortLayout>) {
  return Object.fromEntries(
    Object.entries(portLayout).map(([handleId, layout]) => [handleId, layout.side]),
  )
}

function getHandleOrderMap(portLayout: Record<string, ModulePortLayout>) {
  return Object.fromEntries(
    Object.entries(portLayout).map(([handleId, layout]) => [handleId, layout.order]),
  )
}

function getHandlePositionMap(portLayout: Record<string, ModulePortLayout>) {
  return Object.fromEntries(
    Object.entries(portLayout).map(([handleId, layout]) => [handleId, layout.position]),
  )
}

function ModuleMapInner({ modules, connections, onModuleClick }: ModuleMapViewProps) {
  const { fitView } = useReactFlow()
  const [layout, setLayout] = useState<ModuleMapLayoutResult>({ nodes: [], edges: [] })

  useEffect(() => {
    let cancelled = false

    async function runLayout() {
      const nextLayout = await computeModuleMapLayout(modules, connections)
      if (cancelled) return

      startTransition(() => {
        setLayout(nextLayout)
      })
    }

    void runLayout()

    return () => {
      cancelled = true
    }
  }, [modules, connections])

  const { nodes, edges } = useMemo(() => {
    if (modules.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] }

    const { sourcePointByConnectionId, targetPointByConnectionId } =
      expandConnectionHandlePoints(connections)
    const { derivedEntries, derivedExits } = getDerivedSlottedHandles(
      connections,
      sourcePointByConnectionId,
      targetPointByConnectionId,
    )

    const modulesById = new Map(modules.map((module) => [module.id, module]))
    const layoutNodes = new Map(layout.nodes.map((node) => [node.id, node]))
    const layoutEdges = new Map(layout.edges.map((edge) => [edge.id, edge]))
    const connectedEntries = getConnectedEntryPoints(connections)

    const builtNodes = modules.map<Node>((module) => {
      const nodeLayout = layoutNodes.get(module.id)
      const portLayout = nodeLayout?.portLayout ?? {}

      return {
        id: module.id,
        type: 'moduleCard',
        position: nodeLayout?.position ?? module.position,
        width: MODULE_CARD_WIDTH,
        height: MODULE_CARD_HEIGHT,
        data: {
          name: module.name,
          description: module.description,
          entry_points: mergeHandleNames(module.entry_points, derivedEntries.get(module.id) ?? []),
          exit_points: mergeHandleNames(module.exit_points, derivedExits.get(module.id) ?? []),
          connectedEntryPoints: Array.from(connectedEntries.get(module.id) ?? []),
          handleSides: getHandleSideMap(portLayout),
          handleOrder: getHandleOrderMap(portLayout),
          handlePositions: getHandlePositionMap(portLayout),
        },
      }
    })

    const builtEdges = connections.map<Edge>((connection) => {
      const { stroke, markerColor, labelColor, isErrorPath } = getEdgeStyle(
        connection.source_exit_point,
      )
      const sourceName = modulesById.get(connection.source_module_id)?.name ?? 'Unknown source'
      const targetName = modulesById.get(connection.target_module_id)?.name ?? 'Unknown target'

      const sourcePort =
        sourcePointByConnectionId.get(connection.id) ?? connection.source_exit_point
      const targetPort =
        targetPointByConnectionId.get(connection.id) ?? connection.target_entry_point

      const data: ModuleConnectionEdgeData = {
        label: connection.source_exit_point,
        labelColor,
        tooltipDescription: `From ${sourceName} to ${targetName} (${connection.target_entry_point})`,
        sections: layoutEdges.get(connection.id)?.sections ?? [],
      }

      return {
        id: connection.id,
        type: 'moduleConnection',
        source: connection.source_module_id,
        target: connection.target_module_id,
        sourceHandle: `exit-${sourcePort}`,
        targetHandle: `entry-${targetPort}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: markerColor, width: 16, height: 16 },
        style: {
          stroke,
          strokeWidth: isErrorPath ? 1.5 : 2,
          strokeDasharray: isErrorPath ? '6 3' : undefined,
        },
        data,
      }
    })

    return { nodes: builtNodes, edges: builtEdges }
  }, [modules, connections, layout])

  useEffect(() => {
    if (nodes.length === 0) return
    const timer = setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 50)
    return () => clearTimeout(timer)
  }, [nodes, edges, fitView])

  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    onModuleClick?.(node.id)
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      minZoom={0.12}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
    >
      <Controls />
      <Background variant={BackgroundVariant.Dots} />
    </ReactFlow>
  )
}

export default function ModuleMapView({ modules, connections, onModuleClick }: ModuleMapViewProps) {
  if (modules.length === 0) {
    return (
      <div className="relative flex h-full items-center justify-center">
        {/* Centred prompt */}
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-base font-medium text-gray-500">No modules yet.</p>
          <p className="max-w-xs text-sm text-gray-400">
            Open the chat and describe your system — AI will build your module map from the
            conversation.
          </p>
        </div>

        {/* Arrow pointing toward bottom-right FAB */}
        <div className="pointer-events-none absolute bottom-20 right-20 flex flex-col items-end gap-1 text-gray-300">
          <span className="text-xs font-medium tracking-wide text-gray-400">Start here</span>
          {/* Diagonal arrow: two lines forming an L-shape pointing bottom-right */}
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            className="text-gray-300"
          >
            <path
              d="M8 8 Q8 56 56 56"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="6 4"
              fill="none"
            />
            {/* Arrowhead */}
            <path
              d="M44 48 L56 56 L48 44"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <ModuleMapInner modules={modules} connections={connections} onModuleClick={onModuleClick} />
    </ReactFlowProvider>
  )
}
