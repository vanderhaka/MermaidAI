# Architecture to Work Planning System

Status: IMPLEMENTED AND LOCALLY VERIFIED; PRODUCTION ROLLOUT NOT STARTED

## Overview

MermaidAI should be a staged planning system, not one chat that tries to scope, architect, task, and execute at once.

The intended product flow is:

1. **Quick Capture (optional intake)**: capture a rough client or product conversation quickly.
2. **Architecture**: turn the brief into a high-level, connected picture of how the product works.
3. **Work Plan**: turn an exact Architecture version into detailed, dependency-ordered implementation slices.
4. **Execution Handoff**: render a reviewable implementation packet. This stage does not start coding or mutate any external system.

The Architecture stage must stay deliberately high-level. It should establish outcomes, actors, capabilities, boundaries, important flows, and material unknowns. It should not require file-level implementation detail or every internal module flow before it can finish.

The most important UX contract is:

`Describe the feature -> see a provisional architecture in the first useful turn -> refine only material gaps -> review readiness and assumptions -> create a version-bound Work Plan -> refine it -> export a safe execution handoff`

## Key Decisions

### 1. Keep product mode separate from planning stage

`ProjectMode` continues to mean `scope | architecture | flowchart | brainstorm`. Work Plan and Execution Handoff are downstream artifacts, not new project modes. This protects existing project creation, route selection, filters, and legacy records.

Stage navigation is non-destructive. Architecture remains available after a Work Plan exists. A query parameter may select the visible tab, but server-side artifact and readiness checks determine what is actually available.

### 2. Architecture builds before it interviews

A new Full Design project no longer routes a meaningful first brief into the current 3-6-question pre-build interview.

- A detailed brief creates a clearly provisional top-level map in the same turn, then asks at most one material follow-up.
- A genuinely vague brief may ask one high-value question before making claims it cannot support.
- Facts already present in the brief are not re-asked.
- Architecture refinement keeps using granular tools; an existing map is never silently replaced wholesale.

### 3. Readiness is explainable and stage-specific

Architecture readiness has four states:

- `draft`: meaningful architecture is incomplete.
- `needs_input`: at least one explicit blocker prevents a responsible handoff.
- `ready_with_assumptions`: the high-level architecture is coherent, with visible assumptions the user can accept for the handoff.
- `ready`: the high-level architecture is coherent and has no provisional assumptions affecting the Work Plan.

Zero open questions never means ready by itself. Detailed module internals are not required for Architecture readiness.

### 4. Downstream work always names an immutable source

Every Work Plan points to one exact immutable Architecture version. Every Execution Handoff points to one exact immutable Work Plan version.

If Architecture changes after Work Plan generation, the Work Plan becomes stale. It is preserved for comparison and can be refreshed into a new version; it is never silently rewritten. The same rule applies from Work Plan to Execution Handoff.

### 5. Use structured versioned artifacts, not prose as truth

The current graph tables remain the canonical live Architecture state. Immutable artifact versions snapshot that state for handoff, history, comparison, and staleness checks.

Work Plan content is structured and Zod-validated. Its shape includes:

- objective and non-goals;
- phases and vertical delivery slices;
- actor or trigger, observable outcome, and protected invariant;
- dependencies and ordering;
- acceptance criteria and verification commands;
- likely file, API, and data targets;
- risks, rollback notes, assumptions, and unresolved blockers.

The Work Plan is not an execution tracker in this release. It does not need normalized ticket-management tables or task completion status.

Existing `modules.prd_content` remains untouched for legacy projects. Under the staged workflow, Architecture Brief, Work Plan, and Execution Handoff Markdown are derived views of structured versions, not append-only canonical state.

### 6. Mutations are transactional, idempotent, and reviewable

Do not hold a database transaction open while waiting for a model. Model generation happens first; each validated mutation batch commits atomically afterwards.

Every mutating turn carries:

- stable `turnId` and `changeSetId`;
- unique operation ID and request hash;
- expected project planning revision;
- committed revision and persisted receipt;
- `completed | partial | failed | undone` status.

Retries with the same operation ID and identical input return the committed result. Reuse with different input fails. A stale expected revision returns a conflict instead of overwriting another tab.

The project planning revision protects every write, including layout-only edits. Architecture artifact versions advance only for semantic operations that can change downstream planning, such as capabilities, responsibilities, connections, flows, assumptions, constraints, or blockers. Position, viewport, and colour-only operations remain auditable but do not change the active Architecture source version or stale a Work Plan.

Undo is intentionally constrained in v1: only the latest contiguous change set can be undone when its committed revision is still the current revision. Arbitrary historical undo after newer edits is out of scope.

### 7. Handoffs are durable jobs

Quick Capture to Architecture and Architecture to Work Plan use the same server-backed handoff pattern:

