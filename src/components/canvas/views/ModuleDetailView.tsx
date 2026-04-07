'use client'

import type { Node, Edge } from '@xyflow/react'
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FlowNode, FlowEdge } from '@/types/graph'
import { computeLayout, DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from '@/lib/canvas/layout'
import DecisionNode from '@/components/canvas/nodes/DecisionNode'
import ProcessNode from '@/components/canvas/nodes/ProcessNode'
import EntryNode from '@/components/canvas/nodes/EntryNode'
import ExitNode from '@/components/canvas/nodes/ExitNode'
import StartNode from '@/components/canvas/nodes/StartNode'
import EndNode from '@/components/canvas/nodes/EndNode'
import ConditionEdge from '@/components/canvas/edges/ConditionEdge'

const nodeTypes = {
  decision: DecisionNode,
  process: ProcessNode,
  entry: EntryNode,
  exit: ExitNode,
  start: StartNode,
  end: EndNode,
}

const edgeTypes = {
  condition: ConditionEdge,
}

type ModuleDetailViewProps = {
  moduleName: string
  /** L1 domain label (e.g. Payments) for hierarchy context */
  domainLabel?: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  onBack?: () => void
}

function toReactFlowNodes(nodes: FlowNode[]): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.node_type,
    position: n.position,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    data: { label: n.label, pseudocode: n.pseudocode },
  }))
}

function toReactFlowEdges(edges: FlowEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    type: 'condition',
    data: { label: e.label },
  }))
}

export default function ModuleDetailView({
  moduleName,
  domainLabel,
  nodes,
  edges,
  onBack,
}: ModuleDetailViewProps) {
  const hasNodes = nodes.length > 0

  const layoutNodes = hasNodes ? computeLayout(nodes, edges) : []
  const rfNodes = toReactFlowNodes(layoutNodes)
  const rfEdges = toReactFlowEdges(edges)

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
      </header>

      {hasNodes ? (
        <div className="flex-1">
          <ReactFlowProvider>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
            >
              <Controls />
              <Background variant={BackgroundVariant.Dots} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-gray-500">
          No nodes in this module
        </div>
      )}
    </div>
  )
}
