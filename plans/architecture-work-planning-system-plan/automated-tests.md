# Automated Test Plan

## Purpose

Prove that the staged planning system is fast, source-bound, retry-safe, concurrency-safe, reversible at the latest turn, and backward compatible.

Tests should use RED -> GREEN -> REFACTOR for deterministic rules, state transitions, idempotency, concurrency, and undo. Use characterization tests for preserved behavior and acceptance-driven tests for UI.

## Phase 0: Contract and preservation tests

Add or extend tests for:

- new Full Design project routing;
- existing Architecture map refinement;
- Quick Capture flow and promotion;
- Flowchart and Brainstorm routing;
- module detail behavior;
- Stop, Retry, partial text, and changed-node highlights;
- legacy PRD rendering and download.

Required RED cases:

1. A detailed first brief currently enters discovery instead of creating Architecture.
2. A lower-level non-blocking unknown currently prevents a truthful high-level readiness outcome.
3. A blank project can currently present misleading readiness/export affordances.

Focused command:

```bash
npm test -- src/lib/services/prompt-builder.test.ts src/components/dashboard/project-workspace.test.tsx src/components/dashboard/scope-workspace.test.tsx src/app/api/chat/route.test.ts
```

## Phase 1: Schema, migration, RLS, and artifacts

### Migration cases

- Fresh local database applies every migration.
- Upgrade fixtures preserve `scope`, `architecture`, `flowchart`, and `brainstorm` projects.
- Existing `prd_content` and chat rows remain unchanged.
- Repeated lazy initialization creates one planning state and one Architecture artifact.
- Version allocation remains monotonic under concurrent calls.
- Artifact versions reject ordinary update/delete.
- Source version must belong to the same project.
- Invalid state and kind values fail database constraints.

### RLS cases

- Owner can read and write allowed planning state.
- Non-owner cannot select, insert, update, or delete any planning entity.
- A user cannot attach a version, decision, change set, operation, or handoff job to another user's project.
- Authenticated grants exist on the newly created tables/functions in a clean local stack.

### Artifact cases

- Active version pointer references the correct artifact.
- Work Plan source mismatch deterministically reports stale.
- Handoff source mismatch deterministically reports stale.
- Content hash is stable for semantically identical normalized content.

## Phase 2: Command, idempotency, concurrency, and undo

### Atomic operation cases

Inject a failure at every write position for:

- initial Architecture batch;
- module create/update/delete;
- module connection plus entry/exit updates;
- node and edge mutations;
- question create/resolve;
- decision or assumption changes.

Assert that either the entire operation commits or nothing commits.

### Idempotency cases

- Same operation ID and same request hash returns the original committed result.
- Same operation ID with different content fails.
- Retry after response loss creates no duplicate rows.
- Same chat message key creates one message.
- Replayed tool events do not double-apply client state.

### Concurrency cases

- Two clients submit from revision N; one commits N+1 and one receives stale conflict.
- A layout-only mutation advances the write-safety revision without creating a semantic Architecture version.
- Concurrent version allocation produces unique sequential versions.
- A handoff claim is owned by one request.
- A stale request cannot finalize a newer change set.

### Undo cases

- Latest create, update, delete, and cascade operations undo exactly.
- Delete undo restores module, nodes, edges, connections, and linked questions.
- Work Plan edit undo restores the previous active version.
- Undo increments revision and creates an auditable result.
- Undo refuses when a newer change exists.
- Repeated Undo request is idempotent.

## Phase 3: Architecture-first behavior

Use deterministic fixtures around prompt construction and mocked tool execution:

- Detailed salon-booking brief produces an immediate Architecture draft instruction.
- The prompt forbids re-asking already supplied actors.
- The first batch contains connected top-level capabilities and explicit assumptions.
- A vague brief asks one question and does not claim readiness.
- An existing map cannot call the wholesale replacement tool.
- Batch validation rejects duplicate local keys, broken connection references, and disconnected output without explanation.
- The client applies streamed rows only after committed tool data arrives.

Component cases:

- Send acknowledgement and truthful pending activity render without waiting for the model response.
- Provisional badge is visible after the first draft.
- Persisted receipt lists the committed changes.
- Stop/Retry and text input behavior remain unchanged.

## Phase 4: Readiness, decisions, and documents

Table-drive the complete readiness truth table:

