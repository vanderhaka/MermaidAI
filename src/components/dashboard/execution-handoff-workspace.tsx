'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'

import { PlanningWorkspaceHeader } from '@/components/dashboard/planning-workspace-header'
import { usePlanningHandoff } from '@/hooks/usePlanningHandoff'
import type { Project } from '@/types/graph'
import type { ExecutionHandoffPlanningView, PlanningStageAvailability } from '@/types/planning-ui'

type ExecutionHandoffWorkspaceProps = {
  project: Pick<Project, 'id' | 'name'>
  planning: ExecutionHandoffPlanningView
  availability: PlanningStageAvailability
  startImmediately?: boolean
}

export function ExecutionHandoffWorkspace({
  project,
  planning,
  availability,
  startImmediately = false,
}: ExecutionHandoffWorkspaceProps) {
  const router = useRouter()
  const [copyLabel, setCopyLabel] = useState('Copy Markdown')
  const handleComplete = useCallback(() => {
    router.replace(`/dashboard/${project.id}?stage=handoff`)
    router.refresh()
  }, [project.id, router])
  const generation = usePlanningHandoff({
    projectId: project.id,
    sourceVersionId: planning.sourceWorkPlanVersion?.id ?? null,
    targetKind: 'execution_handoff',
    startImmediately: startImmediately && planning.canGenerate,
    onComplete: handleComplete,
  })
  const markdown = planning.version?.renderedMarkdown ?? ''

  async function copyMarkdown() {
    if (!markdown) return
    let copied = false
    let clipboardTimeout: number | undefined
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
      await Promise.race([
        navigator.clipboard.writeText(markdown),
        new Promise<never>((_, reject) => {
          clipboardTimeout = window.setTimeout(
            () => reject(new Error('Clipboard request timed out')),
            750,
          )
        }),
      ])
      copied = true
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = markdown
      textarea.readOnly = true
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      try {
        document.body.appendChild(textarea)
        textarea.select()
        copied = document.execCommand('copy')
      } catch {
        copied = false
      } finally {
        textarea.remove()
      }
    } finally {
      if (clipboardTimeout !== undefined) window.clearTimeout(clipboardTimeout)
    }
    setCopyLabel(copied ? 'Copied' : 'Copy failed')
    window.setTimeout(() => setCopyLabel('Copy Markdown'), 1_500)
  }

  function downloadMarkdown() {
    if (!markdown) return
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${
      project.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'project'
    }-execution-handoff.md`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main
      className="min-h-screen bg-slate-50 px-4 py-4 sm:px-6"
      data-testid="execution-handoff-workspace"
    >
      <div className="mx-auto max-w-6xl space-y-4">
        <PlanningWorkspaceHeader
          project={project}
          activeStage="handoff"
          availability={availability}
          eyebrow="Stage 3 of 3"
          title="Execution Handoff"
          description="A deterministic packet for review, copy, or download. This stage never starts implementation."
          actions={
            planning.version ? (
              <>
                <button
                  type="button"
                  onClick={() => void copyMarkdown()}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <span aria-live="polite">{copyLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={downloadMarkdown}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Download .md
                </button>
              </>
            ) : null
          }
        />

        {planning.version && planning.isStale && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Work Plan changed after this packet was created. Handoff v{planning.version.version} is
            preserved, but it is no longer current.
          </div>
        )}

        {!planning.version ? (
          <section className="grid min-h-[420px] place-items-center rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="max-w-lg">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
                  <path d="M7 3h7l4 4v14H7z" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M14 3v5h4M10 12h5M10 16h5" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              </div>
              <h2 className="mt-5 text-xl font-semibold text-slate-950">
                {planning.canGenerate
                  ? 'Package the plan for a clean handoff'
                  : 'Handoff is locked'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {planning.canGenerate
                  ? 'The packet is rendered from the current Work Plan with exact source labels, checks, risks, rollback notes, and a clear no-execution boundary.'
                  : 'Create a current Work Plan and resolve its blockers before packaging it.'}
              </p>

              {generation.isRunning ? (
                <div
                  className="mx-auto mt-6 max-w-sm rounded-xl border border-violet-100 bg-violet-50 px-4 py-3"
                  role="status"
                >
                  <p className="text-sm font-semibold text-violet-950">Rendering the packet</p>
                  <p className="mt-1 text-xs text-violet-700">Binding versions and checks…</p>
                </div>
              ) : (
                planning.canGenerate && (
                  <button
                    type="button"
                    onClick={() => void generation.run()}
                    className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Create Handoff
                  </button>
                )
              )}

              {generation.error && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-800"
                >
                  {generation.error}
                </p>
              )}
            </div>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="prose prose-slate max-w-none prose-headings:scroll-mt-6 prose-pre:overflow-x-auto">
                <ReactMarkdown>{markdown}</ReactMarkdown>
              </div>
            </article>
            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Exact sources
              </p>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Architecture</dt>
                  <dd className="font-semibold text-slate-950">
                    v{planning.version.content.source_architecture_version.version}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Work Plan</dt>
                  <dd className="font-semibold text-slate-950">
                    v{planning.version.content.source_work_plan_version.version}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Handoff</dt>
                  <dd className="font-semibold text-slate-950">v{planning.version.version}</dd>
                </div>
              </dl>
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
                Review and export only. No task, branch, command, migration, deployment, or provider
                action can start here.
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
