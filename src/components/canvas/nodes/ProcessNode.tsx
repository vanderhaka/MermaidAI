'use client'

import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'

type ProcessNodeData = {
  label: string
  pseudocode?: string
}

export default function ProcessNode({ data }: NodeProps) {
  const { label, pseudocode } = data as ProcessNodeData
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="group box-border w-[300px] rounded-lg border border-blue-300 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md hover:border-blue-400">
      <Handle
        type="target"
        position={Position.Top}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.top}
      />

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

      {pseudocode && !expanded && (
        <p className="mt-1 truncate text-xs text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
          {pseudocode}
        </p>
      )}

      {expanded && pseudocode && (
        <pre className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-700">
          {pseudocode}
        </pre>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.bottom}
      />
    </div>
  )
}
