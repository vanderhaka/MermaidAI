import { SignIn } from '@clerk/nextjs'
import { clerkPostAuthUrl, clerkSignInUrl, clerkSignUpUrl } from '@/lib/clerk'

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn
        path={clerkSignInUrl}
        routing="path"
        signUpUrl={clerkSignUpUrl}
        fallbackRedirectUrl={clerkPostAuthUrl}
      />
    </div>
  )
}
