'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signUpSchema } from '@/types/auth'
import { signUp } from '@/lib/services/auth-service'

type FormState = {
  error?: string
  success?: boolean
  fieldErrors?: { email?: string; password?: string }
}

export default function SignupForm() {
  const [state, setState] = useState<FormState>({})
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const parsed = signUpSchema.safeParse({ email, password })
    if (!parsed.success) {
      const fieldErrors: FormState['fieldErrors'] = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as 'email' | 'password'
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message
        }
      }
      setState({ fieldErrors })
      return
    }

    setPending(true)
    setState({})

    const result = await signUp(email, password)

    setPending(false)

    if (result.success) {
      setState({ success: true })
    } else {
      setState({ error: result.error })
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Sign up" noValidate>
      <div>
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          name="email"
          type="email"
          required
          aria-describedby={state.fieldErrors?.email ? 'signup-email-error' : undefined}
        />
        {state.fieldErrors?.email && (
          <p id="signup-email-error" role="alert">
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          name="password"
          type="password"
          required
          aria-describedby={state.fieldErrors?.password ? 'signup-password-error' : undefined}
        />
        {state.fieldErrors?.password && (
          <p id="signup-password-error" role="alert">
            {state.fieldErrors.password}
          </p>
        )}
      </div>

      {state.error && <p role="alert">{state.error}</p>}

      {state.success && <p role="status">Check your email to confirm your account.</p>}

      <button type="submit" disabled={pending}>
        {pending ? 'Signing up...' : 'Sign up'}
      </button>

      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  )
}
