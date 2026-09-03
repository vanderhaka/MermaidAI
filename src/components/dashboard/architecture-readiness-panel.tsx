'use client'

import { useId, useState, type ReactNode } from 'react'

import type {
  ArchitectureReadinessCheckKey,
  ArchitectureReadinessCheckStatus,
  ArchitectureReadinessReport,
} from '@/lib/services/architecture-readiness'

type ArchitectureReadinessPanelProps = {
  report: ArchitectureReadinessReport | null
  defaultOpen?: boolean
  children?: ReactNode
}

const STATE_PRESENTATION = {
  draft: {
    label: 'Architecture draft',
    dot: 'bg-slate-400',
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  needs_input: {
    label: 'Architecture needs input',
    dot: 'bg-amber-500',
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  ready_with_assumptions: {
    label: 'Architecture ready with assumptions',
    dot: 'bg-blue-500',
    badge: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  ready: {
    label: 'Architecture ready for Work Plan',
    dot: 'bg-emerald-500',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
} as const

const CHECK_LABELS: Record<ArchitectureReadinessCheckKey, string> = {
  outcome: 'Outcome',
  capability_map: 'Capabilities',
  connections: 'Connections',
  actor_flows: 'Actor flows',
  business_boundaries: 'Boundaries',
  narrative_consistency: 'Consistency',
  coverage_decisions: 'Decisions',
  blockers: 'Blockers',
}

const CHECK_TONES: Record<ArchitectureReadinessCheckStatus, string> = {
  pass: 'bg-emerald-500',
  warning: 'bg-amber-500',
  fail: 'bg-red-500',
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function ArchitectureReadinessPanel({
  report,
  defaultOpen = false,
  children,
}: ArchitectureReadinessPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const detailsId = useId()
  const status = STATE_PRESENTATION[report?.state ?? 'draft']
  const isStale = report?.freshness === 'stale'
  const statusLabel = isStale ? 'Architecture readiness needs refresh' : status.label
  const reasons = [...new Set(report?.reasons ?? [])]

  return (
    <div className="relative" data-testid="architecture-readiness">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={detailsId}
        aria-label={`${statusLabel}. Show readiness details`}
        onClick={() => setIsOpen((open) => !open)}
        className={`inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${status.badge}`}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${isStale ? 'bg-amber-500' : status.dot}`}
        />
        <span aria-live="polite" aria-atomic="true" className="truncate">
          {statusLabel}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <section
          id={detailsId}
          role="region"
          aria-label="Architecture readiness details"
          className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-950">Readiness</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {report
                  ? `Architecture v${report.architectureVersion}`
                  : 'No evaluated version yet'}
              </p>
            </div>
            {report && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{countLabel(report.blockingQuestionIds.length, 'blocking question')}</span>
                <span>
                  {countLabel(
                    report.proposedDecisionIds.length,
                    'assistant choice to review',
                    'assistant choices to review',
                  )}
                </span>
              </div>
            )}
          </div>

          {!report ? (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              Generate the first Architecture map to evaluate outcomes, capabilities, connections,
              actor flows, boundaries, decisions, and blockers.
            </p>
          ) : (
            <>
              {isStale && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  This report is for an older Architecture version or planning revision. Refresh it
                  before using readiness for a handoff.
                </p>
              )}

              <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {report.checks.map((check) => (
                  <li key={check.key} className="min-w-0 rounded-lg bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${CHECK_TONES[check.status]}`}
                      />
                      <span className="text-xs font-semibold text-slate-800">
                        {CHECK_LABELS[check.key]}
                      </span>
                      <span className="sr-only">{check.status}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {check.explanation}
                    </p>
                  </li>
                ))}
              </ul>

              {reasons.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <h3 className="text-xs font-semibold text-slate-800">What needs attention</h3>
                  <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600">
                    {reasons.map((reason) => (
                      <li key={reason} className="flex gap-2">
                        <span aria-hidden="true" className="text-slate-400">
                          •
                        </span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {children}
            </>
          )}
        </section>
      )}
    </div>
  )
}
