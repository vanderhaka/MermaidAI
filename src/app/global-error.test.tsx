// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import GlobalError from '@/app/global-error'

describe('Global error page', () => {
  const defaultProps = {
    error: new Error('Root layout crashed: missing env var'),
    reset: vi.fn(),
  }

  it('renders html and body tags', () => {
    // global-error replaces the root layout, so it must render its own
    // <html>/<body>. The test DOM hoists these out of the render container,
    // so we use renderToStaticMarkup to verify the JSX output directly.
    const { renderToStaticMarkup } = require('react-dom/server')
    const markup = renderToStaticMarkup(<GlobalError {...defaultProps} />)
    expect(markup).toContain('<html')
    expect(markup).toContain('<body')
  })

  it('renders an error heading', () => {
    render(<GlobalError {...defaultProps} />)
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
  })

  it('renders a "Try again" button that calls reset', async () => {
    const user = userEvent.setup()
    render(<GlobalError {...defaultProps} />)
    const button = screen.getByRole('button', { name: /try again/i })
    await user.click(button)
    expect(defaultProps.reset).toHaveBeenCalledOnce()
  })

  it('does not render error.message', () => {
    render(<GlobalError {...defaultProps} />)
    expect(screen.queryByText('Root layout crashed: missing env var')).not.toBeInTheDocument()
  })

  it('does not render error.stack', () => {
    const errorWithStack = new Error('crash')
    errorWithStack.stack = 'Error: crash\n    at Object.<anonymous>'
    render(<GlobalError error={errorWithStack} reset={vi.fn()} />)
    expect(screen.queryByText(/at Object/)).not.toBeInTheDocument()
  })
})
