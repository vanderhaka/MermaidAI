# Feature Plan: MermaidAI Maintainability Cleanup

Status: READY
Last updated: 2026-06-08
Owner: feature-orchestrator

## Working Brief

- Feature: Reduce the Fallow-reported risk in MermaidAI's chat, tool, PRD-rendering, edge-routing, and workspace event surfaces without changing user-visible product behavior.
- Primary actors: product user, assistant chat, LLM tool runner, PRD export flow, React Flow canvas, Quick Capture workspace, Full Design workspace, future maintainers.
- Core invariant: maintainability cleanup must preserve the current intended scope-truth behavior; refactors cannot change persisted project state, chat/tool semantics, open-question resolution, graph integrity warnings, PRD output, or canvas edge rendering.
- Previous intended behaviors:
  - Quick Capture and Flowchart chat route to the correct prompt/tool mode.
  - Selected open questions carry the persisted question ID through chat and cannot resolve from a click-only prompt.
  - Assistant streams persist user and assistant messages while stripping tool events from saved text.
  - Tool events update modules, nodes, edges, PRD content, and open questions on the client.
  - PRD export renders module flow, dependencies, and open/resolved questions.
  - Canvas edges render explicit ELK sections, rounded orthogonal paths, labels, hover affordances, and decision branch styling.
  - The board, floating chat, drawer, and Requirements panel remain usable after tool events.
- Intentional behavior changes:
  - Internal helper exports may become private where repo reference proof shows no external consumers.
  - Large route/tool/component handlers may be split into smaller pure helpers with the same public contracts.
  - Missing characterization tests may be added around PRD rendering, edge routing, and Full Design workspace tool events.
  - Fallow scores should improve only as a consequence of safer structure, not by deleting behavior.
- Unsafe outcomes:
  - Losing selected-question identity or reintroducing click-only resolution.
  - Changing `/api/chat` auth, validation, rate-limit, streaming, prompt hydration, tool selection, or persistence semantics.
  - Dropping graph invariant warnings or hiding tool failures.
  - Changing PRD markdown in a way that loses flow, dependency, or question content.
  - Breaking canvas edge paths, labels, hitboxes, or hover styles.
  - Mutating current project rows or running destructive/live data repair as part of a refactor.
  - Refactoring across the existing dirty scope-truth work without exact write boundaries.
- Evidence:
  - Fallow report flags `src/lib/services/prd-renderers.ts`, `src/app/api/chat/route.ts`, `src/lib/canvas/edge-routing.ts`, `src/store/graph-store.ts`, `src/components/dashboard/project-workspace.tsx`, `src/components/dashboard/scope-workspace.tsx`, `src/lib/services/llm-tools.ts`, and `src/lib/canvas/graph-invariants.ts`.
  - `plans/scope-truth-flow-graph/progress.md` marks S1-S8 and S10 complete with focused tests, type-check, lint, and browser proof; only S9 live data repair remains blocked.
  - Current working tree is dirty across the scope/chat/canvas files from the prior slice, so implementation must preserve unrelated edits and use exact write sets.
  - Source inspection shows PRD renderer and edge-routing reports are mostly exported helper surface, while chat route, LLM tools, and workspace files contain large orchestration handlers.
  - Read-only agent inspection found `project-workspace.tsx` lacks direct component test coverage, so Full Design workspace extraction must add coverage before or with the refactor.
- Assumptions:
  - This plan is a follow-on maintainability slice, not approval to repair the live current-project data blocked in `scope-truth-flow-graph` S9.
  - No schema migration is expected. If a worker discovers one is required, it must add a new single-threaded migration node before implementation continues.
  - Current Fallow binary cache is diagnostic input only. Fresh Fallow output should be gathered during final verification if the CLI is available.
  - Browser proof should use the in-app browser against `http://127.0.0.1:3000` when the local dev server is available.
- Out of scope:
  - Live project data repair.
  - Auth provider or model/provider configuration changes.
  - Production deploy.
  - Package upgrades or lockfile edits.
  - Broad UI redesign.
  - Rewriting graph storage or splitting `src/store/graph-store.ts` unless a node later proves it is necessary.
  - Refactoring the 1302-line stress spec unless it blocks the focused implementation or verification.

## Risk Classification

