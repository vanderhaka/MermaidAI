'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'
import { NodeTooltip } from '@/components/canvas/nodes/NodeTooltip'

type DecisionNodeData = {
  label: string
}

export default function DecisionNode({ data }: NodeProps) {
  const { label } = data as DecisionNodeData

  return (
    <div className="group relative h-44 w-44">
      <NodeTooltip
        type="Decision Node"
        description="Branches the flow based on a yes/no question."
      />
      {/* Rotated face inscribed in the 176px box (side = 176/√2) so the diamond's
          vertices land exactly on the handles at the box-edge midpoints — a full-size
          rotated face would overflow the node bounds by ~36px per side and paint
          over incoming arrowheads. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[124.45px] w-[124.45px] -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-amber-400 bg-amber-50 shadow-sm transition-shadow group-hover:shadow-md group-hover:border-amber-500"
      />

      <Handle
        type="target"
        position={Position.Top}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.top}
      />

      <div className="relative z-[1] flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden px-3 py-2">
        <span className="line-clamp-4 max-w-[6.5rem] whitespace-normal break-words text-center text-[10.5px] font-medium leading-tight text-amber-900 [overflow-wrap:anywhere]">
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
