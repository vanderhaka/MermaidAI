'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'
import { NodeTooltip } from '@/components/canvas/nodes/NodeTooltip'

export type DataNodeData = {
  label: string
  /** Field list or shape notes for this entity. */
  pseudocode?: string
}

export default function DataNode({ data }: NodeProps) {
  const { label, pseudocode } = data as DataNodeData
  const fields = pseudocode
    ?.split(/[\n,]/)
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 4)

  return (
    <div className="group relative box-border flex min-h-[60px] w-[240px] flex-col rounded-lg border border-teal-300 bg-white shadow-sm transition-shadow hover:border-teal-400 hover:shadow-md">
      <NodeTooltip type="Data" description="An entity the system stores." />
      <Handle
        type="target"
        position={Position.Top}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.top}
      />

      <div className="flex items-center gap-2 border-b border-teal-100 px-4 py-2">
        <span
          className="shrink-0 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700"
          aria-hidden="true"
        >
          Data
        </span>
        <span className="truncate text-sm font-medium">{label}</span>
      </div>

      {fields && fields.length > 0 && (
        <ul className="px-4 py-2 text-xs text-gray-500">
          {fields.map((field) => (
            <li key={field} className="truncate">
              {field}
            </li>
          ))}
        </ul>
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
