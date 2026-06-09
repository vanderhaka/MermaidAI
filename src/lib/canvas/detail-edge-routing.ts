import { buildRoundedOrthogonalPath, getPathMidpoint } from '@/lib/canvas/edge-routing'

export type NodeBounds = {
  x: number
  y: number
  width: number
  height: number
}

type Point = { x: number; y: number }

type RoutedPath = { edgePath: string; labelX: number; labelY: number }

const DEFAULT_CLEARANCE = 24
const DEFAULT_BORDER_RADIUS = 14

/**
 * Slide a vertical corridor sideways until it clears every node whose vertical
 * span intersects the corridor. `direction` is the side to escape toward.
 */
function resolveCorridorX(
  preferredX: number,
  direction: 1 | -1,
  yTop: number,
  yBottom: number,
  obstacles: NodeBounds[],
  clearance: number,
): number {
  let x = preferredX

  for (let attempts = 0; attempts <= obstacles.length; attempts++) {
    const hit = obstacles.find(
      (o) =>
        x > o.x - clearance &&
        x < o.x + o.width + clearance &&
        yBottom > o.y &&
        yTop < o.y + o.height,
    )
    if (!hit) return x
    x = direction === 1 ? hit.x + hit.width + clearance : hit.x - clearance
  }

  return x
}

function finishRoute(points: Point[], borderRadius: number): RoutedPath {
  const deduped = points.filter((point, index) => {
    if (index === 0) return true
    const prev = points[index - 1]
    return prev.x !== point.x || prev.y !== point.y
  })
  const midpoint = getPathMidpoint(deduped)
  return {
    edgePath: buildRoundedOrthogonalPath(deduped, borderRadius),
    labelX: midpoint.x,
    labelY: midpoint.y,
  }
}

type BackEdgePathArgs = {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourceBounds: NodeBounds
  targetBounds: NodeBounds
  obstacles?: NodeBounds[]
  clearance?: number
  borderRadius?: number
}

/**
 * Route a back edge (target above source, bottom → top handles) around the
 * endpoint nodes with real clearance from their bounds. The generic smoothstep
 * fallback knows nothing about node sizes and hugs or crosses wide nodes.
 */
export function buildBackEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceBounds,
  targetBounds,
  obstacles = [],
  clearance = DEFAULT_CLEARANCE,
  borderRadius = DEFAULT_BORDER_RADIUS,
}: BackEdgePathArgs): RoutedPath {
  const sourceLeft = sourceBounds.x
  const sourceRight = sourceBounds.x + sourceBounds.width
  const targetLeft = targetBounds.x
  const targetRight = targetBounds.x + targetBounds.width

  const stubY = sourceY + clearance
  const approachY = targetBounds.y - clearance

  // Climb as soon as the edge clears the source node, so the long traverse runs
  // at approach height — a mid-gap climb reads as an arbitrary jog in empty space.
  let corridorX: number
  if (targetLeft - sourceRight >= clearance * 2) {
    corridorX = resolveCorridorX(sourceRight + clearance, 1, approachY, stubY, obstacles, clearance)
  } else if (sourceLeft - targetRight >= clearance * 2) {
    corridorX = resolveCorridorX(sourceLeft - clearance, -1, approachY, stubY, obstacles, clearance)
  } else {
    const leftCorridor = Math.min(sourceLeft, targetLeft) - clearance
    const rightCorridor = Math.max(sourceRight, targetRight) + clearance
    const leftDetour = Math.abs(sourceX - leftCorridor) + Math.abs(targetX - leftCorridor)
    const rightDetour = Math.abs(rightCorridor - sourceX) + Math.abs(rightCorridor - targetX)
    const escapeDirection: 1 | -1 = leftDetour <= rightDetour ? -1 : 1
    corridorX = resolveCorridorX(
      escapeDirection === -1 ? leftCorridor : rightCorridor,
      escapeDirection,
      approachY,
      stubY,
      obstacles,
      clearance,
    )
  }

  return finishRoute(
    [
      { x: sourceX, y: sourceY },
      { x: sourceX, y: stubY },
      { x: corridorX, y: stubY },
      { x: corridorX, y: approachY },
      { x: targetX, y: approachY },
      { x: targetX, y: targetY },
    ],
    borderRadius,
  )
}

type SideExitPathArgs = {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  /** 1 when leaving a right-side handle, -1 for a left-side handle. */
  exitDirection: 1 | -1
  targetBounds: NodeBounds
  obstacles?: NodeBounds[]
  clearance?: number
  borderRadius?: number
}

/**
 * Route an edge that leaves a side handle (decision branches) down into a
 * target's top handle. The vertical corridor escapes outward past any node in
 * its way instead of cutting through nodes between source and target.
 */
export function buildSideExitPath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  exitDirection,
  targetBounds,
  obstacles = [],
  clearance = DEFAULT_CLEARANCE,
  borderRadius = DEFAULT_BORDER_RADIUS,
}: SideExitPathArgs): RoutedPath {
  const approachY = targetBounds.y - clearance
  const corridorX = resolveCorridorX(
    sourceX + exitDirection * clearance,
    exitDirection,
    Math.min(sourceY, approachY),
    Math.max(sourceY, approachY),
    obstacles,
    clearance,
  )

  return finishRoute(
    [
      { x: sourceX, y: sourceY },
      { x: corridorX, y: sourceY },
      { x: corridorX, y: approachY },
      { x: targetX, y: approachY },
      { x: targetX, y: targetY },
    ],
    borderRadius,
  )
}
