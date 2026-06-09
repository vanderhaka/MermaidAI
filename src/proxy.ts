import { NextResponse, type NextRequest } from 'next/server'
import { getUserWithDevAuth } from '@/lib/auth/dev-auth'
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware'

const PROTECTED_ROUTES = ['/dashboard']
const AUTH_ROUTES = ['/login', '/signup']

export async function proxy(request: NextRequest) {
  const { supabase, response } = createSupabaseMiddlewareClient(request)
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )

  const isAuthRoute = AUTH_ROUTES.includes(pathname)

  const {
    data: { user },
  } =
    isProtected || isAuthRoute ? await getUserWithDevAuth(supabase) : await supabase.auth.getUser()

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute && user) {
    const dashboardUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(dashboardUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
