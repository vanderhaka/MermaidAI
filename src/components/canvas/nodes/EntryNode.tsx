import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'

type EntryNodeData = {
  label: string
}

export default function EntryNode({ data }: NodeProps) {
  const { label } = data as EntryNodeData

  return (
    <div className="box-border w-[200px] rounded-lg border-2 border-green-500 bg-green-50 px-4 py-2 text-center text-sm font-medium text-green-800 shadow-sm">
      {label}
      <Handle
        type="source"
        position={Position.Bottom}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.bottom}
      />
    </div>
  )
}
