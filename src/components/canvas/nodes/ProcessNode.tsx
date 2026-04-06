'use client'

import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

type ProcessNodeData = {
  label: string
  pseudocode?: string
}

export default function ProcessNode({ data }: NodeProps) {
  const { label, pseudocode } = data as ProcessNodeData
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-blue-300 bg-white px-4 py-2 shadow-sm">
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {pseudocode && (
          <button
            type="button"
            aria-label={expanded ? 'Collapse pseudocode' : 'Expand pseudocode'}
            onClick={() => setExpanded((prev) => !prev)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {expanded ? '\u25B2' : '\u25BC'}
          </button>
        )}
      </div>

      {expanded && pseudocode && (
        <pre className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-700">
          {pseudocode}
        </pre>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
