'use client'

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react'
import type { Edge, EdgeProps } from '@xyflow/react'

type ConditionEdgeData = {
  label?: string | null
}

type ConditionEdgeType = Edge<ConditionEdgeData, 'condition'>

export default function ConditionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<ConditionEdgeType>) {
  const { label } = data ?? {}

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ animation: 'dashdraw 0.5s linear infinite', strokeDasharray: 5 }}
      />
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
              border: '1px solid #d1d5db',
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
