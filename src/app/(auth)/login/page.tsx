import type { Metadata } from 'next'
import { Suspense } from 'react'
import LoginForm from '@/components/auth/login-form'
import { StripSensitiveAuthQuery } from '@/components/auth/strip-sensitive-auth-query'

export const metadata: Metadata = {
  title: 'Sign In | MermaidAI',
  description: 'Sign in to your MermaidAI account',
}

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={null}>
        <StripSensitiveAuthQuery />
      </Suspense>
      <LoginForm />
    </>
  )
}
