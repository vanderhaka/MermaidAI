// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="react-flow" {...props}>
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: React.PropsWithChildren) => (
    <div data-testid="react-flow-provider">{children}</div>
  ),
  MiniMap: () => <div data-testid="minimap" />,
  Controls: () => <div data-testid="controls" />,
  Background: () => <div data-testid="background" />,
  BackgroundVariant: { Dots: 'dots' },
}))

import Canvas from '@/components/canvas/Canvas'

describe('Canvas', () => {
  it('renders without crashing with empty nodes/edges', () => {
    render(<Canvas nodes={[]} edges={[]} />)
    expect(screen.getByTestId('react-flow')).toBeInTheDocument()
  })

  it('is wrapped in ReactFlowProvider', () => {
    render(<Canvas nodes={[]} edges={[]} />)
    const provider = screen.getByTestId('react-flow-provider')
    const flow = screen.getByTestId('react-flow')
    expect(provider).toContainElement(flow)
  })

  it('renders MiniMap', () => {
    render(<Canvas nodes={[]} edges={[]} />)
    expect(screen.getByTestId('minimap')).toBeInTheDocument()
  })

  it('renders Controls', () => {
    render(<Canvas nodes={[]} edges={[]} />)
    expect(screen.getByTestId('controls')).toBeInTheDocument()
  })

  it('renders Background', () => {
    render(<Canvas nodes={[]} edges={[]} />)
    expect(screen.getByTestId('background')).toBeInTheDocument()
  })
})