| Scenario                                          | Expected state                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Blank project, zero questions                     | `draft`                                                             |
| Goal only, no meaningful Architecture             | `draft`                                                             |
| Connected map with one blocking question          | `needs_input`                                                       |
| Connected map with non-blocking deferred detail   | not blocked                                                         |
| Complete high-level map with proposed assumptions | `ready_with_assumptions` only after explicit acceptance for handoff |
| Complete map, no assumptions or blockers          | `ready`                                                             |
| Readiness report evaluated against older revision | invalid/stale report                                                |

Decision cases:

- Proposed assumption can be accepted, rejected, edited, and superseded.
- Rejected assumptions cannot appear as accepted Work Plan inputs.
- Coverage categories survive chat-history truncation.
- Auto-Decide produces a persisted proposed assumption, not only reply text.

Document cases:

- Empty staged Architecture Brief cannot download as if complete.
- Renderer output is deterministic for the same version.
- Legacy PRD output remains unchanged outside the feature.
- Repeated refinement does not append duplicate sections.

## Phase 5: Durable handoffs

Test both Quick Capture -> Architecture and Architecture -> Work Plan:

- Double-click reuses one job.
- Refresh during pending resumes the same job.
- Expired running claim can be reclaimed.
- Active claim cannot be stolen.
- Invalid model output marks failed and commits no target version.
- Retrying failed generation reuses the job contract and records attempts.
- Commit succeeds but HTTP response is lost; Retry returns the committed output.
- Source changes while generation runs; output is retained but immediately stale.
- `ready_with_assumptions` requires explicit acceptance recorded against the source.
- True blocker rejects generation with exact reasons.
- Quick Capture remains in its source mode until Architecture output commits.

## Phase 6: Work Plan

### Schema and generation cases

- Valid plan contains objective, non-goals, phases, slices, dependencies, acceptance, verification, risk, and source linkage.
- Every dependency references a slice in the same Work Plan.
- Self-dependency and cycles fail validation.
- Initial generation commits one complete immutable version.
- Invalid or incomplete generation cannot become active.
- Work Plan prompt receives exact Architecture content and first-class decisions.
- Work Plan tools cannot execute any graph mutation tool.

### Refinement cases

- Add, update, remove, reorder, and dependency changes create new versions.
- Old versions remain readable.
- Work Plan chat messages remain attached to one stable planning artifact across versions.
- Reload reproduces the same active plan and receipts.
- More than 30 chat turns still preserve early accepted decisions through durable context.

### Workspace cases

- Stage 2 does not load React Flow or the full live graph.
- Generating, failed, retry, stale, and ready states render correctly.
- Invalid stage URL never advances project state.
- Typed draft survives stage navigation where current chat behavior supports it.

## Phase 7: Review, partial turns, and staleness

- Completed receipt survives reload.
- Interrupted turn is `partial`, lists committed changes, and offers Review/Continue/Undo.
- Failed no-change turn cannot pretend changes landed.
- Latest-safe Undo updates UI and server state.
- Newer edit refusal explains the conflict.
- Semantic Architecture edit creates a new Architecture version and stales Work Plan.
- Layout-only position, viewport, or colour edit increments the safety revision but does not create an Architecture version or stale Work Plan.
- Refresh creates a new Work Plan version and preserves the prior one.
- Stale Work Plan cannot generate a current Execution Handoff.

## Phase 8: Execution Handoff

- Renderer is deterministic.
- Packet names exact Architecture and Work Plan versions.
- Packet contains objective, dependency order, acceptance, verification, assumptions, risks, rollback, blockers, and non-goals.
- Same source version generates one idempotent packet result.
- Work Plan edit stales the packet.
- No tool or route exposed to Stage 3 can create a task, edit a repo, run code, deploy, migrate, or mutate a provider.
- Preview, copy, and Markdown download work.

## Full regression commands

Run after every dependency-complete phase and before rollout:

```bash
npm run type-check
npm run lint
npm test
npm run build
```

Run focused browser support tests after UI phases:

```bash
npx playwright test e2e/planning-stages.spec.ts
```

Run database tests only against a verified isolated local Supabase target. Confirm the project directory, container labels, and ports before reset or migration commands. Never use a linked remote project for destructive reset tests.

## Performance instrumentation

Capture before and after:

- time from Send to first visible assistant/tool activity;
- time from Send to committed Architecture version;
- model continuation rounds;
- mutation RPC count;
- Architecture -> Work Plan completion time;
- handoff retry and failure rate;
- partial turn rate;
- latest-turn Undo success rate;
- stale conflict rate.

The first Architecture and Work Plan generation paths should each use one complete mutation commit. Set numeric SLAs only after measuring the current baseline and the first safe implementation.
