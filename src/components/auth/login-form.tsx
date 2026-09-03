'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { enterPreview, signIn } from '@/lib/services/auth-service'
import { signInSchema } from '@/types/auth'
import type { AuthResult } from '@/types/auth'

type FormState = {
  fieldErrors?: { email?: string; password?: string }
  serverResult?: AuthResult
}

export default function LoginForm() {
  const [state, setState] = useState<FormState>({})
  const [pendingAction, setPendingAction] = useState<'preview' | 'account' | null>(null)

  const emailError = state.fieldErrors?.email
  const passwordError = state.fieldErrors?.password
  const serverError = state.serverResult?.success === false ? state.serverResult.error : undefined
  const serverSuccess = state.serverResult?.success === true
  const isPending = pendingAction !== null

  async function handlePreview() {
    setPendingAction('preview')
    setState({})
    try {
      const result = await enterPreview()
      setState({ serverResult: result })
    } finally {
      setPendingAction(null)
    }
  }

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

    setPendingAction('account')
    setState({})
    try {
      const result = await signIn(parsed.data.email, parsed.data.password)
      setState({ serverResult: result })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Open your workspace</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Jump straight into the preview, or use an existing account.
        </p>
      </div>

      <button
        type="button"
        onClick={handlePreview}
        disabled={isPending}
        aria-describedby="preview-access-note"
        className="group flex w-full items-center justify-between rounded-2xl bg-slate-950 px-4 py-3.5 text-left text-white shadow-lg shadow-slate-300/50 transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-xl disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60"
      >
        <span>
          <span className="block text-sm font-semibold">
            {pendingAction === 'preview' ? 'Opening preview...' : 'Enter preview'}
          </span>
          <span className="mt-0.5 block text-xs text-slate-300">No email or password</span>
        </span>
        <span
          aria-hidden="true"
          className="text-xl text-slate-300 transition-transform group-hover:translate-x-0.5"
        >
          &rarr;
        </span>
      </button>
      <p id="preview-access-note" className="mt-3 text-center text-xs leading-5 text-slate-500">
        No signup needed. This browser keeps access to its own private workspace.
      </p>

      {serverError && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
          {serverError}
        </p>
      )}

      {serverSuccess && (
        <p role="status" className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">
          Signed in successfully
        </p>
      )}

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Account login
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form
        method="post"
        onSubmit={handleSubmit}
        noValidate
        aria-label="Login form"
        className="space-y-4"
      >
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={isPending}
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
            disabled={isPending}
            aria-describedby={passwordError ? 'password-error' : undefined}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
          />
          {passwordError && (
            <p id="password-error" role="alert" className="mt-1 text-sm text-red-600">
              {passwordError}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {pendingAction === 'account' ? 'Signing in...' : 'Sign in'}
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
