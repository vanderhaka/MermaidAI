---
paths:
  - 'src/app/api/**/*.ts'
---

# API Route Conventions

## Chat Endpoint (`api/chat/route.ts`)

- POST handler with Zod request validation (`chatRequestSchema`)
- Auth check via Clerk `auth()` before processing
- Returns streaming response with SSE headers

## Streaming Pattern

1. Authenticate via `auth()` from `@clerk/nextjs/server`
2. Validate request body with Zod
3. Build system prompt based on `mode` (discovery/module_map/module_detail)
4. Call `callLLM()` — returns `ReadableStream<string>`
5. Wrap stream to intercept full text on close
6. Post-stream: parse operations from `<operations>` XML, execute via services, persist messages
7. Return `new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })`

## Request Schema Shape

```typescript
{ projectId: string, message: string, mode: ChatMode, context: {...}, history?: [...] }
```

## Error Responses

- Validation errors: 400 with `{ error: string }`
- Auth errors: 401 with `{ error: 'Unauthorized' }`
- Server errors: 500 with generic message — never leak internals
