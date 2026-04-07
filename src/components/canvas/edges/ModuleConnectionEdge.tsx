'use client'

import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'

export type ModuleConnectionRouteBias = 'none' | 'source-x' | 'source-y'
export type ModuleConnectionRouteBand = 'direct' | 'outer-x' | 'outer-y'

export type ModuleConnectionEdgeData = {
  label?: string | null
  labelColor?: string
  routeBias?: ModuleConnectionRouteBias
  routeBand?: ModuleConnectionRouteBand
  laneCoordinate?: number
  laneGap?: number
  offset?: number
  borderRadius?: number
}

function getBiasedCenter(
  routeBias: ModuleConnectionRouteBias,
  laneGap: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) {
  const dx = targetX - sourceX
  const dy = targetY - sourceY

  if (routeBias === 'source-y' && dy !== 0) {
    const delta = Math.min(laneGap, Math.abs(dy) * 0.35)
    return {
      centerX: undefined,
      centerY: sourceY + Math.sign(dy) * delta,
    }
  }

  if (routeBias === 'source-x' && dx !== 0) {
    const delta = Math.min(laneGap, Math.abs(dx) * 0.35)
    return {
      centerX: sourceX + Math.sign(dx) * delta,
      centerY: undefined,
    }
  }

  return { centerX: undefined, centerY: undefined }
}

function getStrokeWidth(value: React.CSSProperties['strokeWidth'] | undefined, fallback: number) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}

function toRgba(color: string | undefined, alpha: number) {
  const fallback = `rgba(15, 23, 42, ${alpha})`
  if (!color) return fallback

  const normalized = color.replace('#', '')
  const hex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback

  const int = Number.parseInt(hex, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function offsetPoint(x: number, y: number, direction: EdgeProps['sourcePosition'], offset: number) {
  switch (direction) {
    case 'left':
      return { x: x - offset, y }
    case 'right':
      return { x: x + offset, y }
    case 'top':
      return { x, y: y - offset }
    case 'bottom':
      return { x, y: y + offset }
    default:
      return { x, y }
  }
}

function dedupePoints(points: Array<{ x: number; y: number }>) {
  return points.filter((point, index) => {
    if (index === 0) return true
    const prev = points[index - 1]
    return prev.x !== point.x || prev.y !== point.y
  })
}

function buildRoundedOrthogonalPath(points: Array<{ x: number; y: number }>, borderRadius: number) {
  const deduped = dedupePoints(points)
  if (deduped.length === 0) return ''
  if (deduped.length === 1) return `M${deduped[0].x} ${deduped[0].y}`

  let path = `M${deduped[0].x} ${deduped[0].y}`

  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = deduped[i - 1]
    const current = deduped[i]
    const next = deduped[i + 1]

    const prevDx = current.x - prev.x
    const prevDy = current.y - prev.y
    const nextDx = next.x - current.x
    const nextDy = next.y - current.y

    const isStraight = (prevDx === 0 && nextDx === 0) || (prevDy === 0 && nextDy === 0)
    if (isStraight) {
      path += ` L${current.x} ${current.y}`
      continue
    }

    const prevLength = Math.hypot(prevDx, prevDy)
    const nextLength = Math.hypot(nextDx, nextDy)
    const radius = Math.min(borderRadius, prevLength / 2, nextLength / 2)

    const entry = {
      x: current.x - (prevDx === 0 ? 0 : Math.sign(prevDx) * radius),
      y: current.y - (prevDy === 0 ? 0 : Math.sign(prevDy) * radius),
    }
    const exit = {
      x: current.x + (nextDx === 0 ? 0 : Math.sign(nextDx) * radius),
      y: current.y + (nextDy === 0 ? 0 : Math.sign(nextDy) * radius),
    }

    path += ` L${entry.x} ${entry.y} Q${current.x} ${current.y} ${exit.x} ${exit.y}`
  }

  const last = deduped[deduped.length - 1]
  path += ` L${last.x} ${last.y}`

  return path
}

function getOuterLaneRoute({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  offset,
  borderRadius,
  routeBand,
  laneCoordinate,
}: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: EdgeProps['sourcePosition']
  targetPosition: EdgeProps['targetPosition']
  offset: number
  borderRadius: number
  routeBand: ModuleConnectionRouteBand
  laneCoordinate: number
}) {
  const sourceGap = offsetPoint(sourceX, sourceY, sourcePosition, offset)
  const targetGap = offsetPoint(targetX, targetY, targetPosition, offset)

  if (routeBand === 'outer-y') {
    const path = buildRoundedOrthogonalPath(
      [
        { x: sourceX, y: sourceY },
        sourceGap,
        { x: sourceGap.x, y: laneCoordinate },
        { x: targetGap.x, y: laneCoordinate },
        targetGap,
        { x: targetX, y: targetY },
      ],
      borderRadius,
    )

    return {
      edgePath: path,
      labelX: (sourceGap.x + targetGap.x) / 2,
      labelY: laneCoordinate,
    }
  }

  const path = buildRoundedOrthogonalPath(
    [
      { x: sourceX, y: sourceY },
      sourceGap,
      { x: laneCoordinate, y: sourceGap.y },
      { x: laneCoordinate, y: targetGap.y },
      targetGap,
      { x: targetX, y: targetY },
    ],
    borderRadius,
  )

  return {
    edgePath: path,
    labelX: laneCoordinate,
    labelY: (sourceGap.y + targetGap.y) / 2,
  }
}

