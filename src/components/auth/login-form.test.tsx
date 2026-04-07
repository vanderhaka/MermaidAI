// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginForm from '@/components/auth/login-form'

const mockSignIn = vi.fn()
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock('@/lib/services/auth-service', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    mockSignIn.mockReset()
    mockPush.mockReset()
  })

  describe('rendering', () => {
    it('renders email field with label', () => {
      render(<LoginForm />)
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('type', 'email')
    })

    it('renders password field with label', () => {
      render(<LoginForm />)
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password')
    })

    it('renders a submit button', () => {
      render(<LoginForm />)
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('renders a link to /signup for new users', () => {
      render(<LoginForm />)
      const link = screen.getByRole('link', { name: /sign up/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/signup')
    })
  })

  describe('client-side validation', () => {
    it('shows error for invalid email on submit', async () => {
      const user = userEvent.setup()
      render(<LoginForm />)

      await user.type(screen.getByLabelText(/email/i), 'not-an-email')
      await user.type(screen.getByLabelText(/password/i), 'somepassword')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/email/i)
      expect(mockSignIn).not.toHaveBeenCalled()
    })

    it('shows error for empty password on submit', async () => {
      const user = userEvent.setup()
      render(<LoginForm />)

      await user.type(screen.getByLabelText(/email/i), 'user@example.com')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(/1/i)
      expect(mockSignIn).not.toHaveBeenCalled()
    })
  })

  describe('submission', () => {
    it('calls signIn with email and password on valid submit', async () => {
      const user = userEvent.setup()
      mockSignIn.mockResolvedValue({ success: true })
      render(<LoginForm />)

      await user.type(screen.getByLabelText(/email/i), 'user@example.com')
      await user.type(screen.getByLabelText(/password/i), 'mypassword')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      expect(mockSignIn).toHaveBeenCalledWith('user@example.com', 'mypassword')
    })

    it('displays success message after successful login', async () => {
      const user = userEvent.setup()
      mockSignIn.mockResolvedValue({ success: true })
      render(<LoginForm />)

      await user.type(screen.getByLabelText(/email/i), 'user@example.com')
      await user.type(screen.getByLabelText(/password/i), 'mypassword')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByRole('status')).toHaveTextContent(/signed in/i)
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })

    it('displays server error message on failure', async () => {
      const user = userEvent.setup()
      mockSignIn.mockResolvedValue({ success: false, error: 'Invalid credentials' })
      render(<LoginForm />)

      await user.type(screen.getByLabelText(/email/i), 'user@example.com')
      await user.type(screen.getByLabelText(/password/i), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials')
    })
  })

  describe('pending state', () => {
    it('disables submit button and shows loading text while pending', async () => {
      const user = userEvent.setup()
      let resolveSignIn: (value: { success: boolean }) => void
      mockSignIn.mockReturnValue(
        new Promise((resolve) => {
          resolveSignIn = resolve
        }),
      )
      render(<LoginForm />)

      await user.type(screen.getByLabelText(/email/i), 'user@example.com')
      await user.type(screen.getByLabelText(/password/i), 'mypassword')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button).toHaveTextContent(/signing in/i)

      resolveSignIn!({ success: true })
    })
  })

  describe('accessibility', () => {
    it('has a form element wrapping the inputs', () => {
      render(<LoginForm />)
      expect(screen.getByRole('form')).toBeInTheDocument()
    })

    it('marks required fields as required', () => {
      render(<LoginForm />)
      expect(screen.getByLabelText(/email/i)).toBeRequired()
      expect(screen.getByLabelText(/password/i)).toBeRequired()
    })

    it('associates error messages with inputs via aria-describedby', async () => {
      const user = userEvent.setup()
      render(<LoginForm />)

      await user.type(screen.getByLabelText(/email/i), 'bad')
      await user.type(screen.getByLabelText(/password/i), 'somepassword')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await screen.findByRole('alert')

      const emailInput = screen.getByLabelText(/email/i)
      const describedBy = emailInput.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      const errorEl = document.getElementById(describedBy!)
      expect(errorEl).toBeInTheDocument()
    })
  })
})
