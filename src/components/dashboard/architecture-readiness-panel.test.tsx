// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ArchitectureReadinessPanel } from '@/components/dashboard/architecture-readiness-panel'
import type { ArchitectureReadinessReport } from '@/lib/services/architecture-readiness'

function report(overrides: Partial<ArchitectureReadinessReport> = {}): ArchitectureReadinessReport {
  return {
    schemaVersion: 2,
    projectId: '11111111-1111-4111-8111-111111111111',
    architectureVersionId: '22222222-2222-4222-8222-222222222222',
    architectureVersion: 3,
    architectureContentHash: 'architecture-hash',
    evaluatedRevision: 8,
    state: 'needs_input',
    freshness: 'current',
    handoffEligible: false,
    checks: [
      {
        key: 'outcome',
        status: 'pass',
        explanation: 'The intended outcome is clear.',
        affectedIds: [],
      },
      {
        key: 'capability_map',
        status: 'pass',
        explanation: 'Core capabilities are mapped.',
        affectedIds: [],
      },
      {
        key: 'connections',
        status: 'warning',
        explanation: 'Connect Payments to Notifications.',
        affectedIds: ['payments', 'notifications'],
      },
      {
        key: 'actor_flows',
        status: 'fail',
        explanation: 'Add the staff cancellation flow.',
        affectedIds: ['staff-flow'],
      },
      {
        key: 'business_boundaries',
        status: 'pass',
        explanation: 'Business boundaries are explicit.',
        affectedIds: [],
      },
      {
        key: 'narrative_consistency',
        status: 'pass',
        explanation: 'The Architecture narrative is internally consistent.',
        affectedIds: [],
      },
      {
        key: 'coverage_decisions',
        status: 'warning',
        explanation: 'One assumption needs review.',
        affectedIds: ['decision-1'],
      },
      {
        key: 'blockers',
        status: 'fail',
        explanation: 'Choose the deposit refund policy.',
        affectedIds: ['question-1'],
      },
    ],
    reasons: ['Add the staff cancellation flow.', 'Choose the deposit refund policy.'],
    blockingQuestionIds: ['question-1'],
    nonBlockingQuestionIds: [],
    deferredQuestionIds: [],
    proposedDecisionIds: ['decision-1'],
    acceptedDecisionIds: [],
    supersededDecisionIds: [],
    invalidInputIds: [],
    staleInputIds: [],
    ...overrides,
  }
}

describe('ArchitectureReadinessPanel', () => {
  it('keeps a compact status visible and discloses exact readiness gaps', async () => {
    const user = userEvent.setup()
    render(<ArchitectureReadinessPanel report={report()} />)

    const toggle = screen.getByRole('button', { name: /architecture needs input/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: /architecture readiness details/i })).toBeNull()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const details = screen.getByRole('region', { name: /architecture readiness details/i })
    expect(details).toHaveTextContent('Add the staff cancellation flow.')
    expect(details).toHaveTextContent('Choose the deposit refund policy.')
    expect(details).toHaveTextContent('1 blocking question')
    expect(details).toHaveTextContent('1 assistant choice to review')
  })

  it.each([
    ['draft', 'Architecture draft'],
    ['needs_input', 'Architecture needs input'],
    ['ready_with_assumptions', 'Architecture ready with assumptions'],
    ['ready', 'Architecture ready for Work Plan'],
  ] as const)('labels the %s state without relying on colour', (state, label) => {
    render(<ArchitectureReadinessPanel report={report({ state })} />)

    expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument()
  })

  it('marks a stale report as needing refresh and includes decision details once opened', async () => {
    const user = userEvent.setup()
    render(
      <ArchitectureReadinessPanel
        report={report({
          freshness: 'stale',
          proposedDecisionIds: ['decision-1', 'decision-2'],
        })}
      >
        <div>Decision review content</div>
      </ArchitectureReadinessPanel>,
    )

    const toggle = screen.getByRole('button', { name: /readiness needs refresh/i })
    await user.click(toggle)

    const details = screen.getByRole('region', { name: /architecture readiness details/i })
    expect(details).toHaveTextContent('2 assistant choices to review')
    expect(details).toHaveTextContent('Decision review content')
  })

  it('explains why an unevaluated draft is not ready', async () => {
    const user = userEvent.setup()
    render(<ArchitectureReadinessPanel report={null} />)

    await user.click(screen.getByRole('button', { name: /architecture draft/i }))

    expect(
      screen.getByRole('region', { name: /architecture readiness details/i }),
    ).toHaveTextContent('Generate the first Architecture map')
  })
})
