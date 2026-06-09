// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { separateOverlappingSegments } from '@/lib/canvas/edge-separation'
import type { ModuleConnectionSection } from '@/lib/canvas/layout'

function makeEdge(id: string, points: Array<{ x: number; y: number }>) {
  const sections: ModuleConnectionSection[] = [
    {
      startPoint: points[0],
      bendPoints: points.slice(1, -1),
      endPoint: points[points.length - 1],
    },
  ]
  return { id, sections }
}

function pointsOf(edge: { sections: ModuleConnectionSection[] }) {
  const section = edge.sections[0]
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
}

describe('separateOverlappingSegments', () => {
  // Geometry from the live Cart scope regression: three edges stacked on the
  // x=374 gutter corridor between the two node columns.
  const stacked = [
    makeEdge('skip-coupon', [
      { x: 278, y: 632 },
      { x: 374, y: 632 },
      { x: 374, y: 1512 },
      { x: 554, y: 1512 },
      { x: 554, y: 1556 },
    ]),
    makeEdge('retry-coupon', [
      { x: 554, y: 1304 },
      { x: 554, y: 1336 },
      { x: 374, y: 1336 },
      { x: 374, y: 784 },
      { x: 190, y: 784 },
      { x: 190, y: 816 },
    ]),
    makeEdge('backend-fail', [
      { x: 278, y: 1060 },
      { x: 374, y: 1060 },
      { x: 374, y: 1188 },
      { x: 554, y: 1188 },
      { x: 554, y: 1244 },
    ]),
  ]

  it('spreads overlapping vertical corridors 12px apart around their centroid', () => {
    const result = separateOverlappingSegments(stacked)

    const corridorXs = result.map((edge) => {
      const pts = pointsOf(edge)
      // The shared corridor was at x=374 in every input edge.
      return pts.find((p, i) => i > 0 && i < pts.length - 1 && Math.abs(p.x - 374) <= 12)?.x
    })

    expect(corridorXs).toEqual([362, 374, 386])
  })

  it('never moves the handle-anchored endpoints', () => {
    const result = separateOverlappingSegments(stacked)

    result.forEach((edge, i) => {
      const before = pointsOf(stacked[i])
      const after = pointsOf(edge)
      expect(after[0]).toEqual(before[0])
      expect(after[after.length - 1]).toEqual(before[before.length - 1])
    })
  })

  it('leaves same-axis segments alone when their spans do not overlap', () => {
    const apart = [
      makeEdge('top', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 200 },
        { x: 200, y: 200 },
        { x: 200, y: 240 },
      ]),
      makeEdge('bottom', [
        { x: 0, y: 500 },
        { x: 100, y: 500 },
        { x: 100, y: 700 },
        { x: 200, y: 700 },
        { x: 200, y: 740 },
      ]),
    ]

    const result = separateOverlappingSegments(apart)
    expect(pointsOf(result[0])).toEqual(pointsOf(apart[0]))
    expect(pointsOf(result[1])).toEqual(pointsOf(apart[1]))
  })

  it('moves interior corridors off handle-anchored straight edges', () => {
    const edges = [
      // A straight edge whose single segment is fully handle-anchored at x=554.
      makeEdge('straight', [
        { x: 554, y: 1460 },
        { x: 554, y: 1556 },
      ]),
      // An interior corridor landing on the same x=554 track with overlapping span.
      makeEdge('looper', [
        { x: 400, y: 1400 },
        { x: 554, y: 1400 },
        { x: 554, y: 1600 },
        { x: 700, y: 1600 },
        { x: 700, y: 1650 },
      ]),
    ]

    const result = separateOverlappingSegments(edges)

    // Anchored straight edge never moves.
    expect(pointsOf(result[0])).toEqual(pointsOf(edges[0]))
    // The interior corridor settles a full lane away from the occupied track.
    const corridorX = pointsOf(result[1])[1].x
    expect(Math.abs(corridorX - 554)).toBeGreaterThanOrEqual(12)
  })

  it('separates near-coincident horizontal approaches into the same target', () => {
    const converging = [
      makeEdge('from-left', [
        { x: 190, y: 1460 },
        { x: 190, y: 1508 },
        { x: 554, y: 1508 },
        { x: 554, y: 1556 },
      ]),
      makeEdge('from-above', [
        { x: 278, y: 632 },
        { x: 374, y: 632 },
        { x: 374, y: 1512 },
        { x: 554, y: 1512 },
        { x: 554, y: 1556 },
      ]),
    ]

    const result = separateOverlappingSegments(converging)
    const leftApproachY = pointsOf(result[0])[1].y
    const aboveApproachY = pointsOf(result[1])[2].y

    expect(Math.abs(leftApproachY - aboveApproachY)).toBeGreaterThanOrEqual(12)
    // Final drops into the shared handle stay put.
    expect(pointsOf(result[0])[3]).toEqual({ x: 554, y: 1556 })
    expect(pointsOf(result[1])[4]).toEqual({ x: 554, y: 1556 })
  })
})
