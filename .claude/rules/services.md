---
paths:
  - 'src/lib/services/**/*.ts'
---

# Service Conventions

## Universal Pattern

- All services use `'use server'` + import `'server-only'`
- Return type: `{ success: true; data: T } | { success: false; error: string }`
- Never throw — always return error objects

## Function Structure

1. Validate input with Zod schema (`.safeParse()`)
2. Check auth: `const userId = await getAuthUserId()` — return error if null
3. Create Supabase client: `const supabase = createClient()` (sync, singleton)
4. Execute Supabase query (filter by user_id where applicable)
5. Return `{ success, data/error }`

## Data Services

- `project-service.ts` — CRUD for projects (scoped to authenticated user)
- `module-service.ts` — CRUD for modules within a project
- `module-connection-service.ts` — Cross-module links
- `graph-service.ts` — Flow nodes/edges operations
- `chat-message-service.ts` — Persist chat history
- `profile-service.ts` — User profile operations

## AI Pipeline Services

- `llm-client.ts` — Streams Claude via `@anthropic-ai/sdk`, returns `ReadableStream<string>`
- `prompt-builder.ts` — Mode-based system prompts (discovery/module_map/module_detail)
- `llm-response-parser.ts` — Extracts `<operations>` XML tags from LLM response
- `graph-operation-executor.ts` — Switch dispatch executing parsed operations via services
- `file-tree.ts` — Derives file paths from `// file: <path>` comments in pseudocode
