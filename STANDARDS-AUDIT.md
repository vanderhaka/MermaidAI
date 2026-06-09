# Context7 Standards Audit — MermaidAI

**Date:** 2026-04-06
**Libraries scanned:** Next.js 16, Supabase SSR, @xyflow/react 12, @anthropic-ai/sdk 0.82, Zustand 5, Zod 4, Tailwind CSS 4, Vitest 4, Testing Library 16

---

## CRITICAL

- [x] **C1** — ~~Missing error boundaries~~ — FIXED: Created `error.tsx`, `not-found.tsx`, `global-error.tsx`, `loading.tsx` at root + dashboard `loading.tsx`.
- [x] **C2** — ~~Post-stream processing unreliable~~ — FIXED: Refactored to `TransformStream` with `flush()` for guaranteed post-stream execution.
- [x] **C3** — ~~Dead try/catch around `.stream()`~~ — FIXED: Removed dead try/catch, `.stream()` called directly.

## HIGH

- [x] **H1** — ~~No `revalidatePath()` after project mutations~~ — FIXED: Added `revalidatePath('/dashboard')` to create/update/delete.
- [x] **H2** — ~~Missing `try/catch` in Supabase server `setAll`~~ — FIXED: Wrapped in try/catch for Server Component read-only context.
- [x] **H3** — ~~Multiple services missing `getUser()` auth check~~ — FIXED: All service functions now verify auth via `getUser()`. Tests updated.
- [x] **H4** — ~~No `cancel()` handler~~ — FIXED: Added `cancel()` that calls `stream.abort()`.
- [x] **H5** — ~~Streaming error timing~~ — FIXED: `TransformStream` propagates errors correctly; `Connection` header removed.
- [x] **H6** — ~~`NodeProps` used without generic~~ — FIXED: All 7 nodes now use `NodeProps<Node<MyData, 'mytype'>>`. No more `as` casts.
- [x] **H7** — ~~StartNode/EndNode bypass `NodeProps`~~ — FIXED: Now use `NodeProps<T>` from @xyflow/react.

## MEDIUM

- [ ] **M1** — No `useActionState`/`useFormStatus` (auth/project forms) — Forms manage state manually instead of React 19 patterns.
- [x] **M2** — ~~Missing `import 'server-only'`~~ — FIXED: Added to project-service, module-service, profile-service.
- [x] **M3** — ~~Bare `.select()` returns all columns~~ — FIXED: All service queries now specify explicit column lists.
- [x] **M4** — ~~`profile-service.ts` accepts raw `userId`~~ — FIXED: Now resolves user from session, no userId param.
- [x] **M5** — ~~`EdgeProps` without generic~~ — FIXED: Now uses `EdgeProps<Edge<ConditionEdgeData, 'condition'>>`.
- [x] **M6** — ~~Loose `role: string` type~~ — FIXED: `callLLM` now accepts `Anthropic.MessageParam[]`.
- [x] **M7** — ~~`autoprefixer` unnecessary~~ — FIXED: Uninstalled.

## LOW

- [x] **L1** — ~~Empty `next.config.ts`~~ — FIXED: Added security headers (X-Frame-Options, nosniff, Referrer-Policy, HSTS).
- [x] **L2** — ~~`Connection: keep-alive` header~~ — FIXED: Removed.
- [x] **L3** — ~~Font via `className`~~ — FIXED: Switched to CSS variable + `@theme` block in `globals.css`.
- [x] **L4** — ~~`any` type in `mapRowToModule`~~ — FIXED: Now uses `Database['public']['Tables']['modules']['Row']`.
- [x] **L5** — ~~Middleware redirects don't propagate cookies~~ — FIXED: Redirect responses now copy cookies from middleware response.
- [x] **L6** — ~~Missing `'use client'`~~ — FIXED: Added to StartNode, EndNode, EntryNode, ExitNode.
- [ ] **L7** — `globals: true` kept in vitest config — removing it broke 18 test files that depend on implicit jest-dom matchers. Not worth the churn.
- [x] **L8** — ~~`.refine()` object form~~ — FIXED: Simplified to plain string in both schemas.

## CLEAN (no issues)

- [x] **Zustand v5** — Store creation, selectors, type patterns all correct.
- [x] **Zod v4** — Top-level functions (`z.email()`, `z.uuid()`), `.safeParse()`, error access all correct.
- [x] **Testing Library v16** — `userEvent.setup()`, query priority, auto-cleanup all correct.
- [x] **Tailwind CSS v4** — CSS-first config, `@tailwindcss/postcss` plugin, no legacy config.
