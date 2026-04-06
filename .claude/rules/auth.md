---
paths:
  - 'src/lib/auth.ts'
  - 'src/lib/supabase/**/*.ts'
  - 'src/middleware.ts'
  - 'src/app/sign-in/**/*.tsx'
  - 'src/app/sign-up/**/*.tsx'
---

# Auth Conventions

## Provider: Clerk (`@clerk/nextjs`)

## Middleware (`src/middleware.ts`)

- `clerkMiddleware()` from `@clerk/nextjs/server`
- Protects `/dashboard` routes via `createRouteMatcher` + `auth.protect()`

## Auth Helper (`src/lib/auth.ts`)

- `getAuthUserId()` — wraps Clerk's `auth()`, returns `userId` or `null`
- Used by all server-side services for authentication checks

## Layout (`src/app/layout.tsx`)

- `<ClerkProvider>` wraps the app inside `<body>`
- `<Show when="signed-out">` renders `<SignInButton>` / `<SignUpButton>`
- `<Show when="signed-in">` renders `<UserButton>`

## Sign-in/Sign-up Pages

- `app/sign-in/[[...sign-in]]/page.tsx` — Clerk's `<SignIn />` component
- `app/sign-up/[[...sign-up]]/page.tsx` — Clerk's `<SignUp />` component

## Auth in Services

- Every service calls `getAuthUserId()` — returns error if null
- Return `{ success: false, error: 'Not authenticated' }` if no user
- User ID comes from Clerk, NOT from Supabase

## Supabase (Database Only)

- Supabase client uses service role key — no cookie auth
- `src/lib/supabase/server.ts` — singleton, sync `createClient()`
- Services explicitly filter by `user_id` (RLS is bypassed with service role key)

## Env Vars

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — client-side
- `CLERK_SECRET_KEY` — server-side only
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
