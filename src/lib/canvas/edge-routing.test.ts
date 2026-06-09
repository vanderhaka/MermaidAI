// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as edgeRouting from '@/lib/canvas/edge-routing'
import {
  buildPathFromSections,
  buildRoundedOrthogonalPath,
  getStrokeWidth,
  toRgba,
} from '@/lib/canvas/edge-routing'
import type { ModuleConnectionSection } from '@/lib/canvas/layout'

describe('edge-routing public API', () => {
  it('keeps only component-consumed helpers exported', () => {
    expect(Object.keys(edgeRouting).sort()).toEqual([
      'buildPathFromSections',
      'buildRoundedOrthogonalPath',
      'getPathMidpoint',
      'getStrokeWidth',
      'toRgba',
    ])
  })
})

describe('buildPathFromSections', () => {
  it('stitches ELK sections into the same rounded orthogonal route', () => {
    const sections: ModuleConnectionSection[] = [
      {
        startPoint: { x: 40, y: 100 },
        bendPoints: [
          { x: 52, y: 150 },
          { x: 40, y: 162 },
          { x: -20, y: 162 },
        ],
        endPoint: { x: -32, y: 162 },
      },
      {
        startPoint: { x: -20, y: 174 },
        endPoint: { x: -32, y: 280 },
      },
    ]

    expect(buildPathFromSections(sections, 'bottom', 'top', 0)).toEqual({
      edgePath: 'M40 100 L40 162 L-20 162 L-20 174 L-32 174 L-32 280',
      labelX: -20,
      labelY: 166,
    })
  })

  it('collapses duplicate points through the public section path builder', () => {
    const sections: ModuleConnectionSection[] = [
      {
        startPoint: { x: 10, y: 20 },
        bendPoints: [
          { x: 10, y: 20 },
          { x: 10, y: 80 },
          { x: 10, y: 80 },
        ],
        endPoint: { x: 120, y: 80 },
      },
    ]

    expect(buildPathFromSections(sections, 'bottom', 'left', 0)).toEqual({
      edgePath: 'M10 20 L10 80 L120 80',
      labelX: 35,
      labelY: 80,
    })
  })

  it('orthogonalizes diagonal section points through the public section path builder', () => {
    const sections: ModuleConnectionSection[] = [
      {
        startPoint: { x: 0, y: 0 },
        bendPoints: [{ x: 40, y: 40 }],
        endPoint: { x: 80, y: 40 },
      },
    ]

    expect(buildPathFromSections(sections, 'right', 'left', 0)).toEqual({
      edgePath: 'M0 0 L40 0 L40 40 L80 40',
      labelX: 40,
      labelY: 20,
    })
  })
})

describe('buildRoundedOrthogonalPath', () => {
  it('renders rounded corners without moving segment endpoints', () => {
    expect(
      buildRoundedOrthogonalPath(
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 40 },
        ],
        10,
      ),
    ).toBe('M0 0 L30 0 Q40 0 40 10 L40 40')
  })
})

describe('edge-routing style helpers', () => {
  it('falls back to slate rgba for invalid colors', () => {
    expect(toRgba('not-a-hex-color', 0.32)).toBe('rgba(15, 23, 42, 0.32)')
  })

  it('parses numeric and CSS string stroke widths', () => {
    expect(getStrokeWidth(4, 2)).toBe(4)
    expect(getStrokeWidth('3.5px', 2)).toBe(3.5)
    expect(getStrokeWidth('wide', 2)).toBe(2)
    expect(getStrokeWidth(undefined, 2)).toBe(2)
  })
})
