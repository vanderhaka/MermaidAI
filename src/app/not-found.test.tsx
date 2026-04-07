// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import NotFound from './not-found'

describe('NotFound (404 page)', () => {
  it('renders a heading containing "not found" (case-insensitive)', () => {
    render(<NotFound />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent?.toLowerCase()).toContain('not found')
  })

  it('renders a link navigating to /dashboard', () => {
    render(<NotFound />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/dashboard')
  })

  it('uses semantic HTML with a <main> landmark', () => {
    render(<NotFound />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('does not expose Next.js or Vercel framework details', () => {
    const { container } = render(<NotFound />)
    const text = container.textContent?.toLowerCase() ?? ''
    expect(text).not.toContain('next.js')
    expect(text).not.toContain('vercel')
    expect(text).not.toContain('this page could not be found')
  })
})
