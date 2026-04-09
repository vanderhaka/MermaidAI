'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'
import { NodeTooltip } from '@/components/canvas/nodes/NodeTooltip'

type QuestionNodeData = {
  question: string
}

export default function QuestionNode({ data }: NodeProps) {
  const { question } = data as QuestionNodeData

  return (
    <div className="group relative box-border w-[300px] rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-2 shadow-sm transition-shadow hover:shadow-md hover:border-amber-500">
      <NodeTooltip
        type="Open Question"
        description="An unresolved question that needs an answer."
      />
      <Handle
        type="target"
        position={Position.Top}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.warning}`}
        style={FLOW_DETAIL_HANDLE_POSITION.top}
      />
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-white">
          ?
        </span>
        <span className="text-sm font-medium text-amber-900">{question}</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.warning}`}
        style={FLOW_DETAIL_HANDLE_POSITION.bottom}
      />
    </div>
  )
}
