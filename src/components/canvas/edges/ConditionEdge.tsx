'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type { ModuleConnectionSection } from '@/lib/canvas/layout'
import { buildPathFromSections, toRgba, getStrokeWidth } from '@/lib/canvas/edge-routing'

type ConditionEdgeData = {
  label?: string | null
  condition?: string | null
  labelColor?: string
  sections?: ModuleConnectionSection[]
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
  const [isHovered, setIsHovered] = useState(false)
  const edgeData = (data as ConditionEdgeData) ?? {}
  const { label, condition } = edgeData
  const labelColor = edgeData.labelColor ?? '#16a34a'
  const sections = edgeData.sections ?? []
  const hasExplicitSections = sections.length > 0

  const { edgePath, labelX, labelY } = (() => {
    if (hasExplicitSections) {
      return buildPathFromSections(sections, sourcePosition, targetPosition, 12)
    }

    const [p, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 14,
      offset: 36,
    })
    return { edgePath: p, labelX: lx, labelY: ly }
  })()

  const baseStrokeWidth = getStrokeWidth(style?.strokeWidth, 2)
  const accentColor = typeof style?.stroke === 'string' ? style.stroke : (labelColor ?? '#475569')
  const edgeStyle: CSSProperties = {
    ...style,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: isHovered ? baseStrokeWidth + 2 : baseStrokeWidth,
    opacity: isHovered ? 1 : (style?.opacity ?? 0.92),
    filter: isHovered ? `drop-shadow(0 0 8px ${toRgba(accentColor, 0.32)})` : 'none',
    transition: 'stroke-width 140ms ease, opacity 140ms ease, filter 140ms ease',
  }

  const tooltipLabel = label ?? ''
  const tooltipDescription = condition ? `Condition: ${condition}` : undefined
  const tooltipAriaLabel = tooltipDescription
    ? `${tooltipLabel}: ${tooltipDescription}`
    : tooltipLabel

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      <path
        data-testid="condition-edge-hitbox"
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
        {isHovered && (label || condition) ? (
          <div
            data-testid="condition-edge-tooltip"
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 14}px) scale(${isHovered ? 1.02 : 1})`,
              background: 'rgba(255, 255, 255, 0.96)',
              padding: '8px 10px',
              borderRadius: 10,
              minWidth: 80,
              color: '#0f172a',
              pointerEvents: 'none',
              border: `1px solid ${toRgba(accentColor, 0.22)}`,
              boxShadow: `0 12px 28px ${toRgba(accentColor, 0.18)}`,
              transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
            }}
          >
            {label ? (
              <div
                style={{
                  fontSize: 11,
                  lineHeight: 1.2,
                  fontWeight: 600,
                  color: labelColor,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </div>
            ) : null}
            {condition ? (
              <div
                style={{
                  marginTop: label ? 4 : 0,
                  fontSize: 11,
                  lineHeight: 1.3,
                  color: '#64748b',
                  whiteSpace: 'nowrap',
                }}
              >
                {condition}
              </div>
            ) : null}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}
