'use client'

import { displayDomain } from '@/lib/module-hierarchy'
import { useGraphStore } from '@/store/graph-store'
import ModuleMapView from '@/components/canvas/views/ModuleMapView'
import ModuleDetailView from '@/components/canvas/views/ModuleDetailView'
import RequirementsView from '@/components/canvas/views/RequirementsView'

type CanvasContainerProps = {
  showFunnelLanes?: boolean
}

export default function CanvasContainer({ showFunnelLanes = false }: CanvasContainerProps) {
  const modules = useGraphStore((s) => s.modules)
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const connections = useGraphStore((s) => s.connections)
  const activeModuleId = useGraphStore((s) => s.activeModuleId)
  const setActiveModuleId = useGraphStore((s) => s.setActiveModuleId)

  const requirements = useGraphStore((s) => s.requirements)
  const requirementLinks = useGraphStore((s) => s.requirementLinks)
  const requirementNodes = useGraphStore((s) => s.requirementNodes)
  const openQuestions = useGraphStore((s) => s.openQuestions)
  const canvasView = useGraphStore((s) => s.canvasView)
  const setCanvasView = useGraphStore((s) => s.setCanvasView)
  const setHighlightedNodeIds = useGraphStore((s) => s.setHighlightedNodeIds)

  const activeModule = activeModuleId ? modules.find((m) => m.id === activeModuleId) : null

  const toggle = (
    <div
      className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      role="group"
      aria-label="Canvas view"
    >
      {(['flow', 'requirements'] as const).map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => setCanvasView(view)}
          aria-pressed={canvasView === view}
          className={`px-3 py-1.5 text-xs font-medium capitalize transition ${
            canvasView === view
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {view}
          {view === 'requirements' && requirements.length > 0 && (
            <span className="ml-1.5 text-[10px] opacity-70">{requirements.length}</span>
          )}
        </button>
      ))}
    </div>
  )

  return (
    <div className="relative h-full min-h-0">
      {toggle}

      {canvasView === 'requirements' ? (
        <RequirementsView
          requirements={requirements}
          links={requirementLinks}
          requirementNodes={requirementNodes}
          modules={modules}
          openQuestions={openQuestions}
          onRequirementSelect={(_requirementId, governedNodeIds) => {
            // Selecting a requirement highlights the flow nodes it governs, then jumps
            // to the flow so the two views read as one product.
            setHighlightedNodeIds(governedNodeIds)
            if (governedNodeIds.length > 0) setCanvasView('flow')
          }}
        />
      ) : activeModule ? (
        <ModuleDetailView
          moduleName={activeModule.name}
          domainLabel={displayDomain(activeModule.domain)}
          nodes={nodes.filter((n) => n.module_id === activeModuleId)}
          edges={edges.filter((e) => e.module_id === activeModuleId)}
          showFunnelLanes={showFunnelLanes}
          onBack={() => setActiveModuleId(null)}
        />
      ) : (
        <ModuleMapView
          modules={modules}
          connections={connections}
          onModuleClick={(moduleId) => setActiveModuleId(moduleId)}
        />
      )}
    </div>
  )
}
