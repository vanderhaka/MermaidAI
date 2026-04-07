'use client'

import { useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import type { Edge, Node, NodeMouseHandler } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ModuleCardNode from '@/components/canvas/nodes/ModuleCardNode'
import { computeModuleLayout } from '@/lib/canvas/layout'
import type { Module, ModuleConnection } from '@/types/graph'

const nodeTypes = { moduleCard: ModuleCardNode }

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

export default function ModuleMapView({ modules, connections, onModuleClick }: ModuleMapViewProps) {
  const nodes = useMemo(() => {
    if (modules.length === 0) return []

    const positioned = computeModuleLayout(modules.map(toLayoutNode), connections)

    return modules.map<Node>((mod, i) => ({
      id: mod.id,
      type: 'moduleCard',
      position: positioned[i].position,
      data: {
        name: mod.name,
        description: mod.description,
        entry_points: mod.entry_points,
        exit_points: mod.exit_points,
      },
    }))
  }, [modules, connections])

  const edges = useMemo<Edge[]>(
    () =>
      connections.map((conn) => ({
        id: conn.id,
        source: conn.source_module_id,
        target: conn.target_module_id,
        sourceHandle: `exit-${conn.source_exit_point}`,
        targetHandle: `entry-${conn.target_entry_point}`,
        label:
          conn.source_exit_point === conn.target_entry_point
            ? conn.source_exit_point
            : `${conn.source_exit_point} → ${conn.target_entry_point}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#818cf8' },
        style: { stroke: '#818cf8', strokeWidth: 2 },
        labelStyle: { fontSize: 11, fill: '#6366f1', fontWeight: 500 },
        animated: true,
      })),
    [connections],
  )

  if (modules.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        No modules yet. Start a conversation to create your first module.
      </div>
    )
  }

  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    onModuleClick?.(node.id)
  }

  return (
    <ReactFlowProvider>
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
    </ReactFlowProvider>
  )
}
