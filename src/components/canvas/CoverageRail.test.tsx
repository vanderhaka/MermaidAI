// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoverageRail from '@/components/canvas/CoverageRail'
import type { OpenQuestion, Requirement } from '@/types/graph'

const timestamp = '2026-07-25T00:00:00Z'

function makeQuestion(overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    id: 'oq-1',
    project_id: 'project-1',
    module_id: 'module-1',
    node_id: 'node-1',
    section: 'Money',
    question: 'When is payment captured?',
    status: 'open',
    resolution: null,
    coverage_area: 'Money',
    created_at: timestamp,
    resolved_at: null,
    ...overrides,
  }
}

function makeRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'req-1',
    project_id: 'project-1',
    module_id: 'module-1',
    statement: 'Payment is captured at booking.',
    kind: 'rule',
    status: 'agreed',
    coverage_area: 'Money',
    source_question_id: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

describe('CoverageRail', () => {
  it('renders all eleven coverage areas', () => {
    render(<CoverageRail openQuestions={[]} requirements={[]} />)

    expect(screen.getByTestId('coverage-rail')).toBeInTheDocument()
    expect(screen.getByText('Actors & roles')).toBeInTheDocument()
    expect(screen.getByText('Liability & compliance')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(11)
  })

  it('renders an area with open questions as amber, with its count', () => {
    render(
      <CoverageRail
        openQuestions={[makeQuestion(), makeQuestion({ id: 'oq-2' })]}
        requirements={[]}
      />,
    )

    const money = screen.getByTestId('coverage-money')
    expect(money).toHaveAttribute('data-status', 'open')
    expect(money).toHaveAccessibleName(/2 open questions/)
  })

  it('renders an area with only agreed requirements as green', () => {
    render(<CoverageRail openQuestions={[]} requirements={[makeRequirement()]} />)

    const money = screen.getByTestId('coverage-money')
    expect(money).toHaveAttribute('data-status', 'covered')
    expect(money).toHaveAccessibleName(/covered/)
  })

  it('leaves untouched areas grey', () => {
    render(<CoverageRail openQuestions={[]} requirements={[makeRequirement()]} />)

    expect(screen.getByTestId('coverage-compliance')).toHaveAttribute('data-status', 'untouched')
  })

  it('shows how much of the engagement is settled', () => {
    render(<CoverageRail openQuestions={[]} requirements={[makeRequirement()]} />)

    expect(screen.getByTestId('coverage-progress')).toHaveTextContent('1/11')
  })

  it('lets the user drive the conversation to an area', async () => {
    const onAreaClick = vi.fn()
    render(<CoverageRail openQuestions={[]} requirements={[]} onAreaClick={onAreaClick} />)

    await userEvent.click(screen.getByTestId('coverage-failure_modes'))

    expect(onAreaClick).toHaveBeenCalledWith('Failure modes')
  })
})
