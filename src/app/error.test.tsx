// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ErrorPage from '@/app/error'

describe('ErrorPage', () => {
  const mockError = new Error('Something broke badly')
  const mockReset = vi.fn()

  it('renders an error heading', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />)
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
  })

  it('renders a "Try again" button', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('calls reset when "Try again" is clicked', async () => {
    const user = userEvent.setup()
    render(<ErrorPage error={mockError} reset={mockReset} />)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(mockReset).toHaveBeenCalledOnce()
  })

  it('does not render error.message', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />)
    expect(screen.queryByText('Something broke badly')).not.toBeInTheDocument()
  })

  it('does not render error.stack', () => {
    const errorWithStack = new Error('fail')
    errorWithStack.stack = 'Error: fail\n    at Object.<anonymous>'
    render(<ErrorPage error={errorWithStack} reset={mockReset} />)
    expect(screen.queryByText(/at Object\.<anonymous>/)).not.toBeInTheDocument()
    expect(screen.queryByText('Error: fail')).not.toBeInTheDocument()
  })

  it('uses semantic HTML (main landmark)', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
