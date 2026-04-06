// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignupForm from '@/components/auth/signup-form'

const mockSignUp = vi.fn()

vi.mock('@/lib/services/auth-service', () => ({
  signUp: (...args: unknown[]) => mockSignUp(...args),
}))

describe('SignupForm', () => {
  beforeEach(() => {
    mockSignUp.mockReset()
  })

  describe('rendering', () => {
    it('renders email field with label', () => {
      render(<SignupForm />)
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('type', 'email')
    })

    it('renders password field with label', () => {
      render(<SignupForm />)
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password')
    })

    it('renders a submit button', () => {
      render(<SignupForm />)
      expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument()
    })

    it('renders a link to /login for existing users', () => {
      render(<SignupForm />)
      const link = screen.getByRole('link', { name: /log in/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/login')
    })
  })

  describe('client-side validation', () => {
    it('shows error for invalid email on submit', async () => {
      const user = userEvent.setup()
      render(<SignupForm />)

      await user.type(screen.getByLabelText(/email/i), 'not-an-email')
      await user.type(screen.getByLabelText(/password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /sign up/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/email/i)
      expect(mockSignUp).not.toHaveBeenCalled()
    })

    it('shows error for password shorter than 8 characters on submit', async () => {
      const user = userEvent.setup()
      render(<SignupForm />)

      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/password/i), 'short')
      await user.click(screen.getByRole('button', { name: /sign up/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/8/i)
      expect(mockSignUp).not.toHaveBeenCalled()
    })
  })

  describe('submission', () => {
    it('calls signUp with email and password on valid submit', async () => {
      const user = userEvent.setup()
      mockSignUp.mockResolvedValue({ success: true })
      render(<SignupForm />)

      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /sign up/i }))

      expect(mockSignUp).toHaveBeenCalledWith('test@example.com', 'password123')
    })

    it('displays success message after successful signup', async () => {
      const user = userEvent.setup()
      mockSignUp.mockResolvedValue({ success: true })
      render(<SignupForm />)

      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /sign up/i }))

      expect(await screen.findByRole('status')).toHaveTextContent(/check your email/i)
    })

    it('displays server error message on failure', async () => {
      const user = userEvent.setup()
      mockSignUp.mockResolvedValue({ success: false, error: 'User already registered' })
      render(<SignupForm />)

      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /sign up/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent('User already registered')
    })
  })

  describe('pending state', () => {
    it('disables submit button and shows loading text while pending', async () => {
      const user = userEvent.setup()
      let resolveSignUp: (value: { success: boolean }) => void
      mockSignUp.mockReturnValue(
        new Promise((resolve) => {
          resolveSignUp = resolve
        }),
      )
      render(<SignupForm />)

      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /sign up/i }))

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button).toHaveTextContent(/signing up/i)

      resolveSignUp!({ success: true })
    })
  })

  describe('accessibility', () => {
    it('has a form element wrapping the inputs', () => {
      render(<SignupForm />)
      expect(screen.getByRole('form')).toBeInTheDocument()
    })

    it('marks required fields as required', () => {
      render(<SignupForm />)
      expect(screen.getByLabelText(/email/i)).toBeRequired()
      expect(screen.getByLabelText(/password/i)).toBeRequired()
    })

    it('associates error messages with inputs via aria-describedby', async () => {
      const user = userEvent.setup()
      render(<SignupForm />)

      await user.type(screen.getByLabelText(/email/i), 'bad')
      await user.type(screen.getByLabelText(/password/i), 'short')
      await user.click(screen.getByRole('button', { name: /sign up/i }))

      await screen.findAllByRole('alert')

      const emailInput = screen.getByLabelText(/email/i)
      const describedBy = emailInput.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      const errorEl = document.getElementById(describedBy!)
      expect(errorEl).toBeInTheDocument()
    })
  })
})
