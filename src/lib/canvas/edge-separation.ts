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

/**
 * Interior segments only — the first and last segments are anchored to node
 * handles and must not move.
 */
function collectInteriorSegments(
  pointLists: Position[][],
  orientation: 'vertical' | 'horizontal',
): SegmentRef[] {
  const segments: SegmentRef[] = []

  pointLists.forEach((points, edgeIndex) => {
    for (let pointIndex = 2; pointIndex < points.length - 1; pointIndex++) {
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
      })
    }
  })

  return segments
}

function rangesOverlap(a: SegmentRef, b: SegmentRef): boolean {
  return a.rangeStart < b.rangeEnd && b.rangeStart < a.rangeEnd
}

function spreadCluster(
  cluster: SegmentRef[],
  pointLists: Position[][],
  orientation: 'vertical' | 'horizontal',
): void {
  if (cluster.length < 2) return

  const needsSeparation = cluster.some((a) =>
    cluster.some((b) => a !== b && a.edgeIndex !== b.edgeIndex && rangesOverlap(a, b)),
  )
  if (!needsSeparation) return

  const members = [...cluster].sort(
    (a, b) => a.edgeIndex - b.edgeIndex || a.pointIndex - b.pointIndex,
  )
  const centroid = members.reduce((sum, seg) => sum + seg.axis, 0) / members.length

  members.forEach((seg, index) => {
    const value = centroid + (index - (members.length - 1) / 2) * SEPARATION
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
  const segments = collectInteriorSegments(pointLists, orientation).sort(
    (a, b) => a.axis - b.axis,
  )

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
 * other. This pass clusters parallel interior segments that run within one
 * lane-width of each other with overlapping spans, and spreads them apart.
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