- exact source artifact or snapshot;
- idempotency key;
- `pending | running | complete | failed` state;
- attempt count, claim expiry, safe error receipt, and output version;
- recovery after refresh or a lost response.

The existing `sessionStorage` marker may remain temporarily as flag-off compatibility, but it is not part of correctness.

### 8. Chat is evidence, not durable planning truth

Chat messages are linked to a stage, planning artifact, turn, and change set. Persisted artifact state, decisions, assumptions, readiness, and receipts are loaded into every prompt. The last 30 messages may still provide conversational tone, but an early accepted decision cannot disappear merely because it fell outside that window.

### 9. Stage 3 is a safety boundary

Execution Handoff only previews, reviews, copies, and downloads a deterministic packet. It cannot create a Codex task, edit code, create a branch, run a migration, deploy, or mutate a provider. Any future execution integration requires a separate product decision and explicit authorization model.

### 10. Speed is part of the product contract

The UI acknowledges Send and handoff actions locally in the next rendered frame, then shows a short truthful activity sequence such as `Finding actors -> Mapping capabilities -> Connecting handoffs`. It never waits on a model call before showing that work has started.

The first Architecture draft and first Work Plan each target one provider generation and one atomic commit. Phase 0 records the current p50/p95 baseline; the implementation sets completion budgets from that evidence and cannot ship if it adds confirmation rounds or a spinner-only dead zone. Safety and source binding are not traded for optimistic uncommitted graph state.

## Architecture Changes

### Data model

Additive schema only:

