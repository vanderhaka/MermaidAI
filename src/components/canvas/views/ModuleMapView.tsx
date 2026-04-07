'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
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
import ModuleCardNode from '@/components/canvas/nodes/ModuleCardNode'
import {
  computeModuleMapLayout,
  type ModuleMapLayoutResult,
  type ModulePortLayout,
} from '@/lib/canvas/layout'
import type { Module, ModuleConnection } from '@/types/graph'

const nodeTypes = { moduleCard: ModuleCardNode }
const edgeTypes = { moduleConnection: ModuleConnectionEdge }

const ERROR_KEYWORDS = /failure|fail|error|cancel|retry|return|rollback|reject/i

function getEdgeStyle(sourceExitPoint: string): {
  stroke: string
  markerColor: string
  labelColor: string
} {
  if (ERROR_KEYWORDS.test(sourceExitPoint)) {
    return { stroke: '#f97316', markerColor: '#f97316', labelColor: '#ea580c' }
  }
  return { stroke: '#22c55e', markerColor: '#22c55e', labelColor: '#16a34a' }
}

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

function getDerivedHandles(connections: ModuleConnection[]) {
  const derivedEntries = new Map<string, Set<string>>()
  const derivedExits = new Map<string, Set<string>>()

  for (const connection of connections) {
    const entries = derivedEntries.get(connection.target_module_id) ?? new Set<string>()
    entries.add(connection.target_entry_point)
    derivedEntries.set(connection.target_module_id, entries)

    const exits = derivedExits.get(connection.source_module_id) ?? new Set<string>()
    exits.add(connection.source_exit_point)
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

    const modulesById = new Map(modules.map((module) => [module.id, module]))
    const layoutNodes = new Map(layout.nodes.map((node) => [node.id, node]))
    const layoutEdges = new Map(layout.edges.map((edge) => [edge.id, edge]))
    const connectedEntries = getConnectedEntryPoints(connections)
    const { derivedEntries, derivedExits } = getDerivedHandles(connections)

    const builtNodes = modules.map<Node>((module) => {
      const nodeLayout = layoutNodes.get(module.id)
      const portLayout = nodeLayout?.portLayout ?? {}

      return {
        id: module.id,
        type: 'moduleCard',
        position: nodeLayout?.position ?? module.position,
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
      const { stroke, markerColor, labelColor } = getEdgeStyle(connection.source_exit_point)
      const isErrorPath = ERROR_KEYWORDS.test(connection.source_exit_point)
      const sourceName = modulesById.get(connection.source_module_id)?.name ?? 'Unknown source'
      const targetName = modulesById.get(connection.target_module_id)?.name ?? 'Unknown target'

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
        sourceHandle: `exit-${connection.source_exit_point}`,
        targetHandle: `entry-${connection.target_entry_point}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: markerColor, width: 16, height: 16 },
        style: {
          stroke,
          strokeWidth: isErrorPath ? 1.5 : 2,
          strokeDasharray: isErrorPath ? '6 3' : undefined,
        },
        animated: !isErrorPath,
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
    >
      <MiniMap />
      <Controls />
      <Background variant={BackgroundVariant.Dots} />
    </ReactFlow>
  )
}

export default function ModuleMapView({ modules, connections, onModuleClick }: ModuleMapViewProps) {
  if (modules.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        No modules yet. Start a conversation to create your first module.
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <ModuleMapInner modules={modules} connections={connections} onModuleClick={onModuleClick} />
    </ReactFlowProvider>
  )
}