- Overall tier: T1, because the cleanup touches chat/tool mutation paths that can alter persisted planning state if behavior drifts.
- Live-data risk: Low for planned code changes; live-data repair remains out of scope and blocked in the prior plan.
- Migration risk: Low; no migration is expected. Any discovered migration becomes a new single-threaded node.
- External-contract risk: Medium; the chat API body, prompt modes, LLM tool schema, stream parser events, and client tool-event payloads must stay aligned.

## Dependency Graph

| Node | Title                                                | Tier | Depends On         | Parallel Group | Shared-State Risk                              | Status  |
| ---- | ---------------------------------------------------- | ---- | ------------------ | -------------- | ---------------------------------------------- | ------- |
| M1   | Baseline and write-boundary guard                    | T1   | none               | W1-A           | dirty working tree, shared tests               | PENDING |
| M2   | PRD renderer export and characterization cleanup     | T2   | M1                 | W2-A           | PRD markdown output                            | PENDING |
| M3   | Edge-routing export and characterization cleanup     | T2   | M1                 | W2-B           | canvas path geometry and hover styles          | PENDING |
| M4   | Chat route orchestration extraction                  | T1   | M1                 | W2-C           | `/api/chat` contract and streaming persistence | PENDING |
| M5   | LLM tool executor decomposition                      | T1   | M1                 | W2-D           | graph and open-question mutation semantics     | PENDING |
| M6   | Workspace tool-event applier extraction              | T1   | M1                 | W2-E           | client graph store updates in two workspaces   | PENDING |
| M7   | Fallow calibration, focused proof, and browser smoke | T1   | M2, M3, M4, M5, M6 | W3-A           | verification only                              | PENDING |

## Dependency Waves

- W1: M1 runs first. It snapshots the dirty tree, confirms baseline focused tests, and defines exact write ownership for all workers.
- W2: M2, M3, M4, M5, and M6 are parallel-safe only if workers keep their assigned write sets. M4 and M5 may run in parallel because one owns route orchestration and the other owns tool execution, but the integrator must rerun the combined chat/tool tests.
- W3: M7 runs after all code nodes. It owns final verification, Fallow comparison, in-app browser smoke, and behavior-preservation confidence.

## Nodes

### M1 - Baseline and write-boundary guard

Status: PENDING
Tier: T1
Type: ops
Actor/trigger: Orchestrator starts the maintainability cleanup.
Behavior to test: N/A - this is a baseline and shared-state guard node.
Invariant protected: cleanup starts from a known dirty-tree state and does not accidentally revert or overwrite prior scope-truth work.
Intentional behavior changes: none.
Previous intended behaviors preserved: all current scope-truth behavior from the prior plan remains the baseline.
Unsafe outcomes: treating unrelated dirty files as cleanup output, mixing live data repair with refactor work, trusting stale test/Fallow output, editing package locks.
Dependencies: none.
Expected files:

- `plans/maintainability-cleanup/progress.md`
- Optional `plans/maintainability-cleanup/agent-runs/*.md` evidence files if workers are launched.
  Write boundaries: planning/progress artifacts only; no source edits.
  Acceptance criteria:
- [ ] Record current `git status --short` before edits.
- [ ] Confirm the prior `scope-truth-flow-graph` S9 data repair remains out of scope.
- [ ] Run or explicitly defer the focused baseline tests that protect scope truth.
- [ ] Assign exact write sets before launching any workers.
      Regression guards:
- No source file changes in this node.
- No DB writes or migrations in this node.
  RGR:
- RED: identify currently modified source files and any missing tests that make refactor unsafe.
- GREEN: document write boundaries and baseline command plan.
- REFACTOR: keep plan/progress artifacts concise and worker-ready.
  Gates:
- Repo gate: `git status --short`; preferably `npm run type-check`, `npm run lint`, and the focused scope-truth vitest command before code edits.
- Browser gate: not required for this ops node.
- Boundary/migration gate: no DB writes; no migration.
  External docs needed: none.
  Parallelization: blocking; must run before code workers.
  Worker role: orchestrator only.
  Exit evidence: status snapshot, baseline commands run or skipped with reason, and write boundaries listed in progress.
  Blocked on: none.

### M2 - PRD renderer export and characterization cleanup

