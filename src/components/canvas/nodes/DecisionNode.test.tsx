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

  it('has diamond shape styling (rotated 45deg)', () => {
    render(<DecisionNode {...defaultProps} />)
    const innerRotated = screen.getByText('Is Valid?').closest('[style]')!
    const diamond = innerRotated.parentElement!
    expect(diamond).toHaveStyle({ transform: 'rotate(45deg)' })
  })

  it('counter-rotates label content so text is upright', () => {
    render(<DecisionNode {...defaultProps} />)
    const innerRotated = screen.getByText('Is Valid?').closest('[style]')
    expect(innerRotated).toHaveStyle({ transform: 'rotate(-45deg)' })
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
  })
})
