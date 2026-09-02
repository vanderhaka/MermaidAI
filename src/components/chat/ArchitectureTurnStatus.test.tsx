// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  ArchitectureActivity,
  ArchitectureChangeReceipt,
} from '@/components/chat/ArchitectureTurnStatus'
import type { ChatMessage } from '@/types/chat'

function architectureMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'I mapped the first Architecture.',
    operations: [],
    createdAt: '2026-09-02T00:00:00Z',
    changeSetId: '11111111-1111-4111-8111-111111111111',
    metadata: {
      change_summary: {
        capabilitiesCreated: 6,
        connectionsCreated: 5,
        assumptionsRecorded: 2,
        questionsRecorded: 1,
        provisional: true,
      },
    },
    ...overrides,
  }
}

describe('ArchitectureTurnStatus', () => {
  it('acknowledges the current Architecture activity without claiming completion', () => {
    render(<ArchitectureActivity activity="Reading your brief and finding actors" />)

    const activity = screen.getByLabelText('Architecture progress')
    expect(activity).toHaveTextContent('Building a provisional map')
    expect(activity).toHaveTextContent('Reading your brief and finding actors…')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(/saved|complete/i)).not.toBeInTheDocument()
  })

  it('renders the provisional badge and compact counts for a committed message', () => {
    render(<ArchitectureChangeReceipt message={architectureMessage()} />)

    const receipt = screen.getByTestId('architecture-change-receipt')
    expect(receipt).toHaveTextContent('Provisional')
    expect(receipt).toHaveTextContent(
      'Created 6 capabilities · Connected 5 handoffs · Recorded 2 assumptions and 1 question',
    )
  })

  it('omits zero-count receipt clauses', () => {
    render(
      <ArchitectureChangeReceipt
        message={architectureMessage({
          metadata: {
            change_summary: {
              capabilitiesCreated: 6,
              connectionsCreated: 5,
              assumptionsRecorded: 2,
              questionsRecorded: 0,
              provisional: true,
            },
          },
        })}
      />,
    )

    const receipt = screen.getByTestId('architecture-change-receipt')
    expect(receipt).toHaveTextContent(
      'Created 6 capabilities · Connected 5 handoffs · Recorded 2 assumptions',
    )
    expect(receipt).not.toHaveTextContent(/question/i)
  })

  it('does not claim a provisional result without committed change-set linkage', () => {
    render(<ArchitectureChangeReceipt message={architectureMessage({ changeSetId: null })} />)

    expect(screen.queryByTestId('architecture-change-receipt')).not.toBeInTheDocument()
  })

  it('ignores malformed or non-provisional persisted metadata', () => {
    const { rerender } = render(
      <ArchitectureChangeReceipt
        message={architectureMessage({
          metadata: {
            change_summary: {
              capabilitiesCreated: -1,
              connectionsCreated: 5,
              assumptionsRecorded: 2,
              questionsRecorded: 1,
              provisional: true,
            },
          },
        })}
      />,
    )
    expect(screen.queryByTestId('architecture-change-receipt')).not.toBeInTheDocument()

    rerender(
      <ArchitectureChangeReceipt
        message={architectureMessage({
          metadata: {
            change_summary: {
              capabilitiesCreated: 6,
              connectionsCreated: 5,
              assumptionsRecorded: 2,
              questionsRecorded: 1,
              provisional: false,
            },
          },
        })}
      />,
    )
    expect(screen.queryByTestId('architecture-change-receipt')).not.toBeInTheDocument()
  })

  it('offers undo only on the latest committed Architecture receipt', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn().mockResolvedValue({ success: true })
    render(<ArchitectureChangeReceipt message={architectureMessage()} canUndo onUndo={onUndo} />)

    await user.click(screen.getByText('Review change'))
    await user.click(screen.getByRole('button', { name: 'Undo this change' }))

    expect(onUndo).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })

  it('turns an interrupted committed change into Review, Continue, and Undo actions', async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()
    const onUndo = vi.fn().mockResolvedValue({ success: true })
    render(
      <ArchitectureChangeReceipt
        message={architectureMessage({
          content: 'I added the booking boundary.\n\n⚠ Response interrupted',
          metadata: {
            turn_status: 'partial',
            change_summary: {
              capabilitiesCreated: 0,
              connectionsCreated: 0,
              assumptionsRecorded: 0,
              questionsRecorded: 0,
              created: 0,
              updated: 1,
              deleted: 0,
              assumed: 0,
              resolved: 0,
              provisional: true,
            },
          },
        })}
        canUndo
        onContinue={onContinue}
        onUndo={onUndo}
      />,
    )

    expect(screen.getByText('Partially committed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText(/Created 0 · Updated 1 · Deleted 0/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(onContinue).toHaveBeenCalledOnce()
    expect(onUndo).toHaveBeenCalledOnce()
  })
})
