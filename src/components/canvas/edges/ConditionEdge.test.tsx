// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
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

  it('displays label text when provided', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} data={{ label: 'Yes' }} />
      </svg>,
    )
    expect(screen.getByText('Yes')).toBeInTheDocument()
  })

  it('shows no label element when label is null', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} data={{ label: null }} />
      </svg>,
    )
    const renderer = screen.getByTestId('edge-label-renderer')
    expect(renderer.querySelector('[data-testid="edge-label"]')).not.toBeInTheDocument()
  })

  it('shows no label element when data is empty', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} data={{}} />
      </svg>,
    )
    const renderer = screen.getByTestId('edge-label-renderer')
    expect(renderer.querySelector('[data-testid="edge-label"]')).not.toBeInTheDocument()
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

  it('uses EdgeLabelRenderer for label positioning', () => {
    render(
      <svg>
        <ConditionEdge {...baseProps} data={{ label: 'No' }} />
      </svg>,
    )
    const renderer = screen.getByTestId('edge-label-renderer')
    expect(renderer).toBeInTheDocument()
    expect(screen.getByText('No').closest('[data-testid="edge-label-renderer"]')).toBeTruthy()
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
})
