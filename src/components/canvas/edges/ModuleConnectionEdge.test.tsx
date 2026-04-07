// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  beforeEach(() => {
    getSmoothStepPath.mockClear()
  })

  it('uses a straight horizontal route for aligned side-to-side connectors', () => {
    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          sourceX={40}
          sourceY={120}
          targetX={260}
          targetY={120}
          sourcePosition={'right' as never}
          targetPosition={'left' as never}
          data={{ label: 'payment_result' }}
        />
      </svg>,
    )

    expect(getSmoothStepPath).not.toHaveBeenCalled()
    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-path', 'M40 120 L260 120')
  })

  it('renders explicit layout sections before falling back to heuristic routing', () => {
    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          data={{
            label: 'checkout_data',
            sections: [
              {
                startPoint: { x: 120, y: 100 },
                bendPoints: [{ x: 120, y: 160 }],
                endPoint: { x: 200, y: 160 },
              },
            ],
          }}
        />
      </svg>,
    )

    expect(getSmoothStepPath).not.toHaveBeenCalled()
    expect(screen.getByTestId('base-edge')).toHaveAttribute(
      'data-path',
      'M120 100 L120 160 L200 160',
    )
  })

  it('orthogonalizes stitched layout sections into square corners', () => {
    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          sourceX={40}
          sourceY={100}
          targetX={-32}
          targetY={280}
          sourcePosition={'bottom' as never}
          targetPosition={'top' as never}
          data={{
            label: 'payment_confirmed',
            sections: [
              {
                startPoint: { x: 40, y: 100 },
                bendPoints: [
                  { x: 52, y: 150 },
                  { x: 40, y: 162 },
                  { x: -20, y: 162 },
                ],
                endPoint: { x: -32, y: 162 },
              },
              {
                startPoint: { x: -20, y: 174 },
                endPoint: { x: -32, y: 280 },
              },
            ],
          }}
        />
      </svg>,
    )

    expect(getSmoothStepPath).not.toHaveBeenCalled()
    expect(screen.getByTestId('base-edge')).toHaveAttribute(
      'data-path',
      'M40 100 L40 162 L-20 162 L-20 174 L-32 174 L-32 280',
    )
  })

  it('uses a straight vertical route for aligned top-to-bottom connectors', () => {
    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          sourceX={180}
          sourceY={40}
          targetX={180}
          targetY={260}
          sourcePosition={'bottom' as never}
          targetPosition={'top' as never}
          data={{ label: 'payment_failure' }}
        />
      </svg>,
    )

    expect(getSmoothStepPath).not.toHaveBeenCalled()
    expect(screen.getByTestId('base-edge')).toHaveAttribute('data-path', 'M180 40 L180 260')
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

  it('pushes reused biased corridors farther outward with lane offsets', () => {
    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          data={{
            label: 'retry_payment',
            routeBias: 'source-y',
            laneGap: 40,
            laneOffset: -18,
          }}
        />
      </svg>,
    )

    expect(getSmoothStepPath).toHaveBeenCalledWith(
      expect.objectContaining({
        centerY: 142,
        centerX: undefined,
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

  it('highlights the connector and shows a route tooltip on hover', () => {
    render(
      <svg>
        <ModuleConnectionEdge
          {...baseProps}
          data={{
            label: 'payment_failure',
            tooltipDescription: 'From Payment to Payment Failure (payment_error)',
          }}
          style={{ stroke: '#f97316', strokeWidth: 1.5 }}
        />
      </svg>,
    )

    const edge = screen.getByTestId('base-edge')
    const hitbox = screen.getByTestId('module-connection-edge-hitbox')
    expect(screen.queryByTestId('module-connection-edge-tooltip')).not.toBeInTheDocument()

    fireEvent.mouseEnter(hitbox)

    const tooltip = screen.getByTestId('module-connection-edge-tooltip')
    expect(tooltip).toHaveTextContent('payment_failure')
    expect(tooltip).toHaveTextContent('From Payment to Payment Failure (payment_error)')
    expect(edge.getAttribute('style')).toContain('stroke-width: 3.5')
    expect(edge.getAttribute('style')).toContain('filter: drop-shadow')

    fireEvent.mouseLeave(hitbox)

    expect(screen.queryByTestId('module-connection-edge-tooltip')).not.toBeInTheDocument()
    expect(edge.getAttribute('style')).toContain('stroke-width: 1.5')
  })
})
