'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'
import { NodeTooltip } from '@/components/canvas/nodes/NodeTooltip'

export type RoleNodeData = {
  label: string
  /** Short description of what this role may do. */
  pseudocode?: string
}

export default function RoleNode({ data }: NodeProps) {
  const { label, pseudocode } = data as RoleNodeData

  return (
    <div className="group relative box-border flex min-h-[60px] w-[220px] items-center gap-2 rounded-full border border-sky-300 bg-white px-4 py-3 shadow-sm transition-shadow hover:border-sky-400 hover:shadow-md">
      <NodeTooltip
        type="Role"
        description="A user or actor type, and what they are allowed to do."
      />
      <Handle
        type="target"
        position={Position.Top}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.top}
      />

      <span
        className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700"
        aria-hidden="true"
      >
        Role
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        {pseudocode && <p className="truncate text-xs text-gray-400">{pseudocode}</p>}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.bottom}
      />
    </div>
  )
}
