'use client'

import { useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
} from '@xyflow/react'
import type { Node, NodeMouseHandler } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ModuleCardNode from '@/components/canvas/nodes/ModuleCardNode'
import { computeLayout } from '@/lib/canvas/layout'
import type { Module } from '@/types/graph'

const nodeTypes = { moduleCard: ModuleCardNode }

interface ModuleMapViewProps {
  modules: Module[]
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

export default function ModuleMapView({ modules, onModuleClick }: ModuleMapViewProps) {
  const nodes = useMemo(() => {
    if (modules.length === 0) return []

    const positioned = computeLayout(modules.map(toLayoutNode), [])

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
  }, [modules])

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
        edges={[]}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background variant={BackgroundVariant.Dots} />
      </ReactFlow>
    </ReactFlowProvider>
  )
}