Status: PENDING
Tier: T2
Type: refactor
Actor/trigger: User exports or previews project requirements.
Behavior to test: When PRD files are generated, then module flow, dependency, open-question, and resolved-question sections render the same content before and after helper export cleanup.
Invariant protected: PRD output remains semantically unchanged.
Intentional behavior changes: internal-only helper exports in `prd-renderers.ts` may become private; characterization tests may be added.
Previous intended behaviors preserved: `generatePrdFiles` and `generateSinglePrd` continue using `renderModulePrd`; markdown keeps headings, step numbering, branch labels, dependencies, and question checklists.
Unsafe outcomes: deleting helper bodies that `renderModulePrd` uses, changing markdown enough to break downloads or summaries, losing resolved question resolutions.
Dependencies: M1.
Expected files:

- `src/lib/services/prd-renderers.ts`
- `src/lib/services/prd-renderers.test.ts` if missing and needed
- `src/lib/services/prd-export-service.test.ts` if generated file behavior is easier to characterize there
  Write boundaries: do not edit chat route, LLM tools, canvas edges, graph services, or workspace components.
  Acceptance criteria:
- [ ] Reference scan proves which `prd-renderers.ts` exports are external API and which are internal-only.
- [ ] `renderModulePrd` remains exported and consumed by `prd-export-service.ts`.
- [ ] Internal-only helpers are de-exported or left alone with a reason.
- [ ] Tests cover flow ordering from start/entry nodes, branch labels, disconnected non-end nodes, module scoping, dependencies, open/resolved questions, and `skipHeader`.
      Regression guards:
- PRD generation for single-module and multi-module projects still works.
- Existing TypeScript imports compile.
  RGR:
- RED: add characterization test around current PRD markdown behavior.
- GREEN: de-export only proven internal helpers or keep exports with documented reason.
- REFACTOR: reduce exported surface without changing renderer logic.
  Gates:
- Repo gate: targeted PRD renderer/export tests, `npm run type-check`, `npm run lint`.
- Browser gate: not required unless PRD preview/download UI is touched.
- Boundary/migration gate: no DB writes and no migration.
  External docs needed: none.
  Parallelization: parallel-safe with M3-M6 after M1.
  Worker role: PRD renderer cleanup worker; owns only PRD rendering files/tests.
  Exit evidence: files changed, reference scan, tests run, before/after behavior note.
  Blocked on: M1.

### M3 - Edge-routing export and characterization cleanup

Status: PENDING
Tier: T2
Type: refactor
Actor/trigger: User views module-map or module-detail canvas edges.
Behavior to test: When explicit layout sections or rounded orthogonal routes are rendered, then the path, label midpoint, stroke width, hover color, and fallback styles remain equivalent after helper export cleanup.
Invariant protected: canvas edge geometry and styling do not drift.
Intentional behavior changes: internal-only helper exports in `edge-routing.ts` may become private; tests may be added around externally consumed routing behavior.
Previous intended behaviors preserved: `ConditionEdge` and `ModuleConnectionEdge` still render explicit sections, rounded paths, labels, hitboxes, hover shadows, and color fallbacks.
Unsafe outcomes: breaking React Flow edge paths, changing midpoint labels, losing fallback color behavior, deleting helpers used by edge components.
Dependencies: M1.
Expected files:

- `src/lib/canvas/edge-routing.ts`
- `src/lib/canvas/edge-routing.test.ts` if missing and needed
- `src/components/canvas/edges/ConditionEdge.test.tsx` if edge component behavior needs characterization
- `src/components/canvas/edges/ModuleConnectionEdge.test.tsx` if edge component behavior needs characterization
  Write boundaries: do not edit PRD renderer, chat route, LLM tools, graph services, or dashboard workspace components.
  Acceptance criteria:
- [ ] Reference scan proves which `edge-routing.ts` exports are consumed outside the module.
- [ ] `buildPathFromSections`, `buildRoundedOrthogonalPath`, `toRgba`, and `getStrokeWidth` remain exported unless their external component consumers are intentionally moved.
- [ ] Internal-only helpers are de-exported or left exported with a reason.
- [ ] Tests cover stitched ELK sections, duplicate-point collapse through public APIs, diagonal orthogonalization through public APIs, rounded corner path output, midpoint placement, invalid color fallback, and stroke width parsing.
- [ ] Edge component imports still compile.
      Regression guards:
