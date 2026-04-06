'use client'

import { Handle, Position } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'

type EndNodeData = { label: string }
type EndNodeType = Node<EndNodeData, 'end'>

export default function EndNode({ data }: NodeProps<EndNodeType>) {
  return (
    <div
      data-shape="circle"
      className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gray-400 bg-gray-100 text-xs font-medium"
    >
      {data.label}
      <Handle type="target" position={Position.Top} />
    </div>
  )
}