export default function ModuleConnectionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false)
  const edgeData = (data as ModuleConnectionEdgeData) ?? {}
  const routeBias = edgeData.routeBias ?? 'none'
  const routeBand = edgeData.routeBand ?? 'direct'
  const laneGap = edgeData.laneGap ?? 0
  const { centerX, centerY } = getBiasedCenter(
    routeBias,
    laneGap,
    sourceX,
    sourceY,
    targetX,
    targetY,
  )
  const borderRadius = edgeData.borderRadius ?? 12
  const offset = edgeData.offset ?? 24
  const route = (() => {
    if (routeBand !== 'direct' && typeof edgeData.laneCoordinate === 'number') {
      return getOuterLaneRoute({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        offset,
        borderRadius,
        routeBand,
        laneCoordinate: edgeData.laneCoordinate,
      })
    }

    const [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      centerX,
      centerY,
      borderRadius,
      offset,
    })

    return { edgePath, labelX, labelY }
  })()
  const { edgePath, labelX, labelY } = route

  const baseStrokeWidth = getStrokeWidth(style?.strokeWidth, 2)
  const accentColor =
    typeof style?.stroke === 'string' ? style.stroke : (edgeData.labelColor ?? '#475569')
  const edgeStyle: React.CSSProperties = {
    ...style,
    strokeWidth: isHovered ? baseStrokeWidth + 2 : baseStrokeWidth,
    opacity: isHovered ? 1 : (style?.opacity ?? 0.92),
    filter: isHovered ? `drop-shadow(0 0 8px ${toRgba(accentColor, 0.32)})` : 'none',
    strokeLinecap: 'round',
    transition: 'stroke-width 140ms ease, opacity 140ms ease, filter 140ms ease',
  }
  const labelTransform = `translate(-50%, -50%) translate(${labelX}px,${labelY}px) scale(${isHovered ? 1.03 : 1})`

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      <path
        data-testid="module-connection-edge-hitbox"
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        style={{ pointerEvents: 'stroke' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <EdgeLabelRenderer>
        {edgeData.label ? (
          <div
            data-testid="module-connection-edge-label"
            data-hovered={isHovered ? 'true' : 'false'}
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: labelTransform,
              background: isHovered ? toRgba(accentColor, 0.12) : 'rgba(255, 255, 255, 0.9)',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 500,
              color: edgeData.labelColor ?? '#475569',
              pointerEvents: 'all',
              whiteSpace: 'nowrap',
              border: isHovered
                ? `1px solid ${toRgba(accentColor, 0.28)}`
                : '1px solid transparent',
              boxShadow: isHovered ? `0 10px 24px ${toRgba(accentColor, 0.18)}` : 'none',
              transition:
                'transform 140ms ease, background-color 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {edgeData.label}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}
