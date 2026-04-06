// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position, id, ...rest }: Record<string, unknown>) => (
    <div
      data-testid={`handle-${type}-${id ?? position}`}
      data-handle-type={type}
      data-handle-position={position}
      {...rest}
    />
  ),
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

import type { NodeProps } from '@xyflow/react'
import EntryNode from '@/components/canvas/nodes/EntryNode'
import ExitNode from '@/components/canvas/nodes/ExitNode'

const baseNodeProps = {
  type: 'entry',
  draggable: true,
  dragging: false,
  zIndex: 0,
  selectable: true,
  deletable: true,
  selected: false,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
} as const

describe('EntryNode', () => {
  const props = {
    ...baseNodeProps,
    id: 'entry-1',
    type: 'entry' as const,
    data: { label: 'Start Here' },
  } satisfies NodeProps

  it('renders the label', () => {
    render(<EntryNode {...props} />)
    expect(screen.getByText('Start Here')).toBeInTheDocument()
  })

  it('has at least one source handle', () => {
    const { container } = render(<EntryNode {...props} />)
    const sourceHandles = container.querySelectorAll('[data-handle-type="source"]')
    expect(sourceHandles.length).toBeGreaterThanOrEqual(1)
  })

  it('has no target handles', () => {
    const { container } = render(<EntryNode {...props} />)
    const targetHandles = container.querySelectorAll('[data-handle-type="target"]')
    expect(targetHandles.length).toBe(0)
  })

  it('displays entry styling (green-ish border or background)', () => {
    const { container } = render(<EntryNode {...props} />)
    const node = container.firstElementChild as HTMLElement
    const style = node.getAttribute('style') ?? node.className
    expect(style).toMatch(/green|emerald|#22c55e|#10b981|border-green|bg-green|bg-emerald/)
  })
})

describe('ExitNode', () => {
  const props = {
    ...baseNodeProps,
    id: 'exit-1',
    type: 'exit' as const,
    data: { label: 'End Here' },
  } satisfies NodeProps

  it('renders the label', () => {
    render(<ExitNode {...props} />)
    expect(screen.getByText('End Here')).toBeInTheDocument()
  })

  it('has at least one target handle', () => {
    const { container } = render(<ExitNode {...props} />)
    const targetHandles = container.querySelectorAll('[data-handle-type="target"]')
    expect(targetHandles.length).toBeGreaterThanOrEqual(1)
  })

  it('has no source handles', () => {
    const { container } = render(<ExitNode {...props} />)
    const sourceHandles = container.querySelectorAll('[data-handle-type="source"]')
    expect(sourceHandles.length).toBe(0)
  })

  it('displays exit styling (red-ish border or background)', () => {
    const { container } = render(<ExitNode {...props} />)
    const node = container.firstElementChild as HTMLElement
    const style = node.getAttribute('style') ?? node.className
    expect(style).toMatch(/red|rose|#ef4444|#f43f5e|border-red|bg-red|bg-rose/)
  })
})
