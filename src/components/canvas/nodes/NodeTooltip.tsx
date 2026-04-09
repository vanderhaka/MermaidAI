'use client'

type NodeTooltipProps = {
  type: string
  description: string
}

/**
 * Tooltip shown above a node on hover.
 *
 * Requires the parent node container to have the `group` class so the
 * `group-hover` selector here will fire.
 */
export function NodeTooltip({ type, description }: NodeTooltipProps) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
    >
      <p className="font-semibold">{type}</p>
      <p className="mt-0.5 text-slate-300">{description}</p>
    </div>
  )
}