| Entity                       | Purpose                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_planning_states`    | Project write-safety revision, Auto-Decide preference, rolling summary cursor, and active artifact references. Separate from `projects.mode` and from semantic artifact version numbers. |
| `planning_artifacts`         | Stable container per project and kind: `architecture`, `work_plan`, or `execution_handoff`. Holds the active version pointer and current generation/status summary.                      |
| `planning_artifact_versions` | Immutable structured snapshot, monotonically allocated version, source version, readiness report, rendered Markdown, content hash, and provenance.                                       |
| `planning_decisions`         | First-class assumption, decision, or constraint with category, status, source turn, affected artifact/module, supersession, and readiness impact.                                        |
| `planning_change_sets`       | One manual edit or assistant turn, its base/final revision, status, before snapshot, receipt, and undo state.                                                                            |
| `planning_change_operations` | Finite affected-row before/after records, including delete cascades, for idempotency diagnostics and latest-turn undo. This is not the canonical state or a replay log.                  |
| `planning_handoff_jobs`      | Idempotent source-to-target generation request with claim expiry, retry state, safe error, and committed output version.                                                                 |

Extend existing tables additively:

- `open_questions`: add planning stage, blocking classification, and optional deferred stage.
- `chat_messages`: add stable turn/message keys, planning artifact linkage, stage, and change-set linkage. Continue using metadata for display receipts, not identity or correctness.

All tables require ownership-derived RLS, authenticated grants, foreign keys, check constraints, and indexes for project, artifact, source version, status, and idempotency lookups.

`planning_artifact_versions` is insert-only through application operations. Version numbers are allocated while the relevant planning state or artifact row is locked, never by client-side `max(version) + 1`.

### Domain services

Add focused services rather than continuing to grow the existing monolithic tool executor:

- `architecture-readiness.ts`: deterministic, explainable readiness evaluation.
- `planning-command-service.ts`: typed Architecture mutation batches, expected revision checks, idempotency, and receipts.
- `planning-artifact-service.ts`: artifact creation, immutable versioning, content hashes, source chains, and staleness.
- `planning-decision-service.ts`: assumptions, decisions, constraints, and coverage evidence.
- `planning-handoff-service.ts`: durable claim/generate/validate/commit/retry lifecycle.
- `change-set-service.ts`: finalization, recovery of abandoned turns, receipts, and latest-safe undo.
- `prompt-builder-work-plan.ts` and `planning-tools.ts`: isolated Stage 2 prompting and tools.
- `handoff-packet-renderer.ts`: deterministic Stage 3 output.

### User interface

Architecture gains:

- a stage rail showing Architecture, Work Plan, and Handoff availability;
- a provisional state on the first generated map;
- an always-visible compact readiness summary;
- a detail panel for coverage, blockers, assumptions, and decisions;
- persisted change receipts with Review and Undo actions;
- a truthful Create Work Plan CTA.

Work Plan gains:

- a dedicated workspace that does not hydrate React Flow;
- ordered phases and dependency-aware slices;
- visible acceptance and verification for each slice;
- separate Stage 2 chat using the exact source Architecture version;
- stale, generating, failed, and retry states;
- an explicit Create Handoff action only when the current Work Plan is ready.

Execution Handoff gains:

- exact Architecture and Work Plan version labels;
- objective, slices, dependencies, assumptions, risks, checks, rollback, and out-of-scope sections;
- preview, copy, and Markdown download only;
- visible stale state when Work Plan changes.

## Behavior Preservation Contract

Previous intended behavior to preserve:

- Quick Capture can capture a flow quickly and carry it into Full Design.
- Architecture chat can create and refine modules, module connections, flows, open questions, and readable requirements.
- Existing Architecture maps are never replaced without explicit user intent.
- Flowchart and Brainstorm modes continue to route, render, chat, and persist as they do now.
- Streaming tool activity, Stop, Retry, changed-node highlighting, module detail, graph layout, and legacy PRD export continue to work.
- Existing projects and chat history remain readable.

Intentional behavior changes:

- a useful first Architecture brief builds before asking redundant discovery questions;
- readiness becomes explicit and explainable;
- assumptions and decisions become durable records;
- mutating turns gain concurrency control, receipts, recovery, and latest-turn undo;
- handoffs become persisted, idempotent, retryable jobs;
- Work Plan and Execution Handoff become separate version-bound artifacts;
- staged document exports no longer depend on append-only PRD mutation.

Unsafe outcomes to prevent:

- treating an empty project as ready;
- overwriting newer work from another tab;
- duplicate modules, plans, or messages after Retry;
- losing a handoff on refresh;
- hiding partially committed AI changes;
- undoing through newer edits;
- silently updating a plan after its Architecture source changes;
- presenting an execution packet as authorization to execute.

## Implementation Phases

### Phase 0: Lock contracts and boundaries

Goal: make the intended staged behavior falsifiable before adding schema or UI.

#### Task 0.1: Characterize existing behavior

- Status: DONE
- Type: modify
- Files:
  - `src/lib/services/prompt-builder.test.ts`
  - `src/components/dashboard/project-workspace.test.tsx`
  - `src/components/dashboard/scope-workspace.test.tsx`
  - `src/app/api/chat/route.test.ts`
  - `src/lib/services/llm-tools-scoping.test.ts`
- Steps:
  1. Lock current Quick Capture, existing-map refinement, module detail, Flowchart, Brainstorm, streaming, Stop, Retry, and legacy PRD behavior.
  2. Add failing contract tests proving a meaningful first Full Design brief should not enter the old confirmation interview.
  3. Add a failing contract proving non-blocking lower-level questions can be deferred beyond Architecture.
  4. Record p50/p95 time to visible activity, first useful Architecture, provider rounds, and database commits for fixed detailed and vague fixtures.
- Verify: `npm test -- src/lib/services/prompt-builder.test.ts src/components/dashboard/project-workspace.test.tsx src/components/dashboard/scope-workspace.test.tsx src/app/api/chat/route.test.ts`
- Browser baseline (2026-09-02, isolated local data, one detailed salon-booking sample): visible `Thinking` acknowledgement within 341 ms; `/api/chat` completed in 5.2 s; the response asked the already-answered actor question; zero modules and two chat rows were committed. This is a before-state sample, not a p50/p95 claim.
- First Architecture implementation checkpoint (2026-09-02, same isolated local environment, one new detailed salon-booking sample): the optimistic user message and `Thinking` state rendered within 328 ms; one atomic change set committed five capabilities, ten connections, five assumptions, and one material blocker; reload-safe database state matched the canvas. The request took 51 s and exposed weak customer/staff ownership boundaries, which drove the Task 3 prompt and UX iteration. This is one diagnostic sample, not a performance percentile.
- Final Architecture first-turn proof (2026-09-02, fresh synthetic project in the Codex in-app browser): visible acknowledgement rendered in 278 ms; the single `/api/chat` round completed in 27.6 s; one atomic change set committed seven coherent capability boundaries, twelve handoffs, five reviewable assumptions, and exactly one material refund-policy question. Database read-back matched the UI and linked both chat rows to the committed change set. This is one representative sample, not a p50, p95, or product-SLA claim.
- Depends On: none
- Risk: Low

#### Task 0.2: Define planning contracts

- Status: DONE
- Type: create
- Files:
  - `src/types/planning.ts`
  - `src/lib/schemas/planning.ts`
  - `src/lib/planning/state-machine.ts`
  - `src/lib/planning/artifact-content.ts`
  - corresponding tests
- Steps:
  1. Define artifact kinds, readiness states, handoff states, decision states, change-set states, and source-version rules.
  2. Define validated Architecture snapshot, Work Plan, and Execution Handoff content.
  3. Make Stage 3 incapable of representing an execution action.
- Verify: focused schema/state-machine tests and `npm run type-check`
- Depends On: Task 0.1
- Risk: Medium

Rollback: remove only the new contract files and failing future-behavior tests. No runtime or data behavior changes in this phase.

### Phase 1: Add the versioning and safety foundation

Goal: establish additive ownership, version, idempotency, and recovery primitives before new AI mutation paths ship.

#### Task 1.1: Add planning schema and RLS

- Status: DONE
- Type: migration
- Files:
  - new additive file under `supabase/migrations/`
  - `src/types/database.ts`
  - `src/__tests__/migrations.test.ts`
  - `src/types/database.test.ts`
- Steps:
  1. Create the planning state, artifact, version, decision, change-set, operation, and handoff-job tables.
  2. Extend `open_questions` and `chat_messages` additively.
  3. Add RLS, explicit grants, indexes, immutable-version protections, uniqueness constraints, and source-chain checks.
  4. Add safe row-locking/version-allocation functions.
  5. Lazy-initialize existing Architecture projects as Architecture v1 draft when first opened under the feature flag. Do not initialize Flowchart or Brainstorm projects.
- Verify:
  - blank local migration apply;
  - representative upgrade fixture for every existing mode;
  - owner/non-owner RLS probes;
  - repeated lazy initialization returns one state and one Architecture artifact.
- Depends On: Task 0.2
- Risk: High

#### Task 1.2: Add artifact and planning-state services

- Status: DONE
- Type: create
- Files:
  - `src/lib/services/planning-state-service.ts`
  - `src/lib/services/planning-artifact-service.ts`
  - service tests
- Steps:
  1. Wrap all artifact/version allocation and active-pointer changes behind typed services.
  2. Derive staleness from immutable source-version IDs.
  3. Make identical initialization and version-creation retries idempotent.
- Verify: focused service tests plus migration/RLS integration tests
- Depends On: Task 1.1
- Risk: High

Rollback: disable the feature flag and deploy the previous application. Keep additive tables and user artifacts. Do not drop planning data or down-migrate.

### Phase 2: Centralize mutation, receipts, concurrency, and undo

Goal: make Stage 1 mutations safe before accelerating first-turn Architecture generation.

#### Task 2.1: Add the Architecture command boundary

- Status: DONE
- Type: create/refactor
- Files:
  - `src/lib/services/planning-command-service.ts`
  - `src/lib/services/change-set-service.ts`
  - `src/lib/services/graph-service.ts`
  - `src/lib/services/module-service.ts`
  - `src/lib/services/module-connection-service.ts`
  - `src/lib/services/open-question-service.ts`
  - new migration functions or RPCs in an additive migration
  - focused tests
- Steps:
  1. Accept only a finite validated set of Architecture operations.
  2. Classify each operation as semantic or presentation-only in the validated command type; clients cannot choose the classification dynamically.
  3. Lock planning state, check ownership and expected revision, enforce operation ID/request hash idempotency, and commit each batch atomically.
  4. Store affected-row before/after data, including cascades, then increment the write-safety revision exactly once.
  5. Create and activate a new Architecture artifact version only when the committed batch contains a semantic operation.
  6. Emit committed rows only after the transaction succeeds.
  7. Add latest-contiguous-change-set undo with revision protection.
- Verify:
  - duplicate-identical operation returns one result;
  - duplicate ID with different input fails;
  - injected failure at each write position rolls back the whole batch;
  - two tabs from one revision produce one commit and one stale conflict;
  - create/update/delete/cascade undo restores exactly the prior state.
- Completion proof (2026-09-02): initial capture, existing-map and flow refinement,
  and manual Add capability all use the audited command boundary. Disposable-database
  integration tests proved rollback, replay, latest-tip undo, least grants, and a
  two-client race with exactly one commit and one stale conflict.
- Depends On: Task 1.2
- Risk: High

#### Task 2.2: Carry durable turn identity through chat

- Status: DONE
- Type: modify
- Files:
  - `src/types/chat.ts`
  - `src/hooks/useChatStream.ts`
  - `src/app/api/chat/route.ts`
  - `src/lib/services/chat-message-service.ts`
  - `src/components/dashboard/tool-event-applier.ts`
  - related tests
- Steps:
  1. Create stable turn, message, change-set, and ordered operation IDs on send.
  2. Send expected revision with the request and persist stage/artifact linkage.
  3. Check unsuccessful chat-persistence results instead of only caught exceptions.
  4. Persist tool receipts and committed/partial state.
  5. Detect committed-but-unfinalized turns on project load and finalize them as partial before another handoff.
- Verify: route, hook, persistence, abort, Retry, refresh, and duplicate-message tests
- Completion proof (2026-09-02): committed-turn recovery persists the same compact
  `change_summary` used by the live receipt. Route, hook, abort, Retry, refresh,
  duplicate-message, and recovery tests are green.
- Depends On: Task 2.1
- Risk: High

Rollback: keep the old mutation path behind the feature flag. A rollback must not reinterpret or delete change sets already committed.

### Phase 3: Make Architecture start immediately and visibly

Goal: deliver the biggest UX improvement through one useful model round and one atomic commit.

#### Task 3.1: Add Architecture-start prompt and batch tool

- Status: DONE
- Type: modify/create
- Files:
  - `src/types/chat.ts`
  - `src/components/dashboard/project-workspace.tsx`
  - `src/lib/services/prompt-builder.ts`
  - `src/lib/services/llm-tools.ts`
  - new `src/lib/services/architecture-service.ts`
  - `src/components/dashboard/tool-event-applier.ts`
  - corresponding tests
- Steps:
  1. Route a zero-module Full Design project to an Architecture-start contract, not the current discovery confirmation contract.
  2. Add `capture_architecture_map`, accepting local module keys, all initial modules, connections, known assumptions, and material questions.
  3. Validate and commit the complete draft through the command boundary in one batch.
  4. Stream the committed result so the provisional map appears immediately.
  5. Keep granular tools for later refinement.
- Verify:
  - a salon-booking fixture builds customer, staff, booking, availability, deposit/payment, and communication capabilities without re-asking who uses it;
  - a vague fixture asks one useful question and makes no unsupported readiness claim;
  - an existing map is refined, not replaced;
  - client state matches the committed server result after Stop or refresh.
- Completion proof (2026-09-02): the fresh in-app browser salon journey produced
  Service Catalog, Staff Management, Availability & Scheduling, Booking
  Management, Deposits & Payments, Booking Policy Management, and Booking
  Notifications in one provider round, with twelve explicit handoffs and one
  material refund-policy question. The persisted result was one atomic change
  set with 26 ordered operations and a schema-v2 readiness report.
- Depends On: Task 2.2
- Risk: High

#### Task 3.2: Add provisional and first-turn UX

- Status: DONE
- Type: modify
- Files:
  - `src/components/dashboard/project-workspace.tsx`
  - new focused provisional-state component if needed
  - component tests
- Steps:
  1. Label the first generated map provisional until readiness is evaluated.
  2. Acknowledge Send locally in the next rendered frame and show a truthful activity sequence while generation is pending.
  3. Show a compact persisted receipt such as `Created 6 capabilities · Connected 5 handoffs · Recorded 2 assumptions`.
  4. Keep chat input responsive and preserve Stop/Retry behavior.
- Verify: component tests and Codex in-app browser smoke on the real dev UI
- Completion proof (2026-09-02): Send produced a truthful visible acknowledgement
  in 278 ms while generation continued; the composer remained usable; the
  provisional result, compact receipt, assumption controls, readiness checks,
  and blocker were visible after commit. Draft text also survived navigation
  from Architecture to Work Plan and back in both automated Chrome and the
  mandatory in-app browser smoke.
- Depends On: Task 3.1
- Risk: Medium

Rollback: restore the old routing while retaining the safe command foundation and committed artifact versions.

### Phase 4: Add trustworthy readiness, assumptions, and derived Architecture Brief

Goal: tell the user exactly what is known, assumed, blocked, and ready for Work Plan generation.

#### Task 4.1: Persist decisions and calculate readiness

- Status: DONE
- Type: create/modify
- Files:
  - `src/lib/services/planning-decision-service.ts`
  - `src/lib/services/architecture-readiness.ts`
  - `src/lib/services/prompt-sections.ts`
  - `src/lib/services/chat-context-loader.ts`
  - `src/lib/schemas/open-question.ts`
  - related services and tests
- Steps:
  1. Convert Auto-Decide outputs into first-class proposed assumptions with category, provenance, and readiness impact.
  2. Classify open questions as blocking, non-blocking, or deferred to Work Plan.
  3. Evaluate high-level outcome, modules and purposes, important connections, actor-to-outcome flow, business boundaries, coverage decisions, and blockers.
  4. Persist the explainable report against the exact Architecture version.
  5. Move Auto-Decide preference from browser-only state to project planning state while preserving the current default.
- Verify: readiness truth-table tests, including blank project, zero questions but incomplete map, disconnected map, blocker, accepted assumptions, and fully confirmed Architecture
- Depends On: Task 3.1
- Risk: High

#### Task 4.2: Build the readiness and decision UX

- Status: DONE
- Type: create/modify
- Files:
  - new `src/components/dashboard/architecture-readiness-panel.tsx`
  - new `src/components/dashboard/planning-decisions-panel.tsx`
  - `src/components/dashboard/project-workspace.tsx`
  - `src/components/dashboard/PrdPreviewPanel.tsx`
  - new Architecture Brief renderer and tests
- Steps:
  1. Show the compact status in the workspace header and details in a panel.
  2. Let users accept, reject, edit, or supersede assumptions.
  3. Replace misleading empty export with exact missing-readiness guidance.
  4. Render the staged Architecture Brief from the active version while retaining legacy PRD behavior outside the feature.
- Verify: component tests, renderer tests, accessible keyboard flow, and in-app browser states for draft, needs input, ready with assumptions, and ready
- Depends On: Task 4.1
- Risk: Medium

Rollback: hide the panels and staged export under the feature flag. Persisted decisions and reports remain harmless additive data.

### Phase 5: Replace lossy handoffs and add stage navigation

Goal: make Quick Capture to Architecture and Architecture to Work Plan durable, retryable transitions.

#### Task 5.1: Add the handoff job lifecycle

- Status: DONE
- Type: create/refactor
- Files:
  - `src/lib/services/planning-handoff-service.ts`
  - new handoff API route(s)
  - `src/lib/scope-handoff.ts`
  - `src/components/dashboard/scope-workspace.tsx`
  - `src/components/dashboard/project-workspace.tsx`
  - handoff tests
- Steps:
  1. Persist or reuse a job before generation starts.
  2. Atomically claim it with a bounded expiry, generate outside the transaction, validate output, then atomically commit the output version and complete the job.
  3. Resume pending or expired-running jobs after reload.
  4. Return a previously committed result after a lost response.
  5. Change Quick Capture mode only after its Architecture handoff commits successfully.
  6. Keep failed input and source state intact for Retry.
- Verify: double-click, reload, lost response, expired claim, invalid model output, source change during generation, and retry idempotency tests
- Depends On: Tasks 4.1 and 2.2
- Risk: High

#### Task 5.2: Add non-destructive stage navigation

- Status: DONE
- Type: create/modify
- Files:
  - new `src/components/dashboard/planning-stage-nav.tsx`
  - `src/app/(dashboard)/dashboard/[projectId]/page.tsx`
  - `src/components/dashboard/project-workspace.tsx`
  - route/component tests
- Steps:
  1. Show Architecture, Work Plan, and Handoff availability from server-loaded artifacts.
  2. Treat URL stage selection as navigation only.
  3. Render explanatory unavailable, generating, failed, and stale states.
  4. Allow return to Architecture at any time.
- Verify: route tests and in-app browser refresh/deep-link tests
- Depends On: Task 5.1
- Risk: Medium

Rollback: retain legacy `sessionStorage` behavior only for the flag-off path during the observation window. The persisted job remains authoritative under the staged feature.

### Phase 6: Generate and refine the structured Work Plan

Goal: turn one exact ready Architecture version into a detailed, inspectable implementation plan.

#### Task 6.1: Add Stage 2 prompt, context, and tools

- Status: DONE
- Type: create/modify
- Files:
  - `src/types/chat.ts`
  - `src/app/api/chat/route.ts`
  - `src/lib/services/chat-context-loader.ts`
  - new `src/lib/services/prompt-builder-work-plan.ts`
  - new `src/lib/services/planning-tools.ts`
  - new `src/components/dashboard/planning-tool-event-applier.ts`
  - related tests
- Steps:
  1. Add a dedicated Work Plan chat mode and tool set with no graph mutation tools.
  2. Generate the first plan as one complete, validated structured artifact version.
  3. Use finite plan-edit commands for later refinement; each accepted edit creates a new immutable Work Plan version.
  4. Load the frozen Architecture source, active Work Plan, decisions, and durable summary into every prompt.
  5. Separate chat history by planning artifact.
- Verify:
  - the generated plan is a valid DAG;
  - every slice has outcome, invariant, acceptance, verification, risk, and source linkage;
  - invalid or partial output never becomes the active plan;
  - Stage 2 tools cannot change Architecture tables;
  - a conversation longer than 30 messages still retains early accepted decisions.
- Depends On: Task 5.1
- Risk: High

#### Task 6.2: Build the Work Plan workspace

- Status: DONE
- Type: create
- Files:
  - new `src/components/dashboard/work-plan-workspace.tsx`
  - new focused Work Plan components and tests
  - reuse `src/components/chat/FloatingChat.tsx`
- Steps:
  1. Render phases and dependency-ready slices without loading the React Flow canvas.
  2. Show `Based on Architecture vN`, readiness, assumptions, blockers, and source freshness.
  3. Support plan refinement through chat and persisted receipts.
  4. Preserve typed drafts across stage navigation and generation refreshes.
- Verify: component tests, narrow and desktop layouts, and in-app browser generation/refinement/reload flow
- Depends On: Task 6.1
- Risk: Medium

Rollback: hide Work Plan navigation under the feature flag. Existing Architecture remains usable; generated artifacts stay stored.

### Phase 7: Complete review, undo, staleness, and recovery UX

Goal: make AI planning changes understandable and safely reversible.

#### Task 7.1: Add reusable change review and Undo UI

- Status: DONE
- Type: create/modify
- Files:
  - new `src/components/planning/change-receipt.tsx`
  - new `src/components/planning/change-review-panel.tsx`
  - `src/components/chat/ChatMessageList.tsx`
  - Architecture and Work Plan workspaces
  - component and service tests
- Steps:
  1. Persist and display created, updated, deleted, assumed, and resolved counts.
  2. Show partial turns as `Review · Continue · Undo` rather than a generic failure.
  3. Undo only when the change set is still the current tip.
  4. Explain stale conflicts and preserve newer work.
- Verify: reload persistence, interrupted turn, latest undo, newer-edit refusal, and keyboard/accessibility tests
- Depends On: Tasks 2.2 and 6.2
- Risk: High

#### Task 7.2: Add source comparison and refresh

- Status: DONE
- Type: create/modify
- Files:
  - artifact/change-set services
  - Work Plan workspace and tests
- Steps:
  1. Mark Work Plan stale by comparing its source Architecture version ID to the active semantic Architecture version ID, never the all-write safety revision.
  2. Show a concise source diff and offer Refresh into a new version.
  3. Preserve the old Work Plan version for review.
  4. Block stale Work Plans from producing a fresh Execution Handoff.
- Verify: semantic Architecture edit, layout-only edit, stale transition, compare, refresh, and preserved-old-version tests
- Depends On: Task 7.1
- Risk: High

Rollback: review and stale state remain server-correct even if the richer panels are hidden. Never force a stale artifact to appear current during rollback.

### Phase 8: Add deterministic Execution Handoff

Goal: turn a fresh ready Work Plan into a clear packet without authorizing or initiating implementation.

#### Task 8.1: Build renderer and artifact service

- Status: DONE
- Type: create
- Files:
  - new `src/lib/services/handoff-packet-renderer.ts`
  - new `src/lib/services/handoff-packet-service.ts`
  - renderer/service tests
- Steps:
  1. Render objective, non-goals, exact source versions, dependency order, slice contracts, checks, assumptions, risks, rollback, and unresolved blockers.
  2. Generate deterministically from the exact Work Plan version.
  3. Commit idempotently as an Execution Handoff artifact version.
  4. Mark it stale when Work Plan source changes.
- Verify: deterministic output, idempotency, source labels, stale detection, and explicit non-authorization wording
- Depends On: Task 7.2
- Risk: Medium

#### Task 8.2: Add review and export UI

- Status: DONE
- Type: create
- Files:
  - new `src/components/dashboard/execution-handoff-workspace.tsx`
  - reuse safe preview/download helpers where appropriate
  - component/e2e tests
- Steps:
  1. Preview, copy, and download Markdown.
  2. Expose no action capable of starting implementation.
  3. Show stale or blocked state explicitly.
- Verify: component tests and in-app browser preview/copy/download flow
- Depends On: Task 8.1
- Risk: Low

Rollback: hide the Handoff stage. Stored packets remain immutable and recoverable.

### Phase 9: Roll out and prove the complete system

Goal: enable the staged workflow without destabilizing existing modes or projects.

#### Task 9.1: Feature-flag rollout and compatibility

- Status: READY FOR RELEASE
- Type: modify
- Files:
  - `src/lib/config.ts` or a new focused planning feature-config module
  - project route/loaders
  - compatibility tests
- Steps:
  1. Deploy schema first, compatible code second, then enable the staged workflow.
  2. Start with new/internal Architecture projects.
  3. Lazy-initialize existing Architecture projects only when opened under the feature.
  4. Keep Scope, Flowchart, Brainstorm, legacy PRD, and old routes working.
  5. Retain the old handoff code until the observation window passes.
  6. Persist a server-visible staged-workflow rollout discriminator before
     tightening Architecture write policies. Staged projects must deny direct
     authenticated DML and mutate through audited RPCs, while flag-off legacy
     Full Design projects remain compatible during the observation window.
- Verify: old/new app compatibility, every project mode, feature on/off, and representative existing Architecture records
- Release note (2026-09-02): rollout controls, lazy initialization, and flag-on/
  flag-off compatibility are implemented and locally verified. Production stays
  off by default. No production migration, deployment, feature activation, or
  observation-window cutover was performed as part of this implementation.
- Depends On: Tasks 8.2 and all regression suites
- Risk: High

#### Task 9.2: Full proof and performance comparison

- Status: DONE
- Type: verification
- Files:
  - new focused E2E specs under `e2e/`
  - no production mutation
- Steps:
  1. Run all automated checks.
  2. Run the complete staged journey in the Codex in-app browser with isolated synthetic data.
  3. Measure time to first visible activity, first committed Architecture, Work Plan completion, provider rounds, database commits, handoff retries, partial turns, undo success, and stale conflicts.
  4. Compare against the current baseline before setting a product SLA.
- Verify:
  - `npm run type-check`
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - focused Playwright suite
  - in-app browser evidence
- Completion proof (2026-09-02): lint, type-check, production build, and the full
  1,517-test suite passed. A disposable Supabase stack applied the complete
  migration chain from blank twice; the three plain-SQL integration smoke tests
  passed through `psql`; and the two-client concurrency runner produced exactly
  one commit and one stale conflict. The complete Architecture -> Work Plan ->
  Execution Handoff journey passed in the Codex in-app browser, including failed
  retry recovery, exact-version undo, deterministic copy/download, and immutable
  source-chain read-back. Headless desktop route checks found no horizontal
  overflow or clipped controls; warm server responses were 173-269 ms across the
  three stages. At 375 x 812, every stage intentionally showed the existing
  desktop-product handoff without overflow. The fresh first-turn sample reached
  visible activity in 278 ms and committed in one 27.6 s provider round. These
  measurements are representative evidence only, not p50, p95, or an SLA.
- Depends On: Task 9.1
- Risk: Medium

Rollback: feature flag off plus previous application version. Additive schema and user artifacts remain. No destructive down-migration.

## Dependencies

```text
P0 Contracts
  -> P1 Additive schema and artifact services
    -> P2 Transactional commands, turn identity, receipts, undo foundation
      -> P3 Architecture-first generation
        -> P4 Readiness, decisions, derived Architecture Brief
          -> P5 Durable handoffs and stage navigation
            -> P6 Structured Work Plan
              -> P7 Review, undo, staleness, refresh
                -> P8 Deterministic Execution Handoff
                  -> P9 Rollout and full proof