- Existing `flow-edge-style` behavior and tests remain unchanged.
- Existing canvas edge hover and label behavior remain intact.
  RGR:
- RED: add focused route/path tests that lock current behavior.
- GREEN: reduce export surface without changing route math.
- REFACTOR: keep public API limited to component-consumed helpers.
  Gates:
- Repo gate: edge-routing/component tests, `npm run type-check`, `npm run lint`.
- Browser gate: not required unless edge components or visual rendering are changed; if changed, in-app browser canvas smoke is required.
- Boundary/migration gate: no DB writes and no migration.
  External docs needed: none.
  Parallelization: parallel-safe with M2, M4, M5, and M6 after M1.
  Worker role: canvas routing cleanup worker; owns edge routing helpers/tests only.
  Exit evidence: files changed, reference scan, tests run, visual gate decision.
  Blocked on: M1.

### M4 - Chat route orchestration extraction

Status: PENDING
Tier: T1
Type: refactor
Actor/trigger: Client sends a chat request to `/api/chat`.
Behavior to test: When chat is sent in discovery, module-map, module-detail, scope-build, or flowchart-build mode, then auth, validation, prompt context, selected-question helper response, streaming, and persistence match current behavior.
Invariant protected: server chat API contract and persisted chat history remain stable.
Intentional behavior changes: split `POST` into smaller internal helpers for parsing, auth/rate-limit, prompt context hydration, selected-question handling, LLM invocation, and stream persistence.
Previous intended behaviors preserved: unauthenticated requests return 401 before schema details, authenticated invalid bodies return 400, rate limits return 429, module notes load for active modules, scope graph loads for module-map without active module, click-only selected questions return deterministic help without LLM calls, saved assistant text strips tool events.
Unsafe outcomes: changing status-code ordering, leaking validation details to unauthenticated users, dropping open-question context, persisting tool-event chunks, breaking streaming headers.
Dependencies: M1.
Expected files:

- `src/app/api/chat/route.ts`
- `src/app/api/chat/route.test.ts`
- Optional `src/app/api/chat/chat-route-helpers.ts` or `src/lib/services/chat-route-context.ts`
- Optional shared pure helper for selected open-question prompt normalization/recommendations if M4 and M5 would otherwise duplicate logic.
  Write boundaries: do not edit `llm-tools.ts` implementation in this node except import/type compatibility; do not edit dashboard workspaces or canvas helpers.
  Acceptance criteria:
- [ ] `POST` delegates to named helpers with the same externally observable behavior.
- [ ] The first extraction is pure selected-question prompt/recommendation or prompt-context loading code before any streaming/persistence changes.
- [ ] Existing route tests still pass.
- [ ] New tests cover extracted helper behavior if route tests no longer directly expose it.
- [ ] No public request/response shape changes.
      Regression guards:
- Selected open-question truth contract remains covered.
- Stream parser persistence behavior remains covered.
  RGR:
- RED: add or strengthen route tests for the behavior most at risk during extraction.
- GREEN: extract helpers without changing logic.
- REFACTOR: remove duplication and keep helper names tied to behavior, not implementation trivia.
  Gates:
- Repo gate: `npx vitest run src/app/api/chat/route.test.ts src/lib/services/prompt-builder.test.ts src/lib/services/llm-tools-scoping.test.ts`, plus `npm run type-check` and `npm run lint`.
- Browser gate: in-app browser chat smoke in Quick Capture or Flowchart after M4/M5 integration.
- Boundary/migration gate: no DB writes from tests beyond mocks; no migration.
  External docs needed: none unless changing Anthropic SDK request shape, which is out of scope.
  Parallelization: parallel-safe with M2, M3, M5, and M6 only if M4 owns chat route files and helper files exclusively.
  Worker role: chat route refactor worker; owns route orchestration and route tests.
  Exit evidence: files changed, tests run, unchanged request/response contract summary.
  Blocked on: M1.

### M5 - LLM tool executor decomposition

