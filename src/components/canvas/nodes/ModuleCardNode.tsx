'use client'

import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'

export type HandleSide = 'left' | 'right' | 'top' | 'bottom'

type ModuleCardNodeData = {
  name: string
  description: string | null
  entry_points: string[]
  exit_points: string[]
  connectedEntryPoints?: string[]
  /** Map of handle id → side. Computed by ModuleMapView based on connection directions. */
  handleSides?: Record<string, HandleSide>
  /** Optional per-handle ordering hint. Lower values render earlier on the shared side. */
  handleOrder?: Record<string, number>
  /** Optional per-handle position hint as a percentage along its side. */
  handlePositions?: Record<string, number>
}

export const MODULE_CARD_WIDTH = 260
export const MODULE_CARD_HEIGHT = 100

const ERROR_KEYWORDS = /failure|fail|error|cancel|retry|return|rollback|reject/i

const SIDE_TO_POSITION: Record<HandleSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
}

function distributeHandles(
  handles: Array<{
    id: string
    side: HandleSide
    type: 'target' | 'source'
    pointName: string
    order: number
    position?: number
  }>,
): Array<{
  id: string
  side: HandleSide
  type: 'target' | 'source'
  pointName: string
  order: number
  position?: number
  style: React.CSSProperties
}> {
  // Group handles by side, then distribute within each group
  const bySide = new Map<
    HandleSide,
    Array<{ id: string; type: 'target' | 'source'; pointName: string; order: number }>
  >()

  for (const h of handles) {
    const list = bySide.get(h.side) ?? []
    list.push({ id: h.id, type: h.type, pointName: h.pointName, order: h.order })
    bySide.set(h.side, list)
  }

  for (const [side, group] of bySide) {
    group.sort(
      (a, b) =>
        a.order - b.order ||
        a.pointName.localeCompare(b.pointName) ||
        a.type.localeCompare(b.type) ||
        a.id.localeCompare(b.id),
    )
    bySide.set(side, group)
  }

  return handles.map((h) => {
    const group = bySide.get(h.side)!
    const myIndex = group.findIndex((g) => g.id === h.id)
    const total = group.length
    const fallbackPct = ((myIndex + 1) / (total + 1)) * 100
    const pct = typeof h.position === 'number' ? h.position : fallbackPct

    const isVertical = h.side === 'left' || h.side === 'right'
    const style: React.CSSProperties = isVertical ? { top: `${pct}%` } : { left: `${pct}%` }

    return { ...h, style }
  })
}

export default function ModuleCardNode({ data }: NodeProps) {
  const {
    name,
    description,
    entry_points,
    exit_points,
    connectedEntryPoints,
    handleSides,
    handleOrder,
    handlePositions,
  } = data as ModuleCardNodeData
  const connectedSet = new Set(connectedEntryPoints ?? [])
  const sides = handleSides ?? {}
  const order = handleOrder ?? {}
  const positions = handlePositions ?? {}

  const entryHandles = entry_points.map((ep) => ({
    id: `entry-${ep}`,
    type: 'target' as const,
    side: (sides[`entry-${ep}`] ?? 'left') as HandleSide,
    pointName: ep,
    order: order[`entry-${ep}`] ?? Number.POSITIVE_INFINITY,
    position: positions[`entry-${ep}`],
  }))

  const exitHandles = exit_points.map((ep) => ({
    id: `exit-${ep}`,
    type: 'source' as const,
    side: (sides[`exit-${ep}`] ?? 'right') as HandleSide,
    pointName: ep,
    order: order[`exit-${ep}`] ?? Number.POSITIVE_INFINITY,
    position: positions[`exit-${ep}`],
  }))

  const distributedHandles = distributeHandles([...entryHandles, ...exitHandles])

  const distributedEntryHandles = distributedHandles.filter((h) => h.type === 'target')
  const distributedExitHandles = distributedHandles.filter((h) => h.type === 'source')

  return (
    <div
      className="rounded-xl border border-indigo-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md"
      style={{ width: MODULE_CARD_WIDTH, height: MODULE_CARD_HEIGHT, boxSizing: 'border-box' }}
    >
      <div className="text-sm font-semibold text-slate-900">{name}</div>
      {description && (
        <div className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
          {description}
        </div>
      )}

      {distributedEntryHandles.map((h) => {
        const ep = h.id.replace('entry-', '')
        return (
          <Handle
            key={h.id}
            id={h.id}
            type="target"
            position={SIDE_TO_POSITION[h.side]}
            className={connectedSet.has(ep) ? '!bg-green-500' : '!bg-purple-400'}
            style={h.style}
          />
        )
      })}

      {distributedExitHandles.map((h) => {
        const ep = h.id.replace('exit-', '')
        return (
          <Handle
            key={h.id}
            id={h.id}
            type="source"
            position={SIDE_TO_POSITION[h.side]}
            className={ERROR_KEYWORDS.test(ep) ? '!bg-orange-400' : '!bg-green-500'}
            style={h.style}
          />
        )
      })}
    </div>
  )
}
