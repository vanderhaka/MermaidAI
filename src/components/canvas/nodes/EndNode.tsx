'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'
import { NodeChangeHighlight } from '@/components/canvas/nodes/NodeChangeHighlight'
import { NodeTooltip } from '@/components/canvas/nodes/NodeTooltip'

type EndNodeData = {
  label: string
  recentlyChanged?: boolean
}

export default function EndNode({ data }: NodeProps) {
  const { label, recentlyChanged } = data as EndNodeData

  return (
    <div
      data-shape="circle"
      className="group relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-gray-400 bg-gray-100 text-xs font-medium shadow-sm transition-shadow hover:shadow-md hover:border-gray-500"
    >
      <NodeChangeHighlight active={Boolean(recentlyChanged)} />
      <NodeTooltip type="End Node" description="Where the flow terminates." />
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
