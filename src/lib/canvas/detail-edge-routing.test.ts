// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { buildBackEdgePath, buildSideExitPath } from '@/lib/canvas/detail-edge-routing'

describe('buildBackEdgePath', () => {
  it('routes through the gap between horizontally separated nodes', () => {
    const { edgePath } = buildBackEdgePath({
      sourceX: 95,
      sourceY: 228,
      targetX: 381,
      targetY: 132,
      sourceBounds: { x: 47, y: 132, width: 96, height: 96 },
      targetBounds: { x: 231, y: 132, width: 300, height: 60 },
      borderRadius: 0,
    })

    // Climbs right after clearing the source (143 + 32 = 175), then traverses
    // at approach height (32px above the target).
    expect(edgePath).toBe('M95 228 L95 260 L175 260 L175 100 L381 100 L381 132')
  })

  it('detours around the side with clearance when nodes overlap horizontally', () => {
    const { edgePath } = buildBackEdgePath({
      sourceX: 150,
      sourceY: 260,
      targetX: 170,
      targetY: 0,
      sourceBounds: { x: 0, y: 200, width: 300, height: 60 },
      targetBounds: { x: 20, y: 0, width: 300, height: 60 },
      borderRadius: 0,
    })

    // Left corridor sits a full clearance (32px) outside the leftmost node edge —
    // never hugging or crossing either node.
    expect(edgePath).toBe('M150 260 L150 292 L-32 292 L-32 -32 L170 -32 L170 0')
  })

  it('places the label on the corridor segment', () => {
    const { labelX, labelY } = buildBackEdgePath({
      sourceX: 95,
      sourceY: 228,
      targetX: 381,
      targetY: 132,
      sourceBounds: { x: 47, y: 132, width: 96, height: 96 },
      targetBounds: { x: 231, y: 132, width: 300, height: 60 },
      borderRadius: 0,
    })

    expect(labelX).toBe(175)
    expect(labelY).toBe(117)
  })

  it('slides the corridor past third-party nodes in its way', () => {
    const sourceBounds = { x: 47, y: 132, width: 96, height: 96 }
    const targetBounds = { x: 231, y: 132, width: 300, height: 60 }
    const { edgePath } = buildBackEdgePath({
      sourceX: 95,
      sourceY: 228,
      targetX: 381,
      targetY: 132,
      sourceBounds,
      targetBounds,
      // Production passes every node, endpoints included, plus here a node
      // parked in the 143..231 gap where the corridor (187) would run.
      obstacles: [sourceBounds, targetBounds, { x: 160, y: 100, width: 50, height: 200 }],
      borderRadius: 0,
    })

    // Near-source corridor (175) collides with the parked node and slides toward
    // the target: past the parked node (210 + 32 = 242), then past the target
    // node itself (531 + 32 = 563), approaching it from above on the far side.
    expect(edgePath).toBe('M95 228 L95 260 L563 260 L563 100 L381 100 L381 132')
  })
})

describe('buildSideExitPath', () => {
  // Geometry from the live Marketing Flowchart regression: decision right vertex
  // (1329.5, 220) → Nurture/Drop top (1239, 638), with the 300px-wide Push to CRM
  // node at x 1089..1389 sitting directly under the naive corridor.
  const pushToCrm = { x: 1089, y: 366, width: 300, height: 60 }
  const args = {
    sourceX: 1329.5,
    sourceY: 220,
    targetX: 1239,
    targetY: 638,
    exitDirection: 1 as const,
    targetBounds: { x: 1191, y: 638, width: 96, height: 96 },
    borderRadius: 0,
  }

  it('drops the corridor straight down when nothing is in the way', () => {
    const { edgePath } = buildSideExitPath(args)

    expect(edgePath).toBe('M1329.5 220 L1361.5 220 L1361.5 606 L1239 606 L1239 638')
  })

  it('escapes outward past a node sitting under the naive corridor', () => {
    const { edgePath } = buildSideExitPath({ ...args, obstacles: [pushToCrm] })

    // Corridor pushed from 1361.5 to 1389 + 32 = 1421, clear of Push to CRM.
    expect(edgePath).toBe('M1329.5 220 L1421 220 L1421 606 L1239 606 L1239 638')
  })
})