```

Migration work, shared chat contracts, and database integration tests are serialized. Within a phase, pure schema tests, isolated UI components, and deterministic renderers may run in parallel when their files and state are disjoint.

## Risks and Mitigations

| Risk                                                        | Mitigation                                                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The trust layer delays the visible UX win                   | Deliver the thin Architecture-first vertical slice immediately after the minimum revision/idempotency foundation; do not build a generic workflow engine. |
| Generic artifact versions duplicate live Architecture state | Treat normalized graph tables as current Stage 1 truth and immutable versions only as exact snapshots for source binding, history, and handoff.           |
| JSONB Work Plan becomes an untyped blob                     | Validate every version with a strict Zod schema and finite edit commands; never accept arbitrary JSON patches.                                            |
| A model turn partially mutates state                        | Commit each validated batch atomically, mark the overall turn partial if later batches fail, persist a receipt, and allow latest-safe undo.               |
| Concurrent tabs overwrite each other                        | Expected revision, locked state row, unique operation ID, request hash, and clear stale-conflict UX.                                                      |
| Handoff finishes after its source changes                   | Preserve the valid output but mark it stale immediately through source-version comparison.                                                                |
| Existing projects or modes regress                          | Additive schema, lazy Architecture-only initialization, flag-off compatibility, characterization tests, and full mode/browser regression.                 |
| PRD migration loses authored content                        | Never rewrite or delete legacy `prd_content`; render staged documents separately and import legacy text only as read-only context where needed.           |
| Undo removes later work                                     | Permit direct undo only at the current tip; otherwise refuse and explain.                                                                                 |
| Stage 3 is mistaken for implementation approval             | No execution tools or actions, exact source versions, explicit non-authorization state, and preview/copy/download only.                                   |

## Acceptance Criteria

- A meaningful first Full Design brief creates a provisional connected Architecture before asking a redundant question.
- Send and handoff actions visibly acknowledge immediately; first Architecture and Work Plan generation avoid spinner-only dead time and complete in one provider round and one atomic commit under the measured happy path.
- Architecture stays high-level and can be ready while clearly deferred implementation detail remains.
- Blank or structurally incomplete projects cannot appear ready or export a misleading staged document.
- Every assumption, decision, blocker, and readiness check is visible and durable.
- Every mutating planning turn has a persisted, reload-safe receipt and safe partial state.
- Duplicate retries do not duplicate messages, modules, plans, or packets.
- Concurrent stale writes fail without lost updates.
- Latest-turn undo works across create, update, delete, cascade, and Work Plan version changes; it refuses after newer edits.
- Quick Capture to Architecture survives refresh, failure, and Retry without relying on `sessionStorage`.
- Work Plan generation names and freezes one Architecture version.
- Stage 2 produces dependency-ordered implementation slices with acceptance and verification, without mutating Architecture.
- An Architecture change marks the Work Plan stale and preserves both old and refreshed versions.
- Position, viewport, and colour-only edits remain concurrency-safe and auditable without staling the Work Plan.
- Execution Handoff names exact source versions and cannot start implementation.
- Existing Scope, Architecture, Flowchart, Brainstorm, chat, canvas, and legacy PRD behaviors pass regression checks.
- The complete journey is proven in the Codex in-app browser on desktop and narrow viewports with no unexpected console or network errors.

## Open Questions

No blocking product decision remains for implementation planning.

Deferred choices:

- Whether a future Stage 3 action should create a Codex task or external ticket. This release deliberately does not.
- Whether users eventually need multiple competing active Work Plans. This release keeps one active versioned Work Plan while preserving prior versions.
- Whether collaborative multi-user editing requires merge semantics. Current ownership remains single-user and stale conflicts are explicit.
