// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position, ...props }: Record<string, unknown>) => (
    <div data-testid={`handle-${type}`} data-position={position} {...props} />
  ),
  Position: { Top: 'top', Bottom: 'bottom' },
}))

import type { NodeProps } from '@xyflow/react'
import ProcessNode from '@/components/canvas/nodes/ProcessNode'

const defaultProps = {
  id: 'node-1',
  data: {
    label: 'Validate Input',
    pseudocode: 'if input is valid\n  process data\nelse\n  return error',
  },
  type: 'process',
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

describe('ProcessNode', () => {
  it('renders the label', () => {
    render(<ProcessNode {...defaultProps} />)
    expect(screen.getByText('Validate Input')).toBeInTheDocument()
  })

  it('hides pseudocode by default', () => {
    render(<ProcessNode {...defaultProps} />)
    // The hover preview line is in the DOM but visually hidden (opacity-0).
    // The expanded <pre> block should not be present.
    expect(screen.queryByRole('code')).not.toBeInTheDocument()
    const preview = screen.queryByText(/if input is valid/)
    if (preview) {
      expect(preview.tagName).toBe('P')
      expect(preview.className).toContain('opacity-0')
    }
  })

  it('shows pseudocode when expand button is clicked', async () => {
    const user = userEvent.setup()
    render(<ProcessNode {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /expand/i }))

    expect(screen.getByText(/if input is valid/)).toBeInTheDocument()
  })

  it('hides pseudocode when expand button is clicked again', async () => {
    const user = userEvent.setup()
    render(<ProcessNode {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /expand/i }))
    expect(screen.getByText(/if input is valid/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /collapse/i }))
    // After collapsing, the <pre> block is gone; the hover preview line may remain in DOM
    const remaining = screen.queryAllByText(/if input is valid/)
    for (const el of remaining) {
      expect(el.tagName).not.toBe('PRE')
    }
  })

  it('has a target handle at the top', () => {
    render(<ProcessNode {...defaultProps} />)
    const handle = screen.getByTestId('handle-target')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveAttribute('data-position', 'top')
  })

  it('has a source handle at the bottom', () => {
    render(<ProcessNode {...defaultProps} />)
    const handle = screen.getByTestId('handle-source')
    expect(handle).toBeInTheDocument()
    expect(handle).toHaveAttribute('data-position', 'bottom')
  })
})
