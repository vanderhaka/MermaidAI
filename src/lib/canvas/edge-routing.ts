import type { ModuleConnectionSection } from '@/lib/canvas/layout'

type Point = { x: number; y: number }

export function dedupePoints(points: Point[]): Point[] {
  return points.filter((point, index) => {
    if (index === 0) return true
    const prev = points[index - 1]
    return prev.x !== point.x || prev.y !== point.y
  })
}

function getRouteAxis(start: Point, end: Point) {
  if (start.x === end.x && start.y !== end.y) return 'vertical'
  if (start.y === end.y && start.x !== end.x) return 'horizontal'
  return null
}

function getRouteAxisForPosition(position: string) {
  return position === 'left' || position === 'right' ? 'horizontal' : 'vertical'
}

export function collapseLinearPoints(points: Point[]): Point[] {
  const collapsed: Point[] = []

  for (const point of points) {
    const last = collapsed[collapsed.length - 1]
    if (last && last.x === point.x && last.y === point.y) continue

    collapsed.push(point)

    while (collapsed.length >= 3) {
      const first = collapsed[collapsed.length - 3]
      const middle = collapsed[collapsed.length - 2]
      const lastPoint = collapsed[collapsed.length - 1]

      const isVerticalLine = first.x === middle.x && middle.x === lastPoint.x
      const isHorizontalLine = first.y === middle.y && middle.y === lastPoint.y

      if (!isVerticalLine && !isHorizontalLine) break
      collapsed.splice(collapsed.length - 2, 1)
    }
  }

  return collapsed
}

export function orthogonalizePoints(
  points: Point[],
  sourcePosition: string,
  targetPosition: string,
): Point[] {
  const deduped = dedupePoints(points)
  if (deduped.length < 2) return deduped

  const orthogonal: Point[] = [deduped[0]]

  for (let index = 1; index < deduped.length; index++) {
    const current = deduped[index]
    const previous = orthogonal[orthogonal.length - 1]

    if (previous.x === current.x || previous.y === current.y) {
      orthogonal.push(current)
      continue
    }

    const previousAxis =
      orthogonal.length > 1 ? getRouteAxis(orthogonal[orthogonal.length - 2], previous) : null
    const isLastPoint = index === deduped.length - 1
    const preferredFirstAxis = isLastPoint
      ? getRouteAxisForPosition(targetPosition) === 'vertical'
        ? 'horizontal'
        : 'vertical'
      : (previousAxis ?? getRouteAxisForPosition(sourcePosition))
    const elbow =
      preferredFirstAxis === 'vertical'
        ? { x: previous.x, y: current.y }
        : { x: current.x, y: previous.y }

    if (elbow.x !== previous.x || elbow.y !== previous.y) {
      orthogonal.push(elbow)
    }

    orthogonal.push(current)

    const collapsed = collapseLinearPoints(orthogonal)
    orthogonal.splice(0, orthogonal.length, ...collapsed)
  }

  return collapseLinearPoints(orthogonal)
}

export function buildRoundedOrthogonalPath(points: Point[], borderRadius: number): string {
  const deduped = dedupePoints(points)
  if (deduped.length === 0) return ''
  if (deduped.length === 1) return `M${deduped[0].x} ${deduped[0].y}`
  if (borderRadius <= 0) {
    return deduped
      .map((point, index) => (index === 0 ? `M${point.x} ${point.y}` : `L${point.x} ${point.y}`))
      .join(' ')
  }

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

export function getSectionPathPoints(sections: ModuleConnectionSection[]): Point[] {
  if (sections.length === 0) return []

  const points: Point[] = []

  for (const section of sections) {
    points.push(section.startPoint)
    points.push(...(section.bendPoints ?? []))
    points.push(section.endPoint)
  }

  return dedupePoints(points)
}

export function getPathMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]

  const segments = points
    .slice(1)
    .map((point, index) => ({
      start: points[index],
      end: point,
      length: Math.hypot(point.x - points[index].x, point.y - points[index].y),
    }))
    .filter((segment) => segment.length > 0)

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)
  const halfLength = totalLength / 2

  let traversed = 0
  for (const segment of segments) {
    if (traversed + segment.length >= halfLength) {
      const remaining = halfLength - traversed
      const ratio = segment.length === 0 ? 0 : remaining / segment.length
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      }
    }
    traversed += segment.length
  }

  return points[points.length - 1]
}

export function toRgba(color: string | undefined, alpha: number): string {
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

export function getStrokeWidth(
  value: React.CSSProperties['strokeWidth'] | undefined,
  fallback: number,
): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return fallback
}

/**
 * Build an SVG path from ELK sections with orthogonal correction and rounded corners.
 * Shared by both ModuleConnectionEdge and ConditionEdge.
 */
export function buildPathFromSections(
  sections: ModuleConnectionSection[],
  sourcePosition: string,
  targetPosition: string,
  borderRadius: number,
): { edgePath: string; labelX: number; labelY: number } {
  const points = orthogonalizePoints(getSectionPathPoints(sections), sourcePosition, targetPosition)
  const midpoint = getPathMidpoint(points)
  return {
    edgePath: buildRoundedOrthogonalPath(points, borderRadius),
    labelX: midpoint.x,
    labelY: midpoint.y,
  }
}
