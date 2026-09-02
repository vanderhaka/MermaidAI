// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PlanningStageNav } from '@/components/dashboard/planning-stage-nav'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}))

const availability = {
  architecture: { state: 'current' as const },
  workPlan: { state: 'ready' as const, version: null },
  handoff: { state: 'locked' as const, version: null },
}

describe('PlanningStageNav', () => {
  it('links only stages whose prerequisites are available', () => {
    render(
      <PlanningStageNav
        projectId="project-1"
        activeStage="architecture"
        availability={availability}
      />,
    )

    expect(screen.getByRole('link', { name: /Architecture/i })).toHaveAttribute(
      'href',
      '/dashboard/project-1',
    )
    expect(screen.getByRole('link', { name: /Work Plan/i })).toHaveAttribute(
      'href',
      '/dashboard/project-1?stage=work-plan',
    )
    expect(screen.queryByRole('link', { name: /Execution Handoff/i })).not.toBeInTheDocument()
    expect(screen.getByTitle(/Execution Handoff/)).toHaveAttribute('aria-disabled', 'true')
  })

  it('keeps a stale generated stage available for review', () => {
    render(
      <PlanningStageNav
        projectId="project-1"
        activeStage="work-plan"
        availability={{
          ...availability,
          workPlan: { state: 'stale', version: 3 },
          handoff: { state: 'current', version: 1 },
        }}
      />,
    )

    expect(screen.getByRole('link', { name: /v3.*Needs refresh/i })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('link', { name: /v1.*Current/i })).toBeInTheDocument()
  })
})
