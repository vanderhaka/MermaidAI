// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { WorkPlanChangeReceipt } from '@/components/planning/change-receipt'
import type { ChatMessage } from '@/types/chat'

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'Clarified duplicate handling.',
    operations: [],
    createdAt: '2026-09-02T00:00:00.000Z',
    planningStage: 'work_plan',
    changeSetId: 'change-set-1',
    metadata: {
      work_plan_receipt: {
        kind: 'work_plan_revision',
        previousVersion: 3,
        committedVersion: 4,
        summary: 'Added idempotency acceptance and verification.',
        commands: [{ type: 'update_slice' }],
      },
    },
    ...overrides,
  }
}

describe('WorkPlanChangeReceipt', () => {
  it('shows the immutable version receipt and inspectable edit list', () => {
    render(<WorkPlanChangeReceipt message={message()} />)

    const receipt = screen.getByTestId('work-plan-change-receipt')
    expect(receipt).toHaveTextContent('Work Plan v4')
    expect(receipt).toHaveTextContent('1 edit committed')
    expect(screen.getByText('Review changes')).toBeInTheDocument()
    expect(receipt).toHaveTextContent('Update slice')
    expect(receipt).toHaveTextContent('The earlier version is preserved')
  })

  it('ignores unrelated or malformed assistant metadata', () => {
    const { container } = render(
      <WorkPlanChangeReceipt message={message({ metadata: { work_plan_receipt: {} } })} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('undoes the latest plan change from its inspectable receipt', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn().mockResolvedValue({ success: true })
    render(<WorkPlanChangeReceipt message={message()} canUndo onUndo={onUndo} />)

    await user.click(screen.getByText('Review changes'))
    await user.click(screen.getByRole('button', { name: 'Undo this change' }))

    expect(onUndo).toHaveBeenCalledOnce()
    expect(onUndo).toHaveBeenCalledWith('change-set-1')
  })

  it('keeps older receipts review-only and explains why', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    render(<WorkPlanChangeReceipt message={message()} onUndo={onUndo} />)

    await user.click(screen.getByText('Review changes'))

    expect(screen.getByRole('button', { name: 'Undo this change' })).toBeDisabled()
    expect(screen.getByText(/newer plan version is active/i)).toBeInTheDocument()
  })

  it('leaves newer work unchanged and offers the same undo again after a conflict', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn().mockResolvedValue({ success: false, error: 'Plan tip changed' })
    render(<WorkPlanChangeReceipt message={message()} canUndo onUndo={onUndo} />)

    await user.click(screen.getByText('Review changes'))
    await user.click(screen.getByRole('button', { name: 'Undo this change' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Plan tip changed. Your newer work was left unchanged.',
    )
    expect(screen.getByRole('button', { name: 'Try Undo again' })).toBeEnabled()
  })
})
