// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position, ...props }: Record<string, unknown>) => (
    <div data-testid={`handle-${type}`} data-position={position} {...props} />
  ),
  Position: { Top: 'top', Bottom: 'bottom' },
}))

import type { NodeProps } from '@xyflow/react'
import QuestionNode from '@/components/canvas/nodes/QuestionNode'

const defaultProps = {
  id: 'q-1',
  data: { question: 'How will users authenticate?' },
  type: 'question',
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

describe('QuestionNode', () => {
  it('renders the question text', () => {
    render(<QuestionNode {...defaultProps} />)
    expect(screen.getByText('How will users authenticate?')).toBeInTheDocument()
  })

  it('displays a question mark badge', () => {
    render(<QuestionNode {...defaultProps} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('has a target handle at the top', () => {
    render(<QuestionNode {...defaultProps} />)
    const handle = screen.getByTestId('handle-target')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveAttribute('data-position', 'top')
  })

  it('has a source handle at the bottom', () => {
    render(<QuestionNode {...defaultProps} />)
    const handle = screen.getByTestId('handle-source')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveAttribute('data-position', 'bottom')
  })

  it('has amber border styling', () => {
    const { container } = render(<QuestionNode {...defaultProps} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('border-amber-400')
  })

  it('has 300px width', () => {
    const { container } = render(<QuestionNode {...defaultProps} />)
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('w-[300px]')
  })
})
