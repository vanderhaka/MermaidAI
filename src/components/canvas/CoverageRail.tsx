'use client'

import { computeCoverage, coverageProgress, type CoverageStatus } from '@/lib/scope-coverage'
import type { OpenQuestion, Requirement } from '@/types/graph'

type CoverageRailProps = {
  openQuestions: OpenQuestion[]
  requirements: Requirement[]
  onAreaClick?: (areaName: string) => void
}

const STATUS_CLASS: Record<CoverageStatus, string> = {
  untouched: 'border-gray-200 bg-gray-50 text-gray-400',
  open: 'border-amber-300 bg-amber-50 text-amber-900',
  covered: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}

const STATUS_DOT: Record<CoverageStatus, string> = {
  untouched: 'bg-gray-300',
  open: 'bg-amber-500',
  covered: 'bg-emerald-500',
}

const STATUS_DESCRIPTION: Record<CoverageStatus, string> = {
  untouched: 'not explored yet',
  open: 'open questions',
  covered: 'covered',
}

export default function CoverageRail({
  openQuestions,
  requirements,
  onAreaClick,
}: CoverageRailProps) {
  const segments = computeCoverage(openQuestions, requirements)
  const { covered, total } = coverageProgress(segments)

  return (
    <section
      data-testid="coverage-rail"
      aria-label="Scope coverage"
      className="flex w-56 shrink-0 flex-col rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
    >
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Coverage</h2>
        <span className="text-xs text-gray-400" data-testid="coverage-progress">
          {covered}/{total}
        </span>
      </header>

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {segments.map((segment) => (
          <li key={segment.id}>
            <button
              type="button"
              onClick={() => onAreaClick?.(segment.name)}
              title={segment.hint}
              data-testid={`coverage-${segment.id}`}
              data-status={segment.status}
              aria-label={`${segment.name}: ${
                segment.status === 'open'
                  ? `${segment.openCount} open ${segment.openCount === 1 ? 'question' : 'questions'}`
                  : STATUS_DESCRIPTION[segment.status]
              }`}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition hover:brightness-95 ${STATUS_CLASS[segment.status]}`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[segment.status]}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate font-medium">{segment.name}</span>
              {segment.openCount > 0 && (
                <span className="shrink-0 rounded bg-amber-200 px-1 text-[10px] font-semibold text-amber-900">
                  {segment.openCount}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
