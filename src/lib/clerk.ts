const DEFAULT_SIGN_IN_URL = '/sign-in'
const DEFAULT_SIGN_UP_URL = '/sign-up'
const DEFAULT_POST_AUTH_URL = '/dashboard'

function getPublicPath(value: string | undefined, fallback: string) {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : fallback
}

export const clerkSignInUrl = getPublicPath(
  process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
  DEFAULT_SIGN_IN_URL,
)

export const clerkSignUpUrl = getPublicPath(
  process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
  DEFAULT_SIGN_UP_URL,
)

export const clerkPostAuthUrl = DEFAULT_POST_AUTH_URL
