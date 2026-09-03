// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  PlanningDecisionsPanel,
  type PlanningDecisionAction,
} from '@/components/dashboard/planning-decisions-panel'
import type { PlanningDecision } from '@/lib/services/planning-decision-service'

const PROPOSED_ID = '11111111-1111-4111-8111-111111111111'
const ACCEPTED_ID = '22222222-2222-4222-8222-222222222222'

function decision(overrides: Partial<PlanningDecision> = {}): PlanningDecision {
  return {
    id: PROPOSED_ID,
    project_id: '33333333-3333-4333-8333-333333333333',
    artifact_version_id: '44444444-4444-4444-8444-444444444444',
    category: 'integration boundary',
    statement: 'The payments provider remains outside the application boundary.',
    state: 'proposed',
    provenance: 'assistant',
    readiness_impact: 'non_blocking',
    supersedes_decision_id: null,
    created_at: '2026-09-02T00:00:00.000Z',
    updated_at: '2026-09-02T00:00:00.000Z',
    events: [],
    latest_event: null,
    ...overrides,
  }
}

describe('PlanningDecisionsPanel', () => {
  it('shows durable states and the finite actions that are legal for each state', () => {
    render(
      <PlanningDecisionsPanel
        decisions={[
          decision(),
          decision({
            id: ACCEPTED_ID,
            statement: 'Staff approve refunds over $500.',
            state: 'accepted',
            provenance: 'user',
          }),
          decision({
            id: '55555555-5555-4555-8555-555555555555',
            statement: 'The earlier provider assumption.',
            state: 'superseded',
          }),
        ]}
        onAction={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'Decisions made during planning' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/routine product basics are included automatically/i),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Chosen by assistant')).toHaveLength(2)
    expect(screen.getByText('Chosen by you')).toBeInTheDocument()
    expect(screen.getAllByText('Proposed')).toHaveLength(1)
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(screen.getByText('Superseded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept.*payments provider/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject.*payments provider/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit.*payments provider/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /supersede.*staff approve/i })).toBeInTheDocument()
  })

  it('requires a review reason and only claims a commit after receiving a receipt', async () => {
    const user = userEvent.setup()
    let resolveAction: ((value: Awaited<ReturnType<typeof onAction>>) => void) | undefined
    const onAction = vi.fn(
      (_action: PlanningDecisionAction) =>
        new Promise<
          | {
              success: true
              receipt: { changeSetId: string; committedRevision: number; replayed: boolean }
            }
          | { success: false; error: string; conflict?: boolean }
        >((resolve) => {
          resolveAction = resolve
        }),
    )

    render(<PlanningDecisionsPanel decisions={[decision()]} onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: /accept.*payments provider/i }))
    const confirm = screen.getByRole('button', { name: 'Confirm accept' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText('Reason for accepting'), 'Matches the signed scope.')
    await user.click(confirm)

    expect(onAction).toHaveBeenCalledWith({
      type: 'accept',
      decisionId: PROPOSED_ID,
      reason: 'Matches the signed scope.',
    })
    expect(screen.queryByText(/committed at revision/i)).toBeNull()

    resolveAction?.({
      success: true,
      receipt: {
        changeSetId: '66666666-6666-4666-8666-666666666666',
        committedRevision: 12,
        replayed: false,
      },
    })

    expect(await screen.findByText('Decision committed at revision 12.')).toBeInTheDocument()
  })

  it('keeps a failed action retryable without claiming it was saved', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn().mockResolvedValue({
      success: false,
      error: 'Architecture changed in another tab.',
      conflict: true,
    })
    render(<PlanningDecisionsPanel decisions={[decision()]} onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: /reject.*payments provider/i }))
    await user.type(screen.getByLabelText('Reason for rejecting'), 'Conflicts with the contract.')
    await user.click(screen.getByRole('button', { name: 'Confirm reject' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Architecture changed in another tab.',
    )
    expect(screen.getByRole('button', { name: 'Try reject again' })).toBeInTheDocument()
    expect(screen.queryByText(/committed at revision/i)).toBeNull()
  })

  it('edits a proposal by submitting a replacement statement and keeps the original visible', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn().mockResolvedValue({
      success: true,
      receipt: {
        changeSetId: '77777777-7777-4777-8777-777777777777',
        committedRevision: 13,
        replayed: false,
      },
    })
    render(<PlanningDecisionsPanel decisions={[decision()]} onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: /edit.*payments provider/i }))
    const statement = screen.getByLabelText('Replacement decision')
    await user.clear(statement)
    await user.type(statement, 'The payments provider is owned by the platform team.')
    await user.type(screen.getByLabelText('Reason for editing'), 'Clarifies operational ownership.')
    await user.click(screen.getByRole('button', { name: 'Confirm edit' }))

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith({
        type: 'edit',
        decisionId: PROPOSED_ID,
        statement: 'The payments provider is owned by the platform team.',
        reason: 'Clarifies operational ownership.',
      })
    })
    expect(
      screen.getByText('The payments provider remains outside the application boundary.'),
    ).toBeInTheDocument()
  })
})
