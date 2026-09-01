'use client'

type NodeChangeHighlightProps = {
  /** True when the last assistant turn created or edited this node. */
  active: boolean
}

/**
 * Ring marking a node the assistant just touched, so new work reads apart from
 * what was already on the canvas.
 *
 * Rendered as an overlay rather than as classes on the node itself so the node's
 * own shadow and hover transition stay intact. It fades itself out via the
 * `.node-change-highlight` keyframes in globals.css — no JS timer — and holds as
 * a static ring under `prefers-reduced-motion: reduce`.
 *
 * Requires the parent to be positioned; `rounded-[inherit]` picks up its shape,
 * so a diamond or circle gets a matching ring.
 */
export function NodeChangeHighlight({ active }: NodeChangeHighlightProps) {
  if (!active) return null

  return (
    <div
      aria-hidden
      data-testid="node-change-highlight"
      className="node-change-highlight pointer-events-none absolute -inset-px rounded-[inherit]"
    />
  )
}