Status: PENDING
Tier: T1
Type: refactor
Actor/trigger: Assistant invokes a tool to mutate modules, nodes, edges, PRD content, open questions, or project mode.
Behavior to test: When each supported tool runs, then success/error content, returned event payloads, graph invariant warnings, and selected-question resolution guards match current behavior.
Invariant protected: LLM tool execution cannot silently change persisted graph/question semantics during cleanup.
Intentional behavior changes: split `createToolExecutor` and related tool definitions into smaller internal handlers or modules while keeping exported tool APIs stable.
Previous intended behaviors preserved: tool sets per mode stay identical; selected-question click-only guard blocks false resolution; graph edits return invariant feedback; connect-modules auto-adds missing entry/exit points; tool result data shapes still drive client event handlers.
Unsafe outcomes: changing tool names or schemas, dropping graph checks, resolving questions without an answer, changing client event payload keys, creating hidden DB write ordering changes.
Dependencies: M1.
Expected files:

- `src/lib/services/llm-tools.ts`
- `src/lib/services/llm-tools-scoping.test.ts`
- Optional `src/lib/services/llm-tool-handlers.ts`
- Optional `src/lib/services/llm-tool-definitions.ts`
- Optional shared pure helper for selected open-question prompt normalization/recommendations if it is introduced by M4.
  Write boundaries: do not edit `src/app/api/chat/route.ts` except import/type compatibility; do not edit dashboard workspaces or canvas helpers.
  Acceptance criteria:
- [ ] `getToolsForMode`, exported tool definitions, and `createToolExecutor` remain public API compatible.
- [ ] Tool definition/schema extraction, if performed, happens before executor-handler extraction.
- [ ] Per-tool handlers are testable without a giant switch when practical.
- [ ] Existing scoping tests still pass.
- [ ] New or strengthened tests cover graph-check feedback and selected-question guard after extraction.
      Regression guards:
- Mode-specific tool lists remain exact.
- Client-facing `data` payload keys remain exact.
  RGR:
- RED: add characterization around any tool payload shape that is not already covered.
- GREEN: extract handlers while preserving switch semantics.
- REFACTOR: group definitions, guards, and handlers by responsibility without changing service boundaries.
  Gates:
- Repo gate: `npx vitest run src/lib/services/llm-tools-scoping.test.ts src/app/api/chat/route.test.ts`, plus `npm run type-check` and `npm run lint`.
- Browser gate: in-app browser chat smoke that triggers at least one non-destructive tool event, or a documented skip if live mutation risk requires fixture-only proof.
- Boundary/migration gate: no live DB mutation in verification unless using an isolated fixture; no migration.
  External docs needed: none unless changing third-party doc lookup or Anthropic tool schema, which is out of scope.
  Parallelization: parallel-safe with M2, M3, M4, and M6 only with strict write ownership and integrator rerun of combined tests.
  Worker role: LLM tool refactor worker; owns tool definitions/executor and tests.
  Exit evidence: files changed, tests run, public tool API compatibility summary.
  Blocked on: M1.

### M6 - Workspace tool-event applier extraction

Status: PENDING
Tier: T1
Type: refactor
Actor/trigger: Client receives streamed tool events in Quick Capture, Flowchart, or Full Design workspace.
Behavior to test: When tool events arrive, then the same graph store mutations, local active-question resets, PRD updates, refresh flags, and tool activity labels occur after extraction.
Invariant protected: streamed server tool results still update the visible UI exactly once and in the right workspace.
Intentional behavior changes: extract duplicated tool-event application from `scope-workspace.tsx` and `project-workspace.tsx` into typed helper functions or local reducers; add missing Full Design workspace tests if needed.
Previous intended behaviors preserved: scope workspace keeps selected-question identity through Accept/override; project workspace updates modules/connections/open questions; both workspaces keep streaming text and optimistic user-message behavior.
Unsafe outcomes: applying events twice, losing active selected question, dropping source/target module updates after `connect_modules`, breaking promote refresh, hiding tool activity labels, introducing shared helper assumptions that do not fit both workspaces.
Dependencies: M1.
Expected files:

- `src/components/dashboard/scope-workspace.tsx`
- `src/components/dashboard/scope-workspace.test.tsx`
- `src/components/dashboard/project-workspace.tsx`
- `src/components/dashboard/project-workspace.test.tsx` if added
- Optional `src/components/dashboard/tool-event-applier.ts`
- Optional `src/components/dashboard/tool-event-applier.test.ts`
  Write boundaries: do not edit server chat route, LLM tool service, PRD renderer, edge routing, or graph services.
  Acceptance criteria:
