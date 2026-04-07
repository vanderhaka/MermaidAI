'use client'

import { useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type { ModuleConnectionSection } from '@/lib/canvas/layout'
import {
  buildPathFromSections,
  buildRoundedOrthogonalPath,
  toRgba,
  getStrokeWidth,
} from '@/lib/canvas/edge-routing'

export type ModuleConnectionRouteBias = 'none' | 'source-x' | 'source-y'
export type ModuleConnectionRouteBand = 'direct' | 'outer-x' | 'outer-y'

export type ModuleConnectionEdgeData = {
  label?: string | null
  labelColor?: string
  tooltipDescription?: string
  sections?: ModuleConnectionSection[]
  routeBias?: ModuleConnectionRouteBias
  routeBand?: ModuleConnectionRouteBand
  laneCoordinate?: number
  laneGap?: number
  laneOffset?: number
  offset?: number
  borderRadius?: number
}

const STRAIGHT_ROUTE_TOLERANCE = 6

function getBiasedCenter(
  routeBias: ModuleConnectionRouteBias,
  laneGap: number,
  laneOffset: number,
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
      centerY: sourceY + Math.sign(dy) * delta + laneOffset,
    }
  }

  if (routeBias === 'source-x' && dx !== 0) {
    const delta = Math.min(laneGap, Math.abs(dx) * 0.35)
    return {
      centerX: sourceX + Math.sign(dx) * delta + laneOffset,
      centerY: undefined,
    }
  }

  return { centerX: undefined, centerY: undefined }
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

function getStraightRoute(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  return {
    edgePath: `M${sourceX} ${sourceY} L${targetX} ${targetY}`,
    labelX: (sourceX + targetX) / 2,
    labelY: (sourceY + targetY) / 2,
  }
}

function getAlignedStraightRoute({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  routeBand,
}: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: EdgeProps['sourcePosition']
  targetPosition: EdgeProps['targetPosition']
  routeBand: ModuleConnectionRouteBand
}) {
  if (routeBand !== 'direct') return null

  const isHorizontalFlow =
    (sourcePosition === 'left' && targetPosition === 'right') ||
    (sourcePosition === 'right' && targetPosition === 'left')
  const isVerticalFlow =
    (sourcePosition === 'top' && targetPosition === 'bottom') ||
    (sourcePosition === 'bottom' && targetPosition === 'top')

  if (isHorizontalFlow && Math.abs(sourceY - targetY) <= STRAIGHT_ROUTE_TOLERANCE) {
    return getStraightRoute(sourceX, sourceY, targetX, targetY)
  }

  if (isVerticalFlow && Math.abs(sourceX - targetX) <= STRAIGHT_ROUTE_TOLERANCE) {
    return getStraightRoute(sourceX, sourceY, targetX, targetY)
  }

  return null
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
  const hasExplicitSections = (edgeData.sections?.length ?? 0) > 0
  const routeBias = edgeData.routeBias ?? 'none'
  const routeBand = edgeData.routeBand ?? 'direct'
  const laneGap = edgeData.laneGap ?? 0
  const laneOffset = edgeData.laneOffset ?? 0
  const { centerX, centerY } = getBiasedCenter(
    routeBias,
    laneGap,
    laneOffset,
    sourceX,
    sourceY,
    targetX,
    targetY,
  )
  const borderRadius = edgeData.borderRadius ?? (hasExplicitSections ? 0 : 12)
  const offset = edgeData.offset ?? 24
  const route = (() => {
    if (hasExplicitSections) {
      return buildPathFromSections(
        edgeData.sections ?? [],
        sourcePosition,
        targetPosition,
        borderRadius,
      )
    }

    const straightRoute = getAlignedStraightRoute({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      routeBand,
    })

    if (straightRoute) {
      return straightRoute
    }

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
  const isMostlyVertical = Math.abs(targetY - sourceY) > Math.abs(targetX - sourceX)
  const tooltipTransform = isMostlyVertical
    ? `translate(${labelX + 14}px, ${labelY}px) translate(0, -50%) scale(${isHovered ? 1.02 : 1})`
    : `translate(${labelX}px, ${labelY - 14}px) translate(-50%, -100%) scale(${isHovered ? 1.02 : 1})`
  const tooltipLabel = edgeData.label ?? ''
  const tooltipAriaLabel = edgeData.tooltipDescription
    ? `${tooltipLabel}: ${edgeData.tooltipDescription}`
    : tooltipLabel

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
        aria-label={tooltipAriaLabel}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <title>{tooltipAriaLabel}</title>
      </path>
      <EdgeLabelRenderer>
        {isHovered && edgeData.label ? (
          <div
            data-testid="module-connection-edge-tooltip"
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: tooltipTransform,
              background: 'rgba(255, 255, 255, 0.96)',
              padding: '8px 10px',
              borderRadius: 10,
              minWidth: 140,
              color: '#0f172a',
              pointerEvents: 'none',
              border: `1px solid ${toRgba(accentColor, 0.22)}`,
              boxShadow: `0 12px 28px ${toRgba(accentColor, 0.18)}`,
              transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
            }}
          >
            <div
              style={{
                fontSize: 11,
                lineHeight: 1.2,
                fontWeight: 600,
                color: edgeData.labelColor ?? '#475569',
                whiteSpace: 'nowrap',
              }}
            >
              {edgeData.label}
            </div>
            {edgeData.tooltipDescription ? (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  lineHeight: 1.3,
                  color: '#64748b',
                  whiteSpace: 'nowrap',
                }}
              >
                {edgeData.tooltipDescription}
              </div>
            ) : null}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}
