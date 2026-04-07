// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { getSmoothStepPath } = vi.hoisted(() => ({
  getSmoothStepPath: vi.fn(() => ['M0 0 L100 100', 50, 50, 0, 0]),
}))

vi.mock('@xyflow/react', () => ({
  BaseEdge: ({ id, path, markerEnd, style }: Record<string, unknown>) => (
    <g
      data-testid="base-edge"
      data-id={id}
      data-path={path}
      data-marker-end={JSON.stringify(markerEnd)}
      style={style as React.CSSProperties}
    />
  ),
  getSmoothStepPath,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="edge-label-renderer">{children}</div>
  ),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}))

import type { ComponentProps } from 'react'
import ModuleConnectionEdge from '@/components/canvas/edges/ModuleConnectionEdge'

const baseProps = {
  id: 'edge-1',
  source: 'node-1',
  target: 'node-2',
  sourceX: 100,
  sourceY: 200,
  targetX: 20,
  targetY: 80,
  sourcePosition: 'left',
  targetPosition: 'right',
  data: {},
} as ComponentProps<typeof ModuleConnectionEdge>

describe('ModuleConnectionEdge', () => {
  it('renders the label when provided', () => {
    render(
      <svg>
        <ModuleConnectionEdge {...baseProps} data={{ label: 'return_to_cart' }} />
      </svg>,
    )

    expect(screen.getByText('return_to_cart')).toBeInTheDocument()
  })

  it('biases diagonal horizontal routes toward the source lane', () => {
    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          data={{ label: 'return_to_cart', routeBias: 'source-y', laneGap: 40, offset: 32 }}
        />
      </svg>,
    )

    expect(getSmoothStepPath).toHaveBeenCalledWith(
      expect.objectContaining({
        centerY: 160,
        centerX: undefined,
        offset: 32,
      }),
    )
  })

  it('biases diagonal vertical routes toward the source lane', () => {
    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          sourceX={120}
          sourceY={20}
          targetX={240}
          targetY={180}
          sourcePosition={'top' as never}
          targetPosition={'bottom' as never}
          data={{ label: 'retry_payment', routeBias: 'source-x', laneGap: 30 }}
        />
      </svg>,
    )

    expect(getSmoothStepPath).toHaveBeenCalledWith(
      expect.objectContaining({
        centerX: 150,
        centerY: undefined,
      }),
    )
  })

  it('uses an outer lane route for perimeter bands', () => {
    getSmoothStepPath.mockClear()

    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          sourcePosition={'bottom' as never}
          targetPosition={'bottom' as never}
          data={{
            label: 'return_to_cart',
            routeBand: 'outer-y',
            laneCoordinate: 260,
            offset: 24,
          }}
        />
      </svg>,
    )

    expect(getSmoothStepPath).not.toHaveBeenCalled()
    expect(screen.getByTestId('base-edge').getAttribute('data-path')).toContain('260')
  })

  it('forwards marker and style to the base edge', () => {
    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          markerEnd="url(#edge-marker)"
          style={{ stroke: '#f97316', strokeWidth: 2 }}
        />
      </svg>,
    )

    const edge = screen.getByTestId('base-edge')
    expect(edge).toHaveAttribute('data-marker-end', JSON.stringify('url(#edge-marker)'))
    expect(edge.getAttribute('style')).toContain('stroke: #f97316')
  })

  it('highlights the connector and label on hover', () => {
    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          data={{ label: 'payment_failure' }}
          style={{ stroke: '#f97316', strokeWidth: 1.5 }}
        />
      </svg>,
    )

    const edge = screen.getByTestId('base-edge')
    const hitbox = screen.getByTestId('module-connection-edge-hitbox')
    const label = screen.getByTestId('module-connection-edge-label')

    expect(label).toHaveAttribute('data-hovered', 'false')

    fireEvent.mouseEnter(hitbox)

    expect(label).toHaveAttribute('data-hovered', 'true')
    expect(edge.getAttribute('style')).toContain('stroke-width: 3.5')
    expect(edge.getAttribute('style')).toContain('filter: drop-shadow')

    fireEvent.mouseLeave(hitbox)

    expect(label).toHaveAttribute('data-hovered', 'false')
    expect(edge.getAttribute('style')).toContain('stroke-width: 1.5')
  })
})
