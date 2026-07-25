import { NextResponse, type NextRequest } from 'next/server'
import { getUserWithDevAuth } from '@/lib/auth/dev-auth'
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware'

const PROTECTED_ROUTES = ['/dashboard', '/share']
const AUTH_ROUTES = ['/login', '/signup']

/**
 * Redirects must carry any Set-Cookie headers already written to the pass-through
 * response (session refresh rotations, dev auth sign-in) — a bare
 * NextResponse.redirect() would silently drop them and desync the session.
 */
function redirectPreservingCookies(url: URL, response: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url)
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie)
  }
  return redirect
}

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
    return redirectPreservingCookies(new URL('/login', request.url), response)
  }

  if (isAuthRoute && user) {
    return redirectPreservingCookies(new URL('/dashboard', request.url), response)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
