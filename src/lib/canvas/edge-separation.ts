import type { ModuleConnectionSection } from '@/lib/canvas/layout'
import type { Position } from '@/types/graph'

type RoutedEdge = { id: string; sections: ModuleConnectionSection[] }

type SegmentRef = {
  edgeIndex: number
  /** Segment runs from points[pointIndex - 1] to points[pointIndex]. */
  pointIndex: number
  /** Shared coordinate: x for vertical segments, y for horizontal ones. */
  axis: number
  rangeStart: number
  rangeEnd: number
  /** First and last segments are anchored to node handles and must not move. */
  movable: boolean
}

const SEPARATION = 12

function flattenSectionPoints(sections: ModuleConnectionSection[]): Position[] {
  const points: Position[] = []
  for (const section of sections) {
    points.push(section.startPoint, ...(section.bendPoints ?? []), section.endPoint)
  }
  return points.filter((point, index) => {
    if (index === 0) return true
    const prev = points[index - 1]
    return prev.x !== point.x || prev.y !== point.y
  })
}

function collectSegments(
  pointLists: Position[][],
  orientation: 'vertical' | 'horizontal',
): SegmentRef[] {
  const segments: SegmentRef[] = []

  pointLists.forEach((points, edgeIndex) => {
    for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
      const a = points[pointIndex - 1]
      const b = points[pointIndex]
      const isVertical = a.x === b.x && a.y !== b.y
      const isHorizontal = a.y === b.y && a.x !== b.x
      if (orientation === 'vertical' ? !isVertical : !isHorizontal) continue

      const range = orientation === 'vertical' ? [a.y, b.y] : [a.x, b.x]
      segments.push({
        edgeIndex,
        pointIndex,
        axis: orientation === 'vertical' ? a.x : a.y,
        rangeStart: Math.min(range[0], range[1]),
        rangeEnd: Math.max(range[0], range[1]),
        movable: pointIndex >= 2 && pointIndex <= points.length - 2,
      })
    }
  })

  return segments
}

function rangesOverlap(a: SegmentRef, b: SegmentRef): boolean {
  return a.rangeStart < b.rangeEnd && b.rangeStart < a.rangeEnd
}

/** Offset sequence 0, -1, +1, -2, +2, … used to pick lanes nearest the centroid. */
function laneOffset(step: number): number {
  if (step === 0) return 0
  const magnitude = Math.ceil(step / 2)
  return step % 2 === 1 ? -magnitude : magnitude
}

function spreadCluster(
  cluster: SegmentRef[],
  pointLists: Position[][],
  orientation: 'vertical' | 'horizontal',
): void {
  const movables = cluster.filter((segment) => segment.movable)
  if (movables.length === 0) return

  const needsSeparation = cluster.some((a) =>
    cluster.some(
      (b) =>
        a !== b && a.edgeIndex !== b.edgeIndex && (a.movable || b.movable) && rangesOverlap(a, b),
    ),
  )
  if (!needsSeparation) return

  const base = cluster.reduce((sum, seg) => sum + seg.axis, 0) / cluster.length
  const fixedValues = cluster.filter((seg) => !seg.movable).map((seg) => seg.axis)

  const positions: number[] = []
  for (let step = 0; positions.length < movables.length; step++) {
    const candidate = base + laneOffset(step) * SEPARATION
    if (fixedValues.every((value) => Math.abs(value - candidate) >= SEPARATION)) {
      positions.push(candidate)
    }
  }
  positions.sort((a, b) => a - b)

  const ordered = [...movables].sort(
    (a, b) => a.edgeIndex - b.edgeIndex || a.pointIndex - b.pointIndex,
  )
  ordered.forEach((seg, index) => {
    const value = positions[index]
    const points = pointLists[seg.edgeIndex]
    const a = points[seg.pointIndex - 1]
    const b = points[seg.pointIndex]
    if (orientation === 'vertical') {
      a.x = value
      b.x = value
    } else {
      a.y = value
      b.y = value
    }
  })
}

function separateOrientation(
  pointLists: Position[][],
  orientation: 'vertical' | 'horizontal',
): void {
  const segments = collectSegments(pointLists, orientation).sort((a, b) => a.axis - b.axis)

  let cluster: SegmentRef[] = []
  for (const segment of segments) {
    if (cluster.length === 0 || segment.axis - cluster[cluster.length - 1].axis <= SEPARATION) {
      cluster.push(segment)
      continue
    }
    spreadCluster(cluster, pointLists, orientation)
    cluster = [segment]
  }
  spreadCluster(cluster, pointLists, orientation)
}

/**
 * The flow-detail router picks each edge's route independently, so edges that
 * head to the same column or row land on identical corridors and overdraw each
 * other. This pass clusters parallel segments running within one lane-width of
 * each other with overlapping spans and spreads the movable (interior) ones
 * apart — including away from handle-anchored segments, which act as occupied
 * tracks and never move. Edges converging on the same handle keep their shared
 * final stub: paths may merge only where they end at the same place.
 */
export function separateOverlappingSegments(edges: RoutedEdge[]): RoutedEdge[] {
  const pointLists = edges.map((edge) =>
    flattenSectionPoints(edge.sections).map((point) => ({ ...point })),
  )

  separateOrientation(pointLists, 'vertical')
  separateOrientation(pointLists, 'horizontal')

  return edges.map((edge, index) => {
    const points = pointLists[index]
    if (points.length < 2) return edge
    return {
      id: edge.id,
      sections: [
        {
          startPoint: points[0],
          bendPoints: points.slice(1, -1),
          endPoint: points[points.length - 1],
        },
      ],
    }
  })
}
