'use client'

import { signOut } from '@/lib/services/auth-service'

export function LogoutButton() {
  return <button onClick={() => signOut()}>Log out</button>
}
