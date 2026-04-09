'use client'

import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768

export default function MobileGate({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (isMobile) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <div className="mx-auto max-w-sm space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gray-900 text-xl text-white">
            M
          </div>
          <h1 className="text-xl font-semibold text-gray-900">MermaidAI is built for desktop</h1>
          <p className="text-sm leading-relaxed text-gray-500">
            The canvas, sidebar, and chat panels need a larger screen to work properly. Please
            switch to a computer for the best experience.
          </p>
        </div>
      </main>
    )
  }

  return <>{children}</>
}
