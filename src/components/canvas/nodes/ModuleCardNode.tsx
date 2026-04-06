'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

type ModuleCardNodeData = {
  name: string
  description: string | null
  entry_points: string[]
  exit_points: string[]
}

export default function ModuleCardNode({ data }: NodeProps) {
  const { name, description, entry_points, exit_points } = data as ModuleCardNodeData

  return (
    <div className="min-w-[180px] rounded-lg border-2 border-indigo-400 bg-white px-4 py-3 shadow-md">
      <div className="text-sm font-semibold text-indigo-900">{name}</div>
      {description && <div className="mt-1 text-xs text-gray-600">{description}</div>}

      {entry_points.map((ep) => (
        <Handle key={`entry-${ep}`} id={`entry-${ep}`} type="target" position={Position.Left} />
      ))}

      {exit_points.map((ep) => (
        <Handle key={`exit-${ep}`} id={`exit-${ep}`} type="source" position={Position.Right} />
      ))}
    </div>
  )
}
