# QA Review: Security Hardening

Manual verification cards for each fix. A non-technical tester follows these steps.

---

## Issue 1: History role enum

**Commit:** `4c212d4`
**Files changed:** `src/app/api/chat/route.ts`, `src/app/api/chat/route.test.ts`

### What changed

The `role` field in chat history entries now only accepts `"user"` or `"assistant"`. Previously any string was accepted, which could allow prompt injection via `"system"` role messages.

### How to verify

1. Open the app and navigate to a project chat
2. Send a normal message — it should work as before (response streams back)
3. Using a REST client (e.g. Postman), send a POST to `/api/chat` with a history entry containing `role: "system"` — expect a 400 response
4. Send a POST with `role: "admin"` — expect a 400 response
5. Send a POST with `role: "user"` in history — expect normal 200 streaming response
6. Send a POST with `role: "assistant"` in history — expect normal 200 streaming response

### Automated coverage

- 5 new tests in `src/app/api/chat/route.test.ts` covering all acceptance criteria
- Full suite: 613 tests passing

---

## Issue 2: Error sanitization covers all sensitive data sources

**Commit:** `0914299`
**Files changed:** `src/lib/services/llm-client.ts`, `src/lib/services/llm-client.test.ts`, `src/app/api/chat/route.ts`, `src/app/api/chat/route.test.ts`

### What changed

The `sanitizeError` function now redacts Anthropic API keys, Stripe keys (`sk_live_`, `sk_test_`), Supabase/Postgres connection strings (`postgresql://...`), absolute file paths (`/Users/...`, `/home/...`), IPv4 addresses, and internal hostnames with ports. The function is now exported and used in the chat route's catch block instead of raw `err.message`.

### How to verify

1. Open the app and navigate to a project chat
2. Send a normal message — it should work as before (response streams back)
3. Temporarily break the `ANTHROPIC_API_KEY` env var and send a chat message — the error response should say "LLM request failed" without revealing any API key, file path, or connection string
4. Check the browser network tab: the 500 response body should contain a generic error message, not internal details
5. Restore the env var and confirm chat works again

### Automated coverage

- 10 new tests in `src/lib/services/llm-client.test.ts` covering all sensitive data patterns
- 2 new tests in `src/app/api/chat/route.test.ts` verifying the route uses `sanitizeError`
- Full suite: 675 tests passing (8 pre-existing failures in `stream-parser.test.ts` from Issue 11 in progress)
