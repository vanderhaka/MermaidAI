'use client'

import { useEffect, useState } from 'react'

type SavedIndicatorProps = {
  /** Number that increments each time a save completes — triggers the pill to show. */
  trigger: number
}

export function SavedIndicator({ trigger }: SavedIndicatorProps) {
  const [visible, setVisible] = useState(false)
  const [lastSeen, setLastSeen] = useState(trigger)

  // Derived state: when trigger changes, surface the pill on the next render
  if (trigger !== lastSeen) {
    setLastSeen(trigger)
    if (trigger > 0 && !visible) {
      setVisible(true)
    }
  }

  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), 2500)
    return () => clearTimeout(timer)
  }, [visible, lastSeen])

  if (!visible) return null

  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3 w-3"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clipRule="evenodd"
        />
      </svg>
      Saved
    </span>
  )
}
