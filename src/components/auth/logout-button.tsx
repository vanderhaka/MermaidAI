'use client'

import { signOut } from '@/lib/services/auth-service'

type LogoutButtonProps = {
  className?: string
}

export function LogoutButton({ className = '' }: LogoutButtonProps) {
  return (
    <button
      type="button"
      onClick={() => signOut()}
      className={`inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900 ${className}`.trim()}
    >
      Log out
    </button>
  )
}
