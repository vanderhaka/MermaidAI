// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position, id, ...props }: Record<string, unknown>) => (
    <div data-testid={`handle-${type}${id ? `-${id}` : ''}`} data-position={position} {...props} />
  ),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}))

import type { NodeProps } from '@xyflow/react'
import ScreenNode, { screenStateStatus } from '@/components/canvas/nodes/ScreenNode'
import { createFlowNodeSchema } from '@/lib/schemas/flow-node'

const defaultProps = {
  id: 'screen-1',
  type: 'screen',
  draggable: true,
  dragging: false,
  zIndex: 0,
  selectable: true,
  deletable: true,
  selected: false,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
} as unknown as NodeProps

function renderNode(data: Record<string, unknown>) {
  return render(<ScreenNode {...defaultProps} data={data} />)
}

describe('screen/role/data node types', () => {
  it.each(['screen', 'role', 'data'] as const)(
    'accepts %s in the flow node schema',
    (node_type) => {
      const parsed = createFlowNodeSchema.safeParse({
        module_id: '550e8400-e29b-41d4-a716-446655440000',
        node_type,
        label: 'Checkout page',
        pseudocode: '',
        position: { x: 0, y: 0 },
        color: '#7c3aed',
      })

      expect(parsed.success).toBe(true)
    },
  )
})

describe('ScreenNode states strip', () => {
  it('renders every state, defaulting unspecified ones to unknown', () => {
    renderNode({ label: 'Checkout page' })

    expect(screen.getByText('Checkout page')).toBeInTheDocument()
    for (const label of ['Empty', 'Loading', 'Error', 'Success']) {
      expect(
        screen.getByRole('button', { name: new RegExp(`${label} state: unknown`) }),
      ).toBeInTheDocument()
    }
  })

  it('marks defined and not-applicable states distinctly', () => {
    renderNode({
      label: 'Checkout page',
      states: { error: 'defined', loading: 'not_applicable' },
    })

    expect(screen.getByRole('button', { name: /Error state: defined/ })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Loading state: not applicable/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Empty state: unknown/ })).toBeInTheDocument()
  })

  it('only lets an unknown state be clicked, so gaps are the actionable thing', async () => {
    const onStateClick = vi.fn()
    renderNode({ label: 'Checkout page', states: { error: 'defined' }, onStateClick })

    await userEvent.click(screen.getByRole('button', { name: /Empty state: unknown/ }))
    expect(onStateClick).toHaveBeenCalledWith('empty')

    onStateClick.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /Error state: defined/ }))
    expect(onStateClick).not.toHaveBeenCalled()
  })

  it('treats a missing states map as entirely unknown', () => {
    expect(screenStateStatus(undefined, 'empty')).toBe('unknown')
    expect(screenStateStatus({ empty: 'defined' }, 'empty')).toBe('defined')
    expect(screenStateStatus({ empty: 'defined' }, 'error')).toBe('unknown')
  })
})
