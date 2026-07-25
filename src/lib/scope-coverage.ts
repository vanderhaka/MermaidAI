import type { OpenQuestion, Requirement } from '@/types/graph'

/**
 * The completeness model for a scoping engagement. Single source of truth: the scope prompt
 * interpolates this list, and the coverage rail renders it. Previously the list lived only
 * inside the system prompt, so the model reasoned over it and the user never saw it.
 */
export const SCOPE_COVERAGE_AREAS = [
  {
    id: 'actors',
    name: 'Actors & roles',
    hint: 'every user/system type and what each can do',
  },
  {
    id: 'onboarding',
    name: 'Onboarding & verification',
    hint: 'signup, identity checks, approvals',
  },
  {
    id: 'discovery',
    name: 'Discovery',
    hint: 'how users find things (search, browse, map, filters)',
  },
  {
    id: 'core_transaction',
    name: 'Core transaction',
    hint: 'the main exchange step by step; instant vs request-and-approve; confirmations',
  },
  {
    id: 'money',
    name: 'Money',
    hint: 'pricing model, platform fees, WHEN payment is captured, refunds, payouts, invoices/tax',
  },
  {
    id: 'scheduling',
    name: 'Scheduling & availability',
    hint: 'calendars, recurring windows, conflicts, double-booking',
  },
  {
    id: 'failure_modes',
    name: 'Failure modes',
    hint: 'no-shows, cancellations from EACH side, enforcement, overstays, disputes',
  },
  {
    id: 'post_transaction',
    name: 'Post-transaction',
    hint: 'reviews/ratings, repeat usage, subscriptions',
  },
  {
    id: 'communications',
    name: 'Communications',
    hint: 'notifications, reminders, messaging between parties',
  },
  {
    id: 'operations',
    name: 'Operations',
    hint: 'admin tooling, moderation, support',
  },
  {
    id: 'compliance',
    name: 'Liability & compliance',
    hint: 'insurance, damage, legal, taxes',
  },
] as const

export type ScopeCoverageArea = (typeof SCOPE_COVERAGE_AREAS)[number]
export type ScopeCoverageAreaName = ScopeCoverageArea['name']

export type CoverageStatus = 'untouched' | 'open' | 'covered'

export type CoverageSegment = {
  id: string
  name: string
  hint: string
  status: CoverageStatus
  openCount: number
  requirementCount: number
}

/** Render the area list for the system prompt, so prompt and UI cannot drift apart. */
export function renderCoverageAreasForPrompt(): string {
  return SCOPE_COVERAGE_AREAS.map(
    (area, index) => `${index + 1}. **${area.name}** — ${area.hint}`,
  ).join('\n')
}

/**
 * `coverage_area` is the explicit column; `section` is the model-authored free-text fallback
 * for rows written before the column existed.
 */
function areaKeyOf(record: { coverage_area: string | null; section?: string }): string {
  return (record.coverage_area ?? record.section ?? '').trim().toLowerCase()
}

export function computeCoverage(
  openQuestions: OpenQuestion[],
  requirements: Requirement[],
): CoverageSegment[] {
  return SCOPE_COVERAGE_AREAS.map((area) => {
    const key = area.name.toLowerCase()

    const openCount = openQuestions.filter(
      (q) => q.status === 'open' && areaKeyOf(q) === key,
    ).length
    const resolvedCount = openQuestions.filter(
      (q) => q.status === 'resolved' && areaKeyOf(q) === key,
    ).length
    const requirementCount = requirements.filter((r) => areaKeyOf(r) === key).length

    let status: CoverageStatus = 'untouched'
    if (openCount > 0) {
      status = 'open'
    } else if (requirementCount > 0 || resolvedCount > 0) {
      status = 'covered'
    }

    return {
      id: area.id,
      name: area.name,
      hint: area.hint,
      status,
      openCount,
      requirementCount,
    }
  })
}

/** Fraction of areas that are settled — the "how much is left" number. */
export function coverageProgress(segments: CoverageSegment[]): {
  covered: number
  total: number
} {
  return {
    covered: segments.filter((s) => s.status === 'covered').length,
    total: segments.length,
  }
}
