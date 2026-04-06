'use client'

import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

type EntryNodeData = {
  label: string
}

type EntryNodeType = Node<EntryNodeData, 'entry'>

export default function EntryNode({ data }: NodeProps<EntryNodeType>) {
  const { label } = data

  return (
    <div className="border-2 border-green-500 bg-green-50 rounded-lg px-4 py-2 text-sm font-medium text-green-800 shadow-sm">
      {label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
