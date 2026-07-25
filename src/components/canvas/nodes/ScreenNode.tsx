'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
  FLOW_DETAIL_HANDLE_BASE_CLASS,
  FLOW_DETAIL_HANDLE_COLOR,
  FLOW_DETAIL_HANDLE_POSITION,
} from '@/components/canvas/nodes/flow-detail-handles'
import { NodeTooltip } from '@/components/canvas/nodes/NodeTooltip'
import { SCREEN_STATES, type ScreenState, type ScreenStateStatus } from '@/types/graph'

export type ScreenNodeData = {
  label: string
  /** Per-state status. Anything unlisted is "unknown" — the spec has not covered it yet. */
  states?: Partial<Record<ScreenState, ScreenStateStatus>>
  onStateClick?: (state: ScreenState) => void
}

const STATE_LABEL: Record<ScreenState, string> = {
  empty: 'Empty',
  loading: 'Loading',
  error: 'Error',
  success: 'Success',
}

const STATE_CLASS: Record<ScreenStateStatus, string> = {
  defined: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  unknown: 'border-amber-300 bg-amber-50 text-amber-800',
  not_applicable: 'border-gray-200 bg-gray-50 text-gray-400',
}

export function screenStateStatus(
  states: ScreenNodeData['states'],
  state: ScreenState,
): ScreenStateStatus {
  return states?.[state] ?? 'unknown'
}

export default function ScreenNode({ data }: NodeProps) {
  const { label, states, onStateClick } = data as ScreenNodeData

  return (
    <div className="group relative box-border flex min-h-[96px] w-[300px] flex-col rounded-lg border border-violet-300 bg-white shadow-sm transition-shadow hover:border-violet-400 hover:shadow-md">
      <NodeTooltip
        type="Screen"
        description="A page the user sees. The strip below shows which states are specified."
      />
      <Handle
        type="target"
        position={Position.Top}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.top}
      />

      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <span
          className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700"
          aria-hidden="true"
        >
          Screen
        </span>
        <span className="truncate text-sm font-medium">{label}</span>
      </div>

      <ul className="flex gap-1 border-t border-gray-100 px-3 py-2" aria-label={`${label} states`}>
        {SCREEN_STATES.map((state) => {
          const status = screenStateStatus(states, state)
          const isUnknown = status === 'unknown'

          return (
            <li key={state} className="flex-1">
              <button
                type="button"
                disabled={!isUnknown || !onStateClick}
                onClick={() => onStateClick?.(state)}
                aria-label={`${STATE_LABEL[state]} state: ${status.replace('_', ' ')}`}
                className={`w-full rounded border px-1 py-0.5 text-[10px] font-medium ${STATE_CLASS[status]} ${
                  isUnknown && onStateClick
                    ? 'cursor-pointer hover:brightness-95'
                    : 'cursor-default'
                }`}
              >
                {STATE_LABEL[state]}
                {isUnknown && <span aria-hidden="true"> ?</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <Handle
        type="source"
        position={Position.Bottom}
        className={`${FLOW_DETAIL_HANDLE_BASE_CLASS} ${FLOW_DETAIL_HANDLE_COLOR.success}`}
        style={FLOW_DETAIL_HANDLE_POSITION.bottom}
      />
    </div>
  )
}
