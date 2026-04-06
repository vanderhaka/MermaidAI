// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position, ...props }: Record<string, unknown>) => (
    <div data-testid={`handle-${type}`} data-position={position} {...props} />
  ),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}))

import StartNode from '@/components/canvas/nodes/StartNode'
import EndNode from '@/components/canvas/nodes/EndNode'

describe('StartNode', () => {
  const defaultProps = { data: { label: 'Start' }, id: 'start-1' }

  it('renders the label', () => {
    render(<StartNode {...defaultProps} />)
    expect(screen.getByText('Start')).toBeInTheDocument()
  })

  it('has a source handle', () => {
    render(<StartNode {...defaultProps} />)
    expect(screen.getByTestId('handle-source')).toBeInTheDocument()
  })

  it('does not have a target handle', () => {
    render(<StartNode {...defaultProps} />)
    expect(screen.queryByTestId('handle-target')).not.toBeInTheDocument()
  })

  it('renders as a circle shape', () => {
    render(<StartNode {...defaultProps} />)
    const node = screen.getByText('Start').closest('[data-shape]')
    expect(node).toHaveAttribute('data-shape', 'circle')
  })
})

describe('EndNode', () => {
  const defaultProps = { data: { label: 'End' }, id: 'end-1' }

  it('renders the label', () => {
    render(<EndNode {...defaultProps} />)
    expect(screen.getByText('End')).toBeInTheDocument()
  })

  it('has a target handle', () => {
    render(<EndNode {...defaultProps} />)
    expect(screen.getByTestId('handle-target')).toBeInTheDocument()
  })

  it('does not have a source handle', () => {
    render(<EndNode {...defaultProps} />)
    expect(screen.queryByTestId('handle-source')).not.toBeInTheDocument()
  })

  it('renders as a circle shape', () => {
    render(<EndNode {...defaultProps} />)
    const node = screen.getByText('End').closest('[data-shape]')
    expect(node).toHaveAttribute('data-shape', 'circle')
  })
})
