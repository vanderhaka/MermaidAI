import { SignUp } from '@clerk/nextjs'
import { clerkPostAuthUrl, clerkSignInUrl, clerkSignUpUrl } from '@/lib/clerk'

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp
        path={clerkSignUpUrl}
        routing="path"
        signInUrl={clerkSignInUrl}
        fallbackRedirectUrl={clerkPostAuthUrl}
      />
    </div>
  )
}
