'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-4xl font-bold">Something went wrong</h1>
      <p className="text-gray-500">An unexpected error occurred.</p>
      <button
        onClick={reset}
        className="rounded-lg bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
      >
        Try again
      </button>
    </main>
  )
}
