---
description: Project stack, tooling, and available CLIs.
---

# Stack

- **Framework:** Next.js 16 (App Router, Turbopack dev)
- **Language:** TypeScript 6 (strict mode)
- **UI:** React 19, Tailwind CSS 4, PostCSS
- **Canvas:** @xyflow/react 12 (React Flow), dagre (auto-layout)
- **State:** Zustand 5 (client)
- **Auth:** Clerk (@clerk/nextjs)
- **Backend:** Supabase (Postgres only, service role key — no Supabase Auth)
- **AI:** @anthropic-ai/sdk (Claude streaming)
- **Validation:** Zod 4
- **Hosting:** Vercel
- **Testing:** Vitest 4, React Testing Library, happy-dom/jsdom
- **Linting:** ESLint (eslint-config-next), Prettier, husky + lint-staged
- **Server Utils:** server-only package

# Available CLIs

vercel, supabase, gh, stripe, npx, pnpm, yarn, bun
