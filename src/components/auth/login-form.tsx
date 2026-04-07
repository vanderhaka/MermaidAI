'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/services/auth-service'
import { signInSchema } from '@/types/auth'
import type { AuthResult } from '@/types/auth'

type FormState = {
  fieldErrors?: { email?: string; password?: string }
  serverResult?: AuthResult
}

export default function LoginForm() {
  const router = useRouter()
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

    if (result.success) {
      router.push('/dashboard')
    }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} noValidate aria-label="Login form" className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            aria-describedby={emailError ? 'email-error' : undefined}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
          {emailError && (
            <p id="email-error" role="alert" className="mt-1 text-sm text-red-600">
              {emailError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            aria-describedby={passwordError ? 'password-error' : undefined}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
          {passwordError && (
            <p id="password-error" role="alert" className="mt-1 text-sm text-red-600">
              {passwordError}
            </p>
          )}
        </div>

        {serverError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {serverError}
          </p>
        )}

        {serverSuccess && (
          <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            Signed in successfully
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-black hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  )
}
