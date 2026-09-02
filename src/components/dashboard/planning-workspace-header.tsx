import Link from 'next/link'

import { InlineProjectName } from '@/components/dashboard/InlineProjectName'
import { PlanningStageNav } from '@/components/dashboard/planning-stage-nav'
import type { Project } from '@/types/graph'
import type { PlanningStageAvailability, PlanningStageSlug } from '@/types/planning-ui'

type PlanningWorkspaceHeaderProps = {
  project: Pick<Project, 'id' | 'name'>
  activeStage: PlanningStageSlug
  availability: PlanningStageAvailability
  eyebrow: string
  title: string
  description: string
  actions?: React.ReactNode
}

export function PlanningWorkspaceHeader({
  project,
  activeStage,
  availability,
  eyebrow,
  title,
  description,
  actions,
}: PlanningWorkspaceHeaderProps) {
  return (
    <header className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Link href="/dashboard" className="font-medium text-slate-700 hover:text-slate-950">
              Back to dashboard
            </Link>
            <span aria-hidden="true">/</span>
            <InlineProjectName
              projectId={project.id}
              initialName={project.name}
              className="font-medium text-slate-700"
            />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>

      <PlanningStageNav
        projectId={project.id}
        activeStage={activeStage}
        availability={availability}
      />
    </header>
  )
}
