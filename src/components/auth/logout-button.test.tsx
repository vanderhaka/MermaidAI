// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogoutButton } from '@/components/auth/logout-button'

const mockSignOut = vi.fn()
vi.mock('@/lib/services/auth-service', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}))

describe('LogoutButton', () => {
  beforeEach(() => {
    mockSignOut.mockReset()
  })

  it('renders a button with "Log out" text', () => {
    render(<LogoutButton />)
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
  })

  it('calls signOut when clicked', async () => {
    const user = userEvent.setup()
    render(<LogoutButton />)

    await user.click(screen.getByRole('button', { name: /log out/i }))

    expect(mockSignOut).toHaveBeenCalledOnce()
  })
})
