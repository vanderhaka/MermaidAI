'use client'

import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

type DecisionNodeData = {
  label: string
}

type DecisionNodeType = Node<DecisionNodeData, 'decision'>

export default function DecisionNode({ data }: NodeProps<DecisionNodeType>) {
  const { label } = data

  return (
    <div
      style={{ transform: 'rotate(45deg)' }}
      className="h-24 w-24 border-2 border-amber-400 bg-amber-50 shadow-sm"
    >
      <Handle type="target" position={Position.Top} />

      <div
        style={{ transform: 'rotate(-45deg)' }}
        className="flex h-full w-full items-center justify-center"
      >
        <span className="text-xs font-medium text-amber-900">{label}</span>
      </div>

      <Handle type="source" position={Position.Bottom} id="yes" />
      <Handle type="source" position={Position.Left} id="no" />
    </div>
  )
}
