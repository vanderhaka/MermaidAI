import { notFound } from 'next/navigation'
import Markdown from 'react-markdown'

import { getProjectById } from '@/lib/services/project-service'
import { listModulesByProject } from '@/lib/services/module-service'
import { getGraphForModule } from '@/lib/services/graph-service'
import { listConnectionsByProject } from '@/lib/services/module-connection-service'
import { listOpenQuestions } from '@/lib/services/open-question-service'
import { listRequirements } from '@/lib/services/requirement-service'
import { generateSinglePrd } from '@/lib/services/prd-export-service'
import { computeCoverage, coverageProgress } from '@/lib/scope-coverage'
import type { FlowEdge, FlowNode } from '@/types/graph'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const STATUS_STYLE: Record<string, string> = {
  untouched: 'bg-gray-100 text-gray-500',
  open: 'bg-amber-100 text-amber-900',
  covered: 'bg-emerald-100 text-emerald-900',
}

/**
 * Read-only view of a project, sized for a phone. The editing surface stays behind
 * MobileGate in the (dashboard) group; this route is deliberately outside it so the
 * spec can be read on the device that's in the room.
 */
export default async function SharePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!UUID_PATTERN.test(projectId)) notFound()

  const projectResult = await getProjectById(projectId)
  if (!projectResult.success) notFound()

  const modulesResult = await listModulesByProject(projectId)
  const modules = modulesResult.success ? modulesResult.data : []

  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []
  for (const mod of modules) {
    const graph = await getGraphForModule(mod.id)
    if (!graph.success) continue
    nodes.push(...graph.data.nodes)
    edges.push(...graph.data.edges)
  }

  const connectionsResult = await listConnectionsByProject(projectId)
  const oqResult = await listOpenQuestions(projectId)
  const reqResult = await listRequirements(projectId)

  const openQuestions = oqResult.success ? oqResult.data : []
  const requirements = reqResult.success ? reqResult.data : []

  const markdown = generateSinglePrd({
    projectName: projectResult.data.name,
    projectDescription: projectResult.data.description,
    modules,
    nodes,
    edges,
    connections: connectionsResult.success ? connectionsResult.data : [],
    openQuestions,
  })

  const segments = computeCoverage(openQuestions, requirements)
  const { covered, total } = coverageProgress(segments)
  const agreed = requirements.filter((r) => r.status === 'agreed')
  const outOfScope = requirements.filter((r) => r.status === 'out_of_scope')

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-white px-4 py-8 sm:px-6">
      <header className="border-b border-gray-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Read-only spec
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
          {projectResult.data.name}
        </h1>
        {projectResult.data.description && (
          <p className="mt-1 text-sm text-gray-500">{projectResult.data.description}</p>
        )}
      </header>

      <section className="mt-6" aria-label="Scope coverage">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Coverage</h2>
          <span className="text-xs text-gray-400">
            {covered} of {total} areas settled
          </span>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {segments.map((segment) => (
            <li key={segment.id}>
              <span
                data-testid={`share-coverage-${segment.id}`}
                data-status={segment.status}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[segment.status]}`}
              >
                {segment.name}
                {segment.openCount > 0 && <span>({segment.openCount})</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {agreed.length > 0 && (
        <section className="mt-8" aria-label="Agreed requirements">
          <h2 className="text-sm font-semibold text-gray-900">Agreed requirements</h2>
          <ul className="mt-2 space-y-1.5">
            {agreed.map((requirement) => (
              <li key={requirement.id} className="flex gap-2 text-sm text-gray-700">
                <span aria-hidden="true" className="text-emerald-500">
                  ✓
                </span>
                <span>{requirement.statement}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outOfScope.length > 0 && (
        <section className="mt-8" aria-label="Explicitly out of scope">
          <h2 className="text-sm font-semibold text-gray-900">Explicitly out of scope</h2>
          <ul className="mt-2 space-y-1.5">
            {outOfScope.map((requirement) => (
              <li key={requirement.id} className="flex gap-2 text-sm text-gray-400">
                <span aria-hidden="true">✕</span>
                <span className="line-through">{requirement.statement}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8" aria-label="Specification">
        <article className="prose prose-sm prose-gray max-w-none">
          <Markdown>{markdown}</Markdown>
        </article>
      </section>
    </main>
  )
}
