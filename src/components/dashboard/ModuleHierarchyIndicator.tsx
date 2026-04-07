'use client'

import { displayDomain } from '@/lib/module-hierarchy'
import type { Module } from '@/types/graph'

type ModuleHierarchyIndicatorProps = {
  projectName: string
  modules: Module[]
  activeModuleId: string | null
}

export function ModuleHierarchyIndicator({
  projectName,
  modules,
  activeModuleId,
}: ModuleHierarchyIndicatorProps) {
  const active = activeModuleId ? modules.find((m) => m.id === activeModuleId) : null
  const inFlowDetail = Boolean(activeModuleId)

  /** One primary step only: Module while browsing list, Flow while viewing canvas detail. */
  type StepTone = 'current' | 'context' | 'idle'
  const tone = (step: 0 | 1 | 2): StepTone => {
    if (!inFlowDetail) {
      if (step === 0) return 'context' // L1 — grouping, not the focused step
      if (step === 1) return 'current' // L2 — choosing a module
      return 'idle' // L3 not yet
    }
    if (step === 2) return 'current' // L3 — flow editor
    return 'idle' // L1/L2 — behind you for this view
  }

  const stepClass = (step: 0 | 1 | 2) => {
    const t = tone(step)
    if (t === 'current') return 'bg-gray-900 text-white shadow-sm'
    if (t === 'context') return 'bg-gray-200 text-gray-800'
    return 'bg-gray-100 text-gray-500'
  }

  const contextLine = active
    ? `${displayDomain(active.domain)} · ${active.name}`
    : `Module map · ${projectName}`

  return (
    <div className="space-y-2" data-testid="module-hierarchy-indicator">
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        <span
          className={`rounded-md px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide ${stepClass(0)}`}
        >
          Domain
        </span>
        <span
          className={`rounded-md px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide ${stepClass(1)}`}
        >
          Module
        </span>
        <span
          className={`rounded-md px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide ${stepClass(2)}`}
        >
          Flow
        </span>
      </div>
      <p className="line-clamp-2 text-xs leading-snug text-gray-600" title={contextLine}>
        {contextLine}
      </p>
      <p className="text-[11px] leading-snug text-gray-500">
        <span className="font-medium text-gray-600">Domain</span> groups modules; each{' '}
        <span className="font-medium text-gray-600">module</span> card opens its flow.
      </p>
    </div>
  )
}
