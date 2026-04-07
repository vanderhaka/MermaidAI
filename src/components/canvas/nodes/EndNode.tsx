'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'

type EndNodeData = {
  label: string
}

export default function EndNode({ data }: NodeProps) {
  const { label } = data as EndNodeData

  return (
    <div
      data-shape="circle"
      className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gray-400 bg-gray-100 text-xs font-medium"
    >
      {label}
      <Handle
        type="target"
        position={Position.Top}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.top}
      />
    </div>
  )
}
