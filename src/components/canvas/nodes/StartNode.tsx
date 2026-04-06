'use client'

import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

type StartNodeData = { label: string }
type StartNodeType = Node<StartNodeData, 'start'>

export default function StartNode({ data }: NodeProps<StartNodeType>) {
  return (
    <div
      data-shape="circle"
      className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gray-400 bg-gray-100 text-xs font-medium"
    >
      {data.label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
