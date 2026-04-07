'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** If the URL was built with GET (?email=&password=), drop those params from history. */
export function StripSensitiveAuthQuery() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!searchParams.has('password') && !searchParams.has('email')) return
    const next = new URLSearchParams(searchParams.toString())
    next.delete('password')
    next.delete('email')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [pathname, router, searchParams])

  return null
}
