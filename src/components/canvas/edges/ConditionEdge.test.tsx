// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  BaseEdge: ({ id, path, style }: Record<string, unknown>) => (
    <g data-testid="base-edge" data-id={id} data-path={path} style={style as React.CSSProperties} />
  ),
  getSmoothStepPath: () => ['M0 0 L100 100', 50, 50, 0, 0],
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="edge-label-renderer">{children}</div>
  ),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
}))

import type { ComponentProps } from 'react'
import ConditionEdge from '@/components/canvas/edges/ConditionEdge'

const baseProps = {
  id: 'edge-1',
  source: 'node-1',
  target: 'node-2',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  sourcePosition: 'bottom',
  targetPosition: 'top',
  data: {},
} as ComponentProps<typeof ConditionEdge>

describe('ConditionEdge', () => {
  it('renders without crashing', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} />
      </svg>,
    )
    expect(screen.getByTestId('base-edge')).toBeInTheDocument()
  })

  it('has an accessible label via the hitbox aria-label', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} data={{ label: 'Yes' }} />
      </svg>,
    )
    const hitbox = screen.getByTestId('condition-edge-hitbox')
    expect(hitbox).toHaveAttribute('aria-label', 'Yes')
  })

  it('shows tooltip on hover when label is provided', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} data={{ label: 'No' }} />
      </svg>,
    )
    const hitbox = screen.getByTestId('condition-edge-hitbox')
    fireEvent.mouseEnter(hitbox)
    const tooltip = screen.getByTestId('condition-edge-tooltip')
    expect(tooltip).toBeInTheDocument()
    expect(tooltip.textContent).toContain('No')
  })

  it('hides tooltip when not hovered', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} data={{ label: 'No' }} />
      </svg>,
    )
    expect(screen.queryByTestId('condition-edge-tooltip')).not.toBeInTheDocument()
  })

  it('shows no tooltip when label and condition are both absent', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} data={{}} />
      </svg>,
    )
    const hitbox = screen.getByTestId('condition-edge-hitbox')
    fireEvent.mouseEnter(hitbox)
    expect(screen.queryByTestId('condition-edge-tooltip')).not.toBeInTheDocument()
  })

  it('renders an animated path via BaseEdge', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} />
      </svg>,
    )
    const edge = screen.getByTestId('base-edge')
    expect(edge).toHaveAttribute('data-path', 'M0 0 L100 100')
  })

  it('shows tooltip inside EdgeLabelRenderer on hover', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} data={{ label: 'No' }} />
      </svg>,
    )
    const hitbox = screen.getByTestId('condition-edge-hitbox')
    fireEvent.mouseEnter(hitbox)
    const tooltip = screen.getByTestId('condition-edge-tooltip')
    expect(tooltip.closest('[data-testid="edge-label-renderer"]')).toBeTruthy()
  })

  it('applies rounded stroke styling to the edge', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} />
      </svg>,
    )
    const edge = screen.getByTestId('base-edge')
    const style = edge.getAttribute('style') ?? ''
    expect(style).toContain('stroke-linecap: round')
    expect(style).toContain('stroke-linejoin: round')
  })

  it('shows condition text in tooltip', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} data={{ label: 'Yes', condition: 'User is authenticated' }} />
      </svg>,
    )
    const hitbox = screen.getByTestId('condition-edge-hitbox')
    fireEvent.mouseEnter(hitbox)
    const tooltip = screen.getByTestId('condition-edge-tooltip')
    expect(tooltip.textContent).toContain('Yes')
    expect(tooltip.textContent).toContain('User is authenticated')
  })
})
