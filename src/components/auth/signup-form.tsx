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
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-gray-500">Get started with MermaidAI</p>
      </div>

      <form
        method="post"
        onSubmit={handleSubmit}
        aria-label="Sign up"
        noValidate
        className="space-y-4"
      >
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="signup-email"
            name="email"
            type="email"
            required
            aria-describedby={state.fieldErrors?.email ? 'signup-email-error' : undefined}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
          {state.fieldErrors?.email && (
            <p id="signup-email-error" role="alert" className="mt-1 text-sm text-red-600">
              {state.fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="signup-password"
            name="password"
            type="password"
            required
            aria-describedby={state.fieldErrors?.password ? 'signup-password-error' : undefined}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
          {state.fieldErrors?.password && (
            <p id="signup-password-error" role="alert" className="mt-1 text-sm text-red-600">
              {state.fieldErrors.password}
            </p>
          )}
        </div>

        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {state.error}
          </p>
        )}

        {state.success && (
          <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            Check your email to confirm your account.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {pending ? 'Signing up...' : 'Sign up'}
        </button>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-black hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  )
}
