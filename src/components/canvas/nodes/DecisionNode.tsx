'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'

type DecisionNodeData = {
  label: string
}

export default function DecisionNode({ data }: NodeProps) {
  const { label } = data as DecisionNodeData

  return (
    <div className="relative h-44 w-44">
      {/* Rotated face only — handles stay on the unrotated box so React Flow measures yes/no separately. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rotate-45 border-2 border-amber-400 bg-amber-50 shadow-sm"
      />

      <Handle
        type="target"
        position={Position.Top}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.top}
      />

      <div className="relative z-[1] flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden px-3 py-2">
        <span className="line-clamp-5 max-w-[8.25rem] whitespace-normal break-words text-center text-[10.5px] font-medium leading-tight text-amber-900 [overflow-wrap:anywhere]">
          {label}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.bottom}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="no"
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.warning}`}
        style={FLOW_DETAIL_HANDLE_POSITION.right}
      />
    </div>
  )
}
