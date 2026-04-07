'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'

type ExitNodeData = {
  label: string
}

export default function ExitNode({ data }: NodeProps) {
  const { label } = data as ExitNodeData

  return (
    <div className="box-border w-[200px] rounded-lg border-2 border-red-500 bg-red-50 px-4 py-2 text-center text-sm font-medium text-red-800 shadow-sm">
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
