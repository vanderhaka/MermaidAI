'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

type ModuleCardNodeData = {
  name: string
  description: string | null
  entry_points: string[]
  exit_points: string[]
}

export const MODULE_CARD_WIDTH = 260
export const MODULE_CARD_HEIGHT = 100

export default function ModuleCardNode({ data }: NodeProps) {
  const { name, description, entry_points, exit_points } = data as ModuleCardNodeData

  return (
    <div
      className="rounded-xl border border-indigo-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md"
      style={{ width: MODULE_CARD_WIDTH }}
    >
      <div className="text-sm font-semibold text-slate-900">{name}</div>
      {description && (
        <div className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
          {description}
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!bg-indigo-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400" />

      {entry_points.map((ep) => (
        <Handle
          key={`entry-${ep}`}
          id={`entry-${ep}`}
          type="target"
          position={Position.Left}
          className="!bg-indigo-400"
        />
      ))}

      {exit_points.map((ep) => (
        <Handle
          key={`exit-${ep}`}
          id={`exit-${ep}`}
          type="source"
          position={Position.Right}
          className="!bg-indigo-400"
        />
      ))}
    </div>
  )
}
