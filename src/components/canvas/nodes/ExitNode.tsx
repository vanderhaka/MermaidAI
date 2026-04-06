import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

type ExitNodeData = {
  label: string
}

export default function ExitNode({ data }: NodeProps) {
  const { label } = data as ExitNodeData

  return (
    <div className="border-2 border-red-500 bg-red-50 rounded-lg px-4 py-2 text-sm font-medium text-red-800 shadow-sm">
      {label}
      <Handle type="target" position={Position.Top} />
    </div>
  )
}
