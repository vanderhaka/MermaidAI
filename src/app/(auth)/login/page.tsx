import type { Metadata } from 'next'
import LoginForm from '@/components/auth/login-form'

export const metadata: Metadata = {
  title: 'Sign In | MermaidAI',
  description: 'Sign in to your MermaidAI account',
}

export default function LoginPage() {
  return <LoginForm />
}
