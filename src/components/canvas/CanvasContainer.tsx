'use client'

import { memo } from 'react'
import { displayDomain } from '@/lib/module-hierarchy'
import { useGraphStore } from '@/store/graph-store'
import ModuleMapView from '@/components/canvas/views/ModuleMapView'
import ModuleDetailView from '@/components/canvas/views/ModuleDetailView'

type CanvasContainerProps = {
  showFunnelLanes?: boolean
}

function CanvasContainer({ showFunnelLanes = false }: CanvasContainerProps) {
  const modules = useGraphStore((s) => s.modules)
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const connections = useGraphStore((s) => s.connections)
  const activeModuleId = useGraphStore((s) => s.activeModuleId)
  const lastTurnChangedIds = useGraphStore((s) => s.lastTurnChangedIds)
  const setActiveModuleId = useGraphStore((s) => s.setActiveModuleId)

  const activeModule = activeModuleId ? modules.find((m) => m.id === activeModuleId) : null

  if (activeModule) {
    const moduleNodes = nodes.filter((n) => n.module_id === activeModuleId)
    const moduleEdges = edges.filter((e) => e.module_id === activeModuleId)

    return (
      <ModuleDetailView
        moduleName={activeModule.name}
        domainLabel={displayDomain(activeModule.domain)}
        nodes={moduleNodes}
        edges={moduleEdges}
        changedNodeIds={lastTurnChangedIds}
        showFunnelLanes={showFunnelLanes}
        onBack={() => setActiveModuleId(null)}
      />
    )
  }

  return (
    <ModuleMapView
      modules={modules}
      connections={connections}
      onModuleClick={(moduleId) => setActiveModuleId(moduleId)}
    />
  )
}

export default memo(CanvasContainer)