- [ ] Scope and project workspaces use a shared or parallel extracted event applier with explicit differences.
- [ ] Existing scope-workspace tests still pass.
- [ ] Full Design workspace tool-event behavior gets direct component coverage or helper-level characterization before major `project-workspace.tsx` extraction.
- [ ] Streaming and optimistic message behavior remain in the components unless deliberately covered by helper tests.
      Regression guards:
- Selected open-question identity survives Accept and override.
- `connect_modules` still updates connection plus refreshed source/target module handles.
- `resolve_open_question` still removes the question node and updates question state.
  RGR:
- RED: add failing helper/component tests for a representative event in each workspace.
- GREEN: extract event applier and wire both workspaces.
- REFACTOR: keep workspace-specific UI state changes explicit instead of over-generalizing.
  Gates:
- Repo gate: `npx vitest run src/components/dashboard/scope-workspace.test.tsx src/components/dashboard/project-workspace.test.tsx src/components/dashboard/tool-event-applier.test.ts`, adjusted to files that exist, plus `npm run type-check` and `npm run lint`.
- Browser gate: in-app browser smoke for Quick Capture/Flowchart chat and Full Design module-map event handling if a non-destructive fixture is available.
- Boundary/migration gate: no DB writes except isolated fixture flows; no migration.
  External docs needed: none.
  Parallelization: parallel-safe with M2-M5 after M1 if it owns dashboard workspace files exclusively.
  Worker role: client event applier worker; owns dashboard workspace event handling and tests.
  Exit evidence: files changed, tests run, browser route(s) smoked or skip reason.
  Blocked on: M1.

### M7 - Fallow calibration, focused proof, and browser smoke

Status: PENDING
Tier: T1
Type: verification
Actor/trigger: Integrator verifies maintainability cleanup.
Behavior to test: When the cleanup is complete, then behavior-preservation tests, typecheck, lint, Fallow health, and in-app browser smoke prove reduced structural risk without user-visible drift.
Invariant protected: final evidence supports both maintainability improvement and behavior preservation.
Intentional behavior changes: report any Fallow score changes and any helpers intentionally de-exported.
Previous intended behaviors preserved: all previous behaviors listed in the working brief.
Unsafe outcomes: calling cleanup done because Fallow improved while chat or UI behavior regressed, skipping browser proof for UI-touched files, overclaiming behavior preservation without focused evidence.
Dependencies: M2, M3, M4, M5, M6.
Expected files:

- `plans/maintainability-cleanup/progress.md`
- Optional `plans/maintainability-cleanup/verification.md`
- Optional `plans/maintainability-cleanup/agent-runs/M7-main-*.md`
  Write boundaries: verification artifacts only unless a small integration fix is required; any new implementation work must become a new node.
  Acceptance criteria:
- [ ] Focused tests for changed files pass.
- [ ] `npm run type-check` passes.
- [ ] `npm run lint` passes.
- [ ] Fresh Fallow command is run if available, or skipped with exact reason.
- [ ] In-app browser smoke covers affected UI surfaces when any frontend file changed.
- [ ] Behavior-preservation confidence score is reported.
      Regression guards:
- Route, tool, workspace, PRD, and edge behavior all have evidence.
- Current-project live data repair remains untouched.
  RGR:
- RED: identify any failing focused test, lint/type error, Fallow regression, or browser mismatch.
- GREEN: verify all completed nodes and route failures into new graph nodes when needed.
- REFACTOR: remove only test/debug artifacts created by verification.
  Gates:
- Repo gate: changed-file focused vitest set, `npm run type-check`, `npm run lint`, fresh Fallow if available.
- Browser gate: in-app browser smoke on `http://127.0.0.1:3000` for Quick Capture/Flowchart and Full Design surfaces touched by cleanup.
- Boundary/migration gate: confirm no migration required; if one was introduced, verify non-destructive migration path before completion.
  External docs needed: none.
  Parallelization: single-threaded integrator verification.
  Worker role: verification/integration worker; owns proof, progress updates, and behavior-preservation report.
  Exit evidence: commands, browser route/flow, Fallow result, changed-files summary, confidence score, residual risks.
  Blocked on: M2, M3, M4, M5, M6.
