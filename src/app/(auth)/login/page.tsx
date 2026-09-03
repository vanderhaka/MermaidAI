import type { Metadata } from 'next'
import { Suspense } from 'react'
import LoginForm from '@/components/auth/login-form'
import { StripSensitiveAuthQuery } from '@/components/auth/strip-sensitive-auth-query'

export const metadata: Metadata = {
  title: 'Open Workspace | MermaidAI',
  description: 'Open a MermaidAI preview workspace instantly or sign in to an existing account',
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
