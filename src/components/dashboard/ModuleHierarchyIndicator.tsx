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

  const stepClass = (step: 0 | 1 | 2) => {
    const browsing = !inFlowDetail
    const activeBrowse = browsing && step <= 1
    const activeFlow = inFlowDetail && step === 2
    const on = activeBrowse || activeFlow
    return on ? 'bg-gray-900 text-white shadow-sm' : 'bg-gray-100 text-gray-500'
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
    </div>
  )
}
