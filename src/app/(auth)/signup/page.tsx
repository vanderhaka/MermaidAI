import type { Metadata } from 'next'
import { Suspense } from 'react'
import SignupForm from '@/components/auth/signup-form'
import { StripSensitiveAuthQuery } from '@/components/auth/strip-sensitive-auth-query'

export const metadata: Metadata = {
  title: 'Sign Up | MermaidAI',
  description: 'Create your MermaidAI account',
}

export default function SignupPage() {
  return (
    <>
      <Suspense fallback={null}>
        <StripSensitiveAuthQuery />
      </Suspense>
      <SignupForm />
    </>
  )
}
