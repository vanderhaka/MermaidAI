import Link from 'next/link'

import type {
  PlanningStageAvailability,
  PlanningStageSlug,
  PlanningStageState,
} from '@/types/planning-ui'

type PlanningStageNavProps = {
  projectId: string
  activeStage: PlanningStageSlug
  availability: PlanningStageAvailability
}

type StageItem = {
  slug: PlanningStageSlug
  label: string
  shortLabel: string
  description: string
  state: PlanningStageState
  version: number | null
}

const STATE_LABELS: Record<PlanningStageState, string> = {
  locked: 'Not ready',
  ready: 'Ready to create',
  current: 'Current',
  stale: 'Needs refresh',
}

function stageHref(projectId: string, slug: PlanningStageSlug): string {
  return slug === 'architecture'
    ? `/dashboard/${projectId}`
    : `/dashboard/${projectId}?stage=${slug}`
}

function StageContent({
  index,
  item,
  isActive,
}: {
  index: number
  item: StageItem
  isActive: boolean
}) {
  return (
    <>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          isActive
            ? 'bg-slate-950 text-white'
            : item.state === 'locked'
              ? 'bg-slate-100 text-slate-400'
              : item.state === 'stale'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
        }`}
      >
        {index}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-950 sm:hidden">
          {item.shortLabel}
        </span>
        <span className="hidden truncate text-sm font-semibold text-slate-950 sm:block">
          {item.label}
        </span>
        <span className="mt-0.5 hidden text-xs text-slate-500 md:block">
          {item.version ? `v${item.version} · ` : ''}
          {STATE_LABELS[item.state]}
        </span>
      </span>
    </>
  )
}

export function PlanningStageNav({ projectId, activeStage, availability }: PlanningStageNavProps) {
  const items: StageItem[] = [
    {
      slug: 'architecture',
      label: 'Architecture',
      shortLabel: 'Architecture',
      description: 'High-level shape',
      state: 'current',
      version: null,
    },
    {
      slug: 'work-plan',
      label: 'Work Plan',
      shortLabel: 'Plan',
      description: 'Detailed build slices',
      state: availability.workPlan.state,
      version: availability.workPlan.version,
    },
    {
      slug: 'handoff',
      label: 'Execution Handoff',
      shortLabel: 'Handoff',
      description: 'Review and export',
      state: availability.handoff.state,
      version: availability.handoff.version,
    },
  ]

  return (
    <nav aria-label="Planning stages" data-testid="planning-stage-nav">
      <ol className="grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {items.map((item, itemIndex) => {
          const isActive = activeStage === item.slug
          const classes = `relative flex min-w-0 items-center gap-2 px-3 py-3 text-left transition-colors sm:px-4 ${
            itemIndex > 0 ? 'border-l border-slate-200' : ''
          } ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50'} ${
            item.state === 'locked' ? 'cursor-not-allowed opacity-60' : ''
          }`

          return (
            <li key={item.slug} className="min-w-0">
              {item.state === 'locked' ? (
                <span
                  className={classes}
                  aria-disabled="true"
                  title={`${item.label}: ${item.description}. Complete the previous stage first.`}
                >
                  <StageContent index={itemIndex + 1} item={item} isActive={isActive} />
                </span>
              ) : (
                <Link
                  href={stageHref(projectId, item.slug)}
                  className={classes}
                  aria-current={isActive ? 'step' : undefined}
                  title={`${item.label}: ${item.description}`}
                  prefetch
                >
                  <StageContent index={itemIndex + 1} item={item} isActive={isActive} />
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
