import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { clerkPostAuthUrl, clerkSignInUrl, clerkSignUpUrl } from '@/lib/clerk'

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)'])

export default clerkMiddleware(
  async (auth, req) => {
    if (isProtectedRoute(req)) {
      await auth.protect()
    }
  },
  {
    signInUrl: clerkSignInUrl,
    signUpUrl: clerkSignUpUrl,
    afterSignInUrl: clerkPostAuthUrl,
    afterSignUpUrl: clerkPostAuthUrl,
  },
)

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
