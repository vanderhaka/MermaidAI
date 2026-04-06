---
paths:
  - 'src/app/**/*.tsx'
  - 'src/app/**/*.ts'
---

# Route & Page Conventions

## Route Groups

- `sign-in/[[...sign-in]]/` — Clerk sign-in (catch-all)
- `sign-up/[[...sign-up]]/` — Clerk sign-up (catch-all)
- `(dashboard)/` — protected routes (authenticated)
- `api/` — API route handlers

## Page Pattern

- Pages are async server components by default
- Fetch data via service functions, pass to client components
- Example: `const result = await listProjectsByUser()` then render

## Layouts

- Root `layout.tsx` at `src/app/` — wraps entire app with `<ClerkProvider>`
- Header with `<Show when="signed-out/signed-in">` for auth UI
- Route group layouts for shared chrome

## Middleware

- `src/middleware.ts` uses `clerkMiddleware()` from `@clerk/nextjs/server`
- Protects `/dashboard` routes via `createRouteMatcher` + `auth.protect()`
