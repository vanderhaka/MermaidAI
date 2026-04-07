'use client'

import { useState } from 'react'
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
import ModuleNotesSheet from '@/components/canvas/views/ModuleNotesSheet'

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
  const [notesOpen, setNotesOpen] = useState(false)
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
