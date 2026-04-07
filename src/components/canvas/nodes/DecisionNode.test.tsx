// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position, id, ...props }: Record<string, unknown>) => (
    <div data-testid={`handle-${type}${id ? `-${id}` : ''}`} data-position={position} {...props} />
  ),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}))

import type { NodeProps } from '@xyflow/react'
import DecisionNode from '@/components/canvas/nodes/DecisionNode'

const defaultProps = {
  id: 'decision-1',
  data: { label: 'Is Valid?' },
  type: 'decision',
  draggable: true,
  dragging: false,
  zIndex: 0,
  selectable: true,
  deletable: true,
  selected: false,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
} satisfies NodeProps

describe('DecisionNode', () => {
  it('renders the label text', () => {
    render(<DecisionNode {...defaultProps} />)
    expect(screen.getByText('Is Valid?')).toBeInTheDocument()
  })

  it('renders a rotated diamond face layer', () => {
    render(<DecisionNode {...defaultProps} />)
    const diamond = document.querySelector('[aria-hidden="true"]')
    expect(diamond).toBeInTheDocument()
    expect(diamond).toHaveClass('rotate-45')
  })

  it('keeps the label in the unrotated content layer', () => {
    render(<DecisionNode {...defaultProps} />)
    const label = screen.getByText('Is Valid?')
    expect(label).toHaveClass('text-center')
    expect(label).toHaveClass('break-words')
  })

  it('has a target handle at the top', () => {
    render(<DecisionNode {...defaultProps} />)
    const handle = screen.getByTestId('handle-target')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveAttribute('data-position', 'top')
  })

  it('renders a "yes" labeled source handle', () => {
    render(<DecisionNode {...defaultProps} />)
    const handle = screen.getByTestId('handle-source-yes')
    expect(handle).toBeInTheDocument()
  })

  it('renders a "no" labeled source handle', () => {
    render(<DecisionNode {...defaultProps} />)
    const handle = screen.getByTestId('handle-source-no')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveAttribute('data-position', 'right')
  })
})
