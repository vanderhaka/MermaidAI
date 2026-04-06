import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-gray-500">This page could not be found.</p>
      <Link
        href="/"
        className="rounded-lg bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
      >
        Go home
      </Link>
    </main>
  )
}
