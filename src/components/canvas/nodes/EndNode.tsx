import { Handle, Position } from '@xyflow/react'

type EndNodeProps = {
  data: { label: string }
  id: string
}

export default function EndNode({ data }: EndNodeProps) {
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
