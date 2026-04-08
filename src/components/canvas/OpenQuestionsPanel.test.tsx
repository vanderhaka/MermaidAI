// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import OpenQuestionsPanel from '@/components/canvas/OpenQuestionsPanel'
import type { OpenQuestion } from '@/types/graph'

function makeQ(overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    id: 'oq-1',
    project_id: 'proj-1',
    node_id: 'n-1',
    section: 'Auth',
    question: 'What OAuth providers?',
    status: 'open',
    resolution: null,
    created_at: '2026-04-08T00:00:00Z',
    resolved_at: null,
    ...overrides,
  }
}

const questions: OpenQuestion[] = [
  makeQ({ id: 'oq-1', section: 'Auth', question: 'OAuth providers?' }),
  makeQ({ id: 'oq-2', section: 'Auth', question: 'MFA required?' }),
  makeQ({ id: 'oq-3', section: 'Payments', question: 'Stripe or Square?' }),
  makeQ({
    id: 'oq-4',
    section: 'Payments',
    question: 'Currency support?',
    status: 'resolved',
    resolution: 'AUD only',
  }),
]

describe('OpenQuestionsPanel', () => {
  it('renders the panel', () => {
    render(<OpenQuestionsPanel questions={questions} />)
    expect(screen.getByTestId('open-questions-panel')).toBeInTheDocument()
  })

  it('groups questions under section headers', () => {
    render(<OpenQuestionsPanel questions={questions} />)
    expect(screen.getByText('Auth')).toBeInTheDocument()
    expect(screen.getByText('Payments')).toBeInTheDocument()
  })

  it('shows open question count badge', () => {
    render(<OpenQuestionsPanel questions={questions} />)
    expect(screen.getByTestId('open-count')).toHaveTextContent('3')
  })

  it('auto-opens when open questions exist', () => {
    render(<OpenQuestionsPanel questions={questions} />)
    expect(screen.getByText('OAuth providers?')).toBeInTheDocument()
  })

  it('shows resolved question with resolution text', () => {
    render(<OpenQuestionsPanel questions={questions} />)
    expect(screen.getByText(/AUD only/)).toBeInTheDocument()
  })

  it('shows empty state when no questions', () => {
    render(<OpenQuestionsPanel questions={[]} />)
    expect(screen.getByText(/no open questions/i)).toBeInTheDocument()
  })

  it('does not show count badge when no open questions', () => {
    const resolved = [makeQ({ id: 'oq-1', status: 'resolved', resolution: 'Done' })]
    render(<OpenQuestionsPanel questions={resolved} />)
    expect(screen.queryByTestId('open-count')).not.toBeInTheDocument()
  })

  it('can collapse and expand', async () => {
    const user = userEvent.setup()
    render(<OpenQuestionsPanel questions={questions} />)

    // Should be auto-opened
    expect(screen.getByText('OAuth providers?')).toBeInTheDocument()

    // Collapse
    await user.click(screen.getByText('Open Questions'))
    expect(screen.queryByText('OAuth providers?')).not.toBeInTheDocument()

    // Expand
    await user.click(screen.getByText('Open Questions'))
    expect(screen.getByText('OAuth providers?')).toBeInTheDocument()
  })
})
