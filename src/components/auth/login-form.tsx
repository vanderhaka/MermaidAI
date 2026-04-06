'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { signIn } from '@/lib/services/auth-service'
import { signInSchema } from '@/types/auth'
import type { AuthResult } from '@/types/auth'

type FormState = {
  fieldErrors?: { email?: string; password?: string }
  serverResult?: AuthResult
}

export default function LoginForm() {
  const [state, setState] = useState<FormState>({})
  const [isPending, setIsPending] = useState(false)

  const emailError = state.fieldErrors?.email
  const passwordError = state.fieldErrors?.password
  const serverError = state.serverResult?.success === false ? state.serverResult.error : undefined
  const serverSuccess = state.serverResult?.success === true

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const parsed = signInSchema.safeParse({ email, password })
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

    setIsPending(true)
    setState({})
    const result = await signIn(parsed.data.email, parsed.data.password)
    setState({ serverResult: result })
    setIsPending(false)
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Login form">
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          aria-describedby={emailError ? 'email-error' : undefined}
        />
        {emailError && (
          <p id="email-error" role="alert">
            {emailError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          aria-describedby={passwordError ? 'password-error' : undefined}
        />
        {passwordError && (
          <p id="password-error" role="alert">
            {passwordError}
          </p>
        )}
      </div>

      {serverError && <p role="alert">{serverError}</p>}

      {serverSuccess && <p role="status">Signed in successfully</p>}

      <button type="submit" disabled={isPending}>
        {isPending ? 'Signing in...' : 'Sign in'}
      </button>

      <p>
        Don&apos;t have an account? <Link href="/signup">Sign up</Link>
      </p>
    </form>
  )
}
