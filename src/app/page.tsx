import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function Home() {
  const { isAuthenticated } = await auth()

  if (isAuthenticated) redirect('/dashboard')

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">MermaidAI</h1>
        <p className="mt-3 text-lg text-gray-500">
          AI-powered visual tool for building decision systems
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/sign-up"
          className="rounded-lg bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Get started
        </Link>
        <Link
          href="/sign-in"
          className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Sign in
        </Link>
      </div>
    </main>
  )
}
