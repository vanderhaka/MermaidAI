'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { REQUIREMENT_STATUS_COLOR } from '@/lib/canvas/requirement-graph'
import type { RequirementKind, RequirementStatus } from '@/types/graph'

export const REQUIREMENT_CARD_WIDTH = 300
export const REQUIREMENT_CARD_HEIGHT = 108

export type RequirementNodeData = {
  statement: string
  status: RequirementStatus
  kind: RequirementKind
  groupLabel: string
  /** Unresolved questions still blocking this requirement. */
  blockedBy: number
  /** True when this requirement conflicts with another. */
  conflicted?: boolean
}

const STATUS_LABEL: Record<RequirementStatus, string> = {
  proposed: 'Proposed',
  agreed: 'Agreed',
  disputed: 'Disputed',
  out_of_scope: 'Out of scope',
}

const KIND_LABEL: Record<RequirementKind, string> = {
  functional: 'Functional',
  rule: 'Rule',
  constraint: 'Constraint',
  non_functional: 'Non-functional',
}

export default function RequirementNode({ data }: NodeProps) {
  const { statement, status, kind, groupLabel, blockedBy, conflicted } = data as RequirementNodeData

  return (
    <div
      data-testid="requirement-node"
      data-status={status}
      className={`box-border flex w-[300px] flex-col gap-2 rounded-lg border bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md ${
        conflicted ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-200'
      } ${status === 'out_of_scope' ? 'opacity-60' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-gray-400" />

      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: REQUIREMENT_STATUS_COLOR[status] }}
          aria-hidden="true"
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {STATUS_LABEL[status]}
        </span>
        <span className="text-[10px] text-gray-300">·</span>
        <span className="text-[10px] text-gray-400">{KIND_LABEL[kind]}</span>
      </div>

      <p
        className={`text-sm leading-snug text-gray-900 ${
          status === 'out_of_scope' ? 'line-through' : ''
        }`}
      >
        {statement}
      </p>

      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span className="truncate">{groupLabel}</span>
        {blockedBy > 0 && (
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
            {blockedBy} open {blockedBy === 1 ? 'question' : 'questions'}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-gray-400" />
    </div>
  )
}
