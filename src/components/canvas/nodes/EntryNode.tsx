import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

type EntryNodeData = {
  label: string
}

export default function EntryNode({ data }: NodeProps) {
  const { label } = data as EntryNodeData

  return (
    <div className="border-2 border-green-500 bg-green-50 rounded-lg px-4 py-2 text-sm font-medium text-green-800 shadow-sm">
      {label}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
