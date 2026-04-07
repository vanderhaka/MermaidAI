'use client'

import { useEffect, useMemo, useRef } from 'react'
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
import ModuleCardNode from '@/components/canvas/nodes/ModuleCardNode'
import type { HandleSide } from '@/components/canvas/nodes/ModuleCardNode'
import { computeModuleLayout } from '@/lib/canvas/layout'
import type { Module, ModuleConnection, Position as XYPosition } from '@/types/graph'

const nodeTypes = { moduleCard: ModuleCardNode }

const ERROR_KEYWORDS = /failure|fail|error|cancel|retry|return|rollback|reject/i

function getEdgeStyle(sourceExitPoint: string): {
  stroke: string
  markerColor: string
  labelColor: string
} {
  if (ERROR_KEYWORDS.test(sourceExitPoint)) {
    return { stroke: '#f97316', markerColor: '#f97316', labelColor: '#ea580c' } // orange
  }
  return { stroke: '#22c55e', markerColor: '#22c55e', labelColor: '#16a34a' } // green
}

interface ModuleMapViewProps {
  modules: Module[]
  connections: ModuleConnection[]
  onModuleClick?: (moduleId: string) => void
}

function toLayoutNode(mod: Module) {
  return {
    id: mod.id,
    module_id: '',
    node_type: 'process' as const,
    label: mod.name,
    pseudocode: '',
    position: mod.position,
    color: '',
    created_at: '',
    updated_at: '',
  }
}

function ModuleMapInner({ modules, connections, onModuleClick }: ModuleMapViewProps) {
  const { fitView } = useReactFlow()
  const prevCountRef = useRef({ modules: 0, connections: 0 })

  const { nodes, edges } = useMemo(() => {
    if (modules.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] }

    const positioned = computeModuleLayout(modules.map(toLayoutNode), connections)

    // Build position map for handle side computation
    const posMap = new Map<string, XYPosition>()
    for (let i = 0; i < modules.length; i++) {
      posMap.set(modules[i].id, positioned[i].position)
    }

    // Compute handle sides based on relative module positions
    // and connected entry points per module
    const handleSidesMap = new Map<string, Record<string, HandleSide>>()
    const connectedEntries = new Map<string, Set<string>>()

    for (const conn of connections) {
      if (!connectedEntries.has(conn.target_module_id)) {
        connectedEntries.set(conn.target_module_id, new Set())
      }
      connectedEntries.get(conn.target_module_id)!.add(conn.target_entry_point)

      const srcPos = posMap.get(conn.source_module_id)
      const tgtPos = posMap.get(conn.target_module_id)
      if (!srcPos || !tgtPos) continue

      const dx = tgtPos.x - srcPos.x
      const dy = tgtPos.y - srcPos.y

      let exitSide: HandleSide
      let entrySide: HandleSide

      if (Math.abs(dy) > Math.abs(dx) * 0.5 && dy > 0) {
        // Target is significantly below → vertical down
        exitSide = 'bottom'
        entrySide = 'top'
      } else if (dx < -50) {
        // Target is to the left → backward flow
        exitSide = 'left'
        entrySide = 'right'
      } else {
        // Target is to the right or same column → forward flow
        exitSide = 'right'
        entrySide = 'left'
      }

      // Set source exit handle side
      const srcSides = handleSidesMap.get(conn.source_module_id) ?? {}
      srcSides[`exit-${conn.source_exit_point}`] = exitSide
      handleSidesMap.set(conn.source_module_id, srcSides)

      // Set target entry handle side
      const tgtSides = handleSidesMap.get(conn.target_module_id) ?? {}
      tgtSides[`entry-${conn.target_entry_point}`] = entrySide
      handleSidesMap.set(conn.target_module_id, tgtSides)
    }

    const builtNodes = modules.map<Node>((mod, i) => ({
      id: mod.id,
      type: 'moduleCard',
      position: positioned[i].position,
      data: {
        name: mod.name,
        description: mod.description,
        entry_points: mod.entry_points,
        exit_points: mod.exit_points,
        connectedEntryPoints: Array.from(connectedEntries.get(mod.id) ?? []),
        handleSides: handleSidesMap.get(mod.id) ?? {},
      },
    }))

    const builtEdges = connections.map<Edge>((conn) => {
      const { stroke, markerColor, labelColor } = getEdgeStyle(conn.source_exit_point)
      const isErrorPath = ERROR_KEYWORDS.test(conn.source_exit_point)

      return {
        id: conn.id,
        type: 'smoothstep',
        pathOptions: { borderRadius: 12 },
        source: conn.source_module_id,
        target: conn.target_module_id,
        sourceHandle: `exit-${conn.source_exit_point}`,
        targetHandle: `entry-${conn.target_entry_point}`,
        label: conn.source_exit_point,
        markerEnd: { type: MarkerType.ArrowClosed, color: markerColor, width: 16, height: 16 },
        style: {
          stroke,
          strokeWidth: isErrorPath ? 1.5 : 2,
          strokeDasharray: isErrorPath ? '6 3' : undefined,
        },
        labelStyle: { fontSize: 10, fill: labelColor, fontWeight: 500 },
        labelBgStyle: { fill: 'white', fillOpacity: 0.85 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        animated: !isErrorPath,
      }
    })

    return { nodes: builtNodes, edges: builtEdges }
  }, [modules, connections])

  // Auto-fit when modules or connections are added
  useEffect(() => {
    const prev = prevCountRef.current
    if (modules.length !== prev.modules || connections.length !== prev.connections) {
      prevCountRef.current = { modules: modules.length, connections: connections.length }
      // Small delay so React Flow finishes rendering new nodes
      const timer = setTimeout(() => fitView({ padding: 0.3, duration: 300 }), 50)
      return () => clearTimeout(timer)
    }
  }, [modules.length, connections.length, fitView])

  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    onModuleClick?.(node.id)
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
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
