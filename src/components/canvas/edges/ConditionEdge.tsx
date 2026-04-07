'use client'

import type { CSSProperties } from 'react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'

/** Left-handle → target on the right: route out left, then down, then across (ELK-style), avoiding cutting through the center column. */
function buildLeftExitOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  targetPosition: EdgeProps['targetPosition'],
): { path: string; labelX: number; labelY: number } {
  const extendLeft = 88
  const x1 = sourceX - extendLeft
  const enterGap = 34
  const yLane =
    targetPosition === Position.Top ? targetY - enterGap : Math.max(sourceY, targetY) + 72
  const path =
    targetPosition === Position.Top
      ? `M ${sourceX} ${sourceY} L ${x1} ${sourceY} L ${x1} ${yLane} L ${targetX} ${yLane} L ${targetX} ${targetY}`
      : `M ${sourceX} ${sourceY} L ${x1} ${sourceY} L ${x1} ${yLane} L ${targetX} ${yLane} L ${targetX} ${targetY}`
  const labelX = (x1 + targetX) / 2
  const labelY = targetPosition === Position.Top ? yLane : (sourceY + yLane) / 2
  return { path, labelX, labelY }
}

/** Right-handle → target on the right/below: route out right, then down, then across into the target lane. */
function buildRightExitOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  targetPosition: EdgeProps['targetPosition'],
): { path: string; labelX: number; labelY: number } {
  const extendRight = 72
  const x1 = sourceX + extendRight
  const enterGap = 34
  const yLane =
    targetPosition === Position.Top ? targetY - enterGap : Math.max(sourceY, targetY) + 48
  const path =
    targetPosition === Position.Top
      ? `M ${sourceX} ${sourceY} L ${x1} ${sourceY} L ${x1} ${yLane} L ${targetX} ${yLane} L ${targetX} ${targetY}`
      : `M ${sourceX} ${sourceY} L ${x1} ${sourceY} L ${x1} ${targetY} L ${targetX} ${targetY}`
  const labelX = (x1 + targetX) / 2
  const labelY = targetPosition === Position.Top ? yLane : (sourceY + targetY) / 2
  return { path, labelX, labelY }
}

function useLeftExitOrthogonal(
  sourcePosition: EdgeProps['sourcePosition'],
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): boolean {
  if (sourcePosition !== Position.Left) return false
  if (targetX <= sourceX + 32) return false
  if (targetY < sourceY - 12) return false
  return Math.abs(targetX - sourceX) > 40
}

function useRightExitOrthogonal(
  sourcePosition: EdgeProps['sourcePosition'],
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): boolean {
  if (sourcePosition !== Position.Right) return false
  if (targetX <= sourceX + 24) return false
  if (targetY < sourceY - 12) return false
  return Math.abs(targetX - sourceX) > 40
}

type ConditionEdgeData = {
  label?: string | null
  condition?: string | null
  /** Matches module-map accent for edge labels */
  labelColor?: string
}

export default function ConditionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const edgeData = (data as ConditionEdgeData) ?? {}
  const { label } = edgeData
  const labelColor = edgeData.labelColor ?? '#16a34a'

  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const labelLower = typeof label === 'string' ? label.toLowerCase().trim() : ''
  const isNoBranch = sourceHandleId === 'no' || labelLower === 'no'
  const isYesBranch = sourceHandleId === 'yes' || labelLower === 'yes'

  /**
   * Module map uses ELK orthogonal routing; smooth-step here with biases to reduce crossings:
   * - "no" + target to the right: pull the first horizontal segment further left.
   * - "yes" + target below-left: drop farther before turning (avoids slicing under the "no" sweep).
   */
  const pathParams = (() => {
    const base = { borderRadius: 14, offset: 36 as number }
    if (isNoBranch && dx > 48 && dy > 32) {
      return {
        ...base,
        offset: 44,
        centerX: sourceX - Math.min(140, Math.max(56, dx * 0.32)),
      }
    }
    if (isYesBranch && !isNoBranch && dy > 40) {
      if (dx < -28) {
        return {
          ...base,
          offset: 52,
          centerY: sourceY + Math.min(200, dy * 0.62),
        }
      }
      if (dy > 48) {
        return {
          ...base,
          offset: 40,
          centerY: sourceY + Math.min(150, dy * 0.45),
        }
      }
    }
    return base
  })()

  const useLeftOrtho = useLeftExitOrthogonal(sourcePosition, sourceX, sourceY, targetX, targetY)
  const useRightOrtho = useRightExitOrthogonal(sourcePosition, sourceX, sourceY, targetX, targetY)

  const {
    path: edgePath,
    labelX,
    labelY,
  } = useLeftOrtho
    ? buildLeftExitOrthogonalPath(sourceX, sourceY, targetX, targetY, targetPosition)
    : useRightOrtho
      ? buildRightExitOrthogonalPath(sourceX, sourceY, targetX, targetY, targetPosition)
      : (() => {
          const [p, lx, ly] = getSmoothStepPath({
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
            ...pathParams,
          })
          return { path: p, labelX: lx, labelY: ly }
        })()

  const edgeStyle: CSSProperties = {
    ...style,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      <EdgeLabelRenderer>
        {label ? (
          <div
            data-testid="edge-label"
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: 'white',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              border: `1px solid ${labelColor}`,
              color: labelColor,
              pointerEvents: 'all',
            }}
          >
            {label}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}
