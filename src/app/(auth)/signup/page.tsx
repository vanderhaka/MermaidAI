import type { Metadata } from 'next'
import SignupForm from '@/components/auth/signup-form'

export const metadata: Metadata = {
  title: 'Sign Up | MermaidAI',
  description: 'Create your MermaidAI account',
}

export default function SignupPage() {
  return (
    <main>
      <h1>Create your account</h1>
      <SignupForm />
    </main>
  )
}
