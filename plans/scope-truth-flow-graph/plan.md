# Feature Plan: Scope Truth And Flow Graph Correctness

Status: READY
Last updated: 2026-06-07
Owner: feature-orchestrator

## Working Brief

- Feature: Make MermaidAI's scope-mode assistant, open questions, and flowchart board agree on the same source of truth, while preventing broken checkout-flow graph edits from reaching the user.
- Primary actors: product user, assistant chat, open-questions drawer, LLM tool runner, graph persistence service, React Flow board, PRD/summary view.
- Core invariant: persisted project state is the source of truth; the assistant cannot claim questions are resolved or flows are complete unless tool results and graph data prove it.
- Previous intended behaviors: chat can create and edit flow nodes, edges, PRD notes, and open questions; open questions are grouped and clickable; accepted chat recommendations send a user-visible response; the board remains draggable/zoomable; question nodes are represented on the board or in the drawer; scope-mode handoff to full-design mode preserves captured flow and questions.
- Intentional behavior changes: resolving a question must be ID-bound, assistant resolved-state language must be backed by current open-question state, flow edits must preserve graph connectivity and decision branch consistency, question-node rendering/layout must no longer hide content or shrink the main graph, every assistant follow-up should expose an accept-ready recommendation when one is safe.
- Unsafe outcomes: resolving the wrong question, hiding unresolved questions, claiming architecture readiness while questions remain open, creating disconnected islands, deleting user project data without explicit approval, breaking existing canvas rendering, masking LLM/tool failures behind optimistic chat copy.
- Evidence: live browser review on `http://127.0.0.1:3000/dashboard/9375bc1a-a0ba-4719-a18d-70609ce147d0`; DB read showed four `open` questions while the assistant claimed all questions were resolved; graph data showed disconnected coupon and checkout branches plus contradictory payment-failure edges; source review found text-only question resolution and question-node data mismatch.
- Assumptions: current project data is useful as a regression example but should not be mutated as live data without explicit approval; no schema migration is required unless implementation discovers a durable persisted field is missing; model and API-key setup are out of scope for this pass.
- Out of scope: deleting projects, changing auth/dev-skip behavior, production deployment, changing OpenAI model selection, broad redesign of the canvas, rewriting graph storage.

## Risk Classification

- Overall tier: T1, because the feature touches persisted planning state and can corrupt or misrepresent user decisions.
- Live-data risk: Medium; code changes are safe, but repairing the currently open project's stored graph/questions is blocked until explicitly approved.
- Migration risk: Low; no migration is expected. If a schema change becomes necessary, add and run the non-destructive migration before marking the node complete.
- External-contract risk: Medium; the assistant prompt, tool-call schema, and UI recommendation parsing must remain aligned.

## Dependency Graph

| Node | Title                                           | Tier | Depends On         | Parallel Group | Shared-State Risk                         | Status  |
| ---- | ----------------------------------------------- | ---- | ------------------ | -------------- | ----------------------------------------- | ------- |
| S1   | ID-bound open-question resolution trigger       | T1   | none               | W1-A           | questions UI and chat send contract       | PENDING |
| S2   | Graph invariant detector and regression fixture | T1   | none               | W1-B           | pure helper/tests only                    | PENDING |
| S3   | Tool-backed resolved-state truth contract       | T1   | S1                 | W2-A           | chat route, prompt, tool result semantics | PENDING |
| S4   | Flow edit repair and graph-connectivity guards  | T1   | S2                 | W2-B           | LLM tool graph mutations                  | PENDING |
| S5   | Question-node rendering and layout isolation    | T2   | S2                 | W2-C           | canvas node data and fit bounds           | PENDING |
| S6   | Decision branch routing and labels              | T2   | S2                 | W2-D           | edge style and layout routing             | PENDING |
| S7   | Recommendation and accept-action contract       | T2   | S3                 | W3-A           | chat rendering and prompt copy            | PENDING |
| S8   | Chat docking and resize polish                  | T3   | S5, S7             | W3-B           | floating chat UI only                     | PENDING |
| S9   | Current project data repair                     | T1   | S3, S4, S5, S6     | W4-A           | live project rows                         | BLOCKED |
| S10  | Full proof and behavior-preservation report     | T1   | S3, S4, S5, S6, S7 | W4-B           | test/browser/DB verification only         | PENDING |

## Dependency Waves

- W1 parallel group: S1 and S2 can run concurrently. They touch disjoint surfaces and unblock all state and graph work.
- W2 parallel group: S3, S4, S5, and S6 can run concurrently after their dependencies, with S3 owning chat/tool truth and S4-S6 owning graph/canvas surfaces.
- W3 parallel group: S7 and S8 run after the state and visual contracts stabilize.
- W4 verification group: S9 remains blocked pending explicit approval to mutate the currently open project's stored rows; S10 can run without S9 by using fixtures and browser smoke tests.

## Nodes

### S1 - ID-bound open-question resolution trigger

Status: PENDING
Tier: T1
Type: behavior
Actor/trigger: User clicks an open question in the drawer.
Behavior to test: When a drawer question is selected, then the assistant receives the question ID, section, and text rather than only a quoted string.
Invariant protected: question resolution targets the selected persisted question.
Intentional behavior changes: `OpenQuestionsPanel` and `scope-workspace` pass structured question context into chat.
Previous intended behaviors preserved: grouped drawer display, confirmation modal, skip-confirm preference, opening the assistant, and sending a visible user prompt.
Unsafe outcomes: losing the confirmation flow, sending private/internal IDs as confusing visible copy, resolving by text match, breaking drawer tests.
Dependencies: none.
Expected files:

- `src/components/canvas/OpenQuestionsPanel.tsx`
- `src/components/canvas/OpenQuestionsPanel.test.tsx`
- `src/components/dashboard/scope-workspace.tsx`
- `src/components/dashboard/scope-workspace.test.tsx`
- `src/types/chat.ts` if a structured chat metadata type is needed
  Write boundaries: do not edit LLM tool resolution logic in this node except for type compatibility; do not mutate graph persistence.
  Acceptance criteria:
- [ ] Drawer click carries `questionId`, `section`, and `question`.
- [ ] Visible chat prompt remains understandable to the user.
- [ ] Tests cover duplicate question text resolving distinct IDs.
      Regression guards:
- Open count and grouping still render.
- Skip-confirm localStorage behavior still works.
  RGR:
- RED: add a failing test showing duplicate question text cannot be disambiguated with the old string-only callback.
- GREEN: update callback contract and chat send payload.
- REFACTOR: keep UI prop names clear and avoid leaking implementation-only metadata into display text.
  Gates:
- Repo gate: focused component tests for `OpenQuestionsPanel` and `scope-workspace`.
- Browser gate: in-app browser click on a drawer question opens chat with the correct visible prompt.
- Boundary/migration gate: no migration expected; if one is introduced, run it because project rules require non-destructive migrations.
  External docs needed: none.
  Parallelization: parallel-safe with S2.
  Worker role: frontend state-contract worker; owns drawer-to-chat question context only.
  Exit evidence: changed files, tests run, browser route clicked, and proof that selected question ID is available to chat handling.
  Blocked on: none.

### S2 - Graph invariant detector and regression fixture

Status: PENDING
Tier: T1
Type: scaffold
Actor/trigger: LLM tool runner or test harness validates a flow graph.
Behavior to test: When a flow graph contains missing incoming/outgoing paths, contradictory terminal and retry edges, or unreachable nodes, then the validator reports actionable invariant failures.
Invariant protected: generated flowcharts remain coherent directed graphs.
Intentional behavior changes: introduce a reusable graph validation helper and a checkout/coupon/payment regression fixture.
Previous intended behaviors preserved: no UI rendering or DB writes change in this node.
Unsafe outcomes: over-constraining valid exploratory graphs, classifying question nodes as required process steps, making tests brittle to layout-only changes.
Dependencies: none.
Expected files:

- `src/lib/canvas/graph-invariants.ts`
- `src/lib/canvas/graph-invariants.test.ts`
- `src/types/graph.ts` if helper typing needs existing graph types
  Write boundaries: do not change LLM tools, layout, or React components in this node.
  Acceptance criteria:
- [ ] Detects disconnected process islands.
- [ ] Detects decision nodes with only one branch when two are expected.
- [ ] Detects terminal failure branches that also have retry branches without a clear label split.
- [ ] Excludes open-question annotation nodes from main process connectivity checks.
      Regression guards:
- Existing valid small graphs pass.
- Existing question-only annotations do not fail process invariants.
  RGR:
- RED: add failing tests based on the observed checkout/coupon/payment graph.
- GREEN: implement validator with actionable issue codes.
- REFACTOR: keep validator pure and independent from React Flow.
  Gates:
- Repo gate: `graph-invariants` unit tests.
- Browser gate: not required for this scaffold node.
- Boundary/migration gate: no DB writes and no migration.
  External docs needed: none.
  Parallelization: parallel-safe with S1.
  Worker role: graph correctness worker; owns pure validation helper and fixtures.
  Exit evidence: files changed, validator issue examples, and tests run.
  Blocked on: none.

### S3 - Tool-backed resolved-state truth contract

Status: PENDING
Tier: T1
Type: integration
Actor/trigger: Assistant resolves, lists, or summarizes open questions.
Behavior to test: When unresolved questions still exist, then the assistant does not claim all questions are resolved and the UI state remains aligned with persisted status.
Invariant protected: assistant language reflects current tool-backed state.
Intentional behavior changes: chat route/prompt/tool-result handling must check unresolved count before resolved-state claims and architecture handoff copy.
Previous intended behaviors preserved: assistant can still ask follow-ups, create recommendations, and resolve questions after the user answers.
Unsafe outcomes: suppressing useful summaries, creating infinite "still open" loops, relying on stale open-question context, resolving without tool success.
Dependencies: S1.
Expected files:

- `src/app/api/chat/route.ts`
- `src/app/api/chat/route.test.ts`
- `src/lib/services/prompt-builder.ts`
- `src/lib/services/prompt-builder.test.ts`
- `src/lib/services/llm-tools.ts`
- `src/lib/services/llm-tools-scoping.test.ts`
  Write boundaries: do not change canvas layout in this node; do not repair current project rows.
  Acceptance criteria:
- [ ] Assistant resolved-state copy is gated by current open-question count or successful `resolve_open_question` results.
- [ ] `resolve_open_question` fails loudly for missing/unknown question IDs.
- [ ] Prompt contains current open question IDs and forbids false closure.
- [ ] Tests cover unresolved questions surviving after a chat response.
      Regression guards:
- Existing tool calls for adding questions and PRD updates still work.
- Chat streaming and tool-activity display still work.
  RGR:
- RED: failing route/service tests for "all resolved" claim while unresolved rows remain.
- GREEN: enforce truth contract in prompt/tool handling.
- REFACTOR: centralize resolved-state summary logic if duplication appears.
  Gates:
- Repo gate: focused route, prompt-builder, and scoping-tool tests.
- Browser gate: in-app browser chat smoke where unresolved drawer count and assistant text agree.
- Boundary/migration gate: no migration expected; if schema change is introduced, run non-destructive migration.
  External docs needed: none unless changing provider request shape.
  Parallelization: can run in W2 after S1; coordinate with S7 on recommendation copy.
  Worker role: assistant truth-contract worker; owns chat route, prompt, and tool semantics.
  Exit evidence: tests run, browser prompt evidence, unresolved-count proof.
  Blocked on: S1.

### S4 - Flow edit repair and graph-connectivity guards

Status: PENDING
Tier: T1
Type: behavior
Actor/trigger: Assistant creates or edits flowchart nodes and edges.
Behavior to test: When the assistant inserts coupon or payment-failure steps, then the resulting graph remains connected and branch outcomes are not contradictory.
Invariant protected: graph edits preserve coherent user journey paths.
Intentional behavior changes: LLM tools and/or graph service validate edge mutations and repair common insertions instead of creating disconnected islands.
Previous intended behaviors preserved: assistant can add, update, connect, and remove nodes; existing valid graph edits still persist.
Unsafe outcomes: deleting user edges unexpectedly, rejecting legitimate non-linear flows, hiding tool failures, forcing checkout-specific logic into generic graph code.
Dependencies: S2.
Expected files:

- `src/lib/services/llm-tools.ts`
- `src/lib/services/llm-tools-scoping.test.ts`
- `src/lib/services/graph-service.ts`
- `src/lib/services/graph-service.test.ts`
- `src/lib/services/prompt-builder.ts`
  Write boundaries: do not edit open-question UI contract in this node; do not mutate live project data.
  Acceptance criteria:
- [ ] Inserting a node between two known steps rewires incoming/outgoing edges atomically.
- [ ] Decision nodes use distinct branch labels without duplicate contradictory endings.
- [ ] Tool responses surface validation failures instead of optimistic "Done" copy.
- [ ] Checkout regression fixture passes graph invariants after repair.
      Regression guards:
- Existing simple start-to-end flow creation still passes.
- Existing edge deletion/update behavior remains intentional and tested.
  RGR:
- RED: add failing tests for coupon island and payment failure end-plus-retry contradiction.
- GREEN: add guarded repair/validation around graph mutations.
- REFACTOR: keep checkout examples as fixtures, not hard-coded product logic.
  Gates:
- Repo gate: scoping tool and graph-service tests.
- Browser gate: in-app browser create/edit flow smoke with a coupon insertion or equivalent fixture.
- Boundary/migration gate: no migration expected; if schema change is introduced, run non-destructive migration.
  External docs needed: none.
  Parallelization: can run in W2 after S2; coordinate with S6 on branch label semantics.
  Worker role: graph mutation worker; owns LLM-tool graph write paths and service-level guards.
  Exit evidence: tests run, before/after graph issue counts, and browser smoke.
  Blocked on: S2.

### S5 - Question-node rendering and layout isolation

Status: PENDING
Tier: T2
Type: behavior
Actor/trigger: User views the flowchart board with open questions present.
Behavior to test: When open-question nodes exist, then question content is visible or intentionally drawer-only, and question annotations do not shrink the main process graph.
Invariant protected: open questions remain discoverable without damaging flow readability.
Intentional behavior changes: pass `question` data correctly to `QuestionNode`, and exclude or isolate annotation nodes from main flow `fitView` if appropriate.
Previous intended behaviors preserved: question nodes remain associated with their related flow step; the drawer still lists all open questions.
Unsafe outcomes: hiding question context, duplicating questions inconsistently, making the board zoom to unusable scale, breaking canvas tests.
Dependencies: S2.
Expected files:

- `src/components/canvas/views/ModuleDetailView.tsx`
- `src/components/canvas/views/ModuleDetailView.test.tsx`
- `src/components/canvas/nodes/QuestionNode.tsx`
- `src/components/canvas/nodes/QuestionNode.test.tsx`
- `src/lib/canvas/layout.ts`
- `src/lib/canvas/layout.flow-detail.test.ts`
  Write boundaries: do not alter LLM tool persistence or question resolution in this node.
  Acceptance criteria:
- [ ] Question nodes render meaningful text when shown.
- [ ] Main flow fit/zoom is not dominated by question annotations.
- [ ] Tests document whether questions are board annotations, drawer-only, or both.
      Regression guards:
- Existing process/decision node rendering remains unchanged.
- Canvas interactions remain usable.
  RGR:
- RED: failing test for question node receiving only `{ label, pseudocode }`.
- GREEN: map question-node data correctly and adjust fit/layout.
- REFACTOR: keep annotation treatment explicit and reusable.
  Gates:
- Repo gate: component and layout tests.
- Browser gate: in-app browser screenshot/inspection of board with questions.
- Boundary/migration gate: no DB writes and no migration.
  External docs needed: none.
  Parallelization: can run in W2 after S2; coordinate with S8 for chat overlay readability.
  Worker role: canvas annotation worker; owns question-node display and layout isolation.
  Exit evidence: tests run and browser screenshot or measured zoom proof.
  Blocked on: S2.

### S6 - Decision branch routing and labels

Status: PENDING
Tier: T2
Type: behavior
Actor/trigger: User views decision branches with labels such as Valid, Invalid, fail, Retry, or Skip.
Behavior to test: When a decision edge uses non-yes/no outcome labels, then the edge routes to an appropriate source handle and style.
Invariant protected: visual branch direction matches decision meaning.
Intentional behavior changes: expand branch classification beyond literal yes/no and normalize common outcome terms.
Previous intended behaviors preserved: existing yes/no, auth, and inventory routing still works.
Unsafe outcomes: over-normalizing arbitrary labels, breaking previous connector fixes, making retry/failure branches visually ambiguous.
Dependencies: S2.
Expected files:

- `src/lib/canvas/flow-edge-style.ts`
- `src/lib/canvas/flow-edge-style.test.ts`
- `src/lib/canvas/layout.ts`
- `src/lib/canvas/layout.test.ts`
  Write boundaries: do not change graph persistence or chat behavior in this node.
  Acceptance criteria:
- [ ] Valid/success/pass labels classify as positive branch where appropriate.
- [ ] Invalid/fail/error labels classify as negative branch.
- [ ] Retry/skip labels remain distinguishable when they are recovery actions rather than decision outcomes.
- [ ] Tests cover the observed coupon and payment labels.
      Regression guards:
- Literal Yes/No routing remains unchanged.
- Existing module connector lessons about handle routing are not regressed.
  RGR:
- RED: failing tests for Valid/Invalid/fail/Retry/Skip labels.
- GREEN: add classification and routing support.
- REFACTOR: keep the classifier small and table-driven.
  Gates:
- Repo gate: edge-style and layout tests.
- Browser gate: in-app browser visual check of labeled branches.
- Boundary/migration gate: no DB writes and no migration.
  External docs needed: none.
  Parallelization: can run in W2 after S2; coordinate with S4 on labels emitted by tools.
  Worker role: branch-routing worker; owns edge classification and layout routing.
  Exit evidence: tests run and visual routing proof.
  Blocked on: S2.

### S7 - Recommendation and accept-action contract

Status: PENDING
Tier: T2
Type: integration
Actor/trigger: Assistant asks a follow-up question.
Behavior to test: When the assistant asks for a decision, then the chat shows an opinionated recommendation and an accept action unless no safe recommendation exists.
Invariant protected: the user can move scope decisions forward without hunting for hidden options.
Intentional behavior changes: recommendation parsing/rendering gets a fallback or structured contract so latest follow-ups do not lose the accept path.
Previous intended behaviors preserved: user can ignore recommendation and type their own answer; existing recommendation cards still render.
Unsafe outcomes: inventing unsafe defaults, accepting stale recommendations, tying accept to the wrong question, making chat text noisy.
Dependencies: S3.
Expected files:

- `src/components/chat/ChatMessageList.tsx`
- `src/components/chat/ChatMessageList.test.tsx`
- `src/lib/services/prompt-builder.ts`
- `src/lib/services/prompt-builder.test.ts`
- `src/types/chat.ts` if structured recommendation metadata is added
  Write boundaries: do not change drawer resolution UI in this node; do not change graph mutation logic.
  Acceptance criteria:
- [ ] Latest assistant follow-up has a visible recommendation card when safe.
- [ ] Accept sends the recommended answer as user input and preserves current question context if available.
- [ ] Tests cover missing `Recommended answer:` fallback or structured metadata.
      Regression guards:
- Existing recommendation-card tests continue to pass.
- Follow-up question callout styling remains intact.
  RGR:
- RED: failing test for a follow-up without recommendation text.
- GREEN: render fallback or structured recommendation.
- REFACTOR: avoid brittle parsing where structured metadata is practical.
  Gates:
- Repo gate: chat message and prompt-builder tests.
- Browser gate: in-app browser chat message with accept button.
- Boundary/migration gate: no migration expected.
  External docs needed: none unless changing model response format.
  Parallelization: W3 after S3.
  Worker role: recommendation UX worker; owns chat recommendation display and accept semantics.
  Exit evidence: tests run and browser accept-button proof.
  Blocked on: S3.

### S8 - Chat docking and resize polish

Status: PENDING
Tier: T3
Type: refactor
Actor/trigger: User resizes or positions the floating chat while inspecting the board and open questions.
Behavior to test: When the chat is wide/tall, then it remains resizable without permanently obscuring the board or open-questions drawer.
Invariant protected: chat assistance does not make the primary workspace unreadable.
Intentional behavior changes: add docking, snap, peek, or constrained overlay behavior only if S5/S7 verification shows remaining obstruction.
Previous intended behaviors preserved: existing stretch handles, close/open behavior, input/send flow, and recommendation cards.
Unsafe outcomes: making resize handles hard to discover, introducing layout shift, blocking canvas pointer interactions, creating mobile overflow.
Dependencies: S5, S7.
Expected files:

- `src/components/chat/FloatingChat.tsx`
- `src/components/chat/FloatingChat.test.tsx`
- related CSS/component tests if needed
  Write boundaries: do not edit chat content parsing or graph logic in this node.
  Acceptance criteria:
- [ ] Chat can be resized while the board and drawer remain inspectable.
- [ ] Mobile and desktop constraints prevent offscreen controls.
- [ ] No horizontal overflow in the chat body.
      Regression guards:
- Existing resize tests still pass.
- Send input remains accessible after resizing.
  RGR:
- RED: browser or component test exposing obstruction/overflow.
- GREEN: add constrained docking/snap/peek behavior.
- REFACTOR: keep resize state local and predictable.
  Gates:
- Repo gate: floating chat tests.
- Browser gate: in-app browser resize smoke on dashboard route.
- Boundary/migration gate: no DB writes and no migration.
  External docs needed: none.
  Parallelization: W3 after canvas/chat behavior stabilizes.
  Worker role: chat overlay worker; owns only floating chat layout polish.
  Exit evidence: tests run and browser resize measurements.
  Blocked on: S5, S7.

### S9 - Current project data repair

Status: BLOCKED
Tier: T1
Type: ops
Actor/trigger: User approves repairing the currently open test project's stored rows.
Behavior to test: When the current project is repaired, then its persisted graph has a connected checkout path and open-question statuses match actual decisions.
Invariant protected: existing user-visible project state is changed only with explicit approval.
Intentional behavior changes: apply a targeted data repair to project `9375bc1a-a0ba-4719-a18d-70609ce147d0` only after code-level guards are verified.
Previous intended behaviors preserved: no project deletion; no broad cleanup; existing useful nodes and PRD notes stay unless user says otherwise.
Unsafe outcomes: mutating live data without consent, deleting unresolved questions, rewriting useful user-generated history, masking bugs by editing the fixture manually.
Dependencies: S3, S4, S5, S6.
Expected files:

- none unless a non-destructive migration or scripted repair is explicitly approved
  Write boundaries: no writes to Supabase/project data until approved in chat.
  Acceptance criteria:
- [ ] User explicitly approves whether to repair the current project rows.
- [ ] Repair is scripted or documented, reversible where practical, and scoped to the one project.
- [ ] Post-repair DB read verifies open-question statuses and graph invariants.
      Regression guards:
- No other projects are touched.
- No project deletion occurs.
  RGR:
- RED: capture current graph invariant failures as evidence.
- GREEN: apply approved targeted repair.
- REFACTOR: if repair reveals a reusable migration need, create a non-destructive migration and run it.
  Gates:
- Repo gate: not applicable unless a script/migration is added.
- Browser gate: in-app browser verifies repaired current project.
- Boundary/migration gate: blocked until explicit user approval; run any non-destructive migration that is created.
  External docs needed: none.
  Parallelization: single-threaded.
  Worker role: ops/data-repair worker; launches only after approval and code guards.
  Exit evidence: approval reference, DB before/after, browser proof, and exact rows affected.
  Blocked on: explicit user approval to mutate current project data.

### S10 - Full proof and behavior-preservation report

Status: PENDING
Tier: T1
Type: verification
Actor/trigger: Orchestrator runs final verification after implementation nodes.
Behavior to test: When the complete feature is exercised, then chat, open questions, and flowchart board agree across tests, DB state, and browser-visible UI.
Invariant protected: no accidental behavior drift beyond the requested corrections.
Intentional behavior changes: none; this node proves the implemented changes.
Previous intended behaviors preserved: all previous intended behaviors listed in the working brief.
Unsafe outcomes: accepting stale evidence, skipping in-app browser proof, ignoring dirty unrelated files, overstating confidence.
Dependencies: S3, S4, S5, S6, S7.
Expected files:

- `plans/scope-truth-flow-graph/verification.md`
- no source writes unless new failures require new graph nodes
  Write boundaries: do not modify source while verifying unless a new node is added to this plan.
  Acceptance criteria:
- [ ] Focused tests for all changed files pass.
- [ ] `npm run type-check` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run test` passes or failures are attributed and documented.
- [ ] In-app browser smoke tests the dashboard chat, open questions, accept button, graph rendering, and resize constraints.
- [ ] Behavior-preservation confidence score is reported with evidence.
      Regression guards:
- Existing dashboard and canvas tests remain green.
- OpenAI/model/API-key work remains untouched.
  RGR:
- RED: final proof starts from known failing live-review cases.
- GREEN: verify tests, DB fixture, and browser flows pass.
- REFACTOR: add `verification.md` with exact evidence and residual risk.
  Gates:
- Repo gate: full test/type/lint suite.
- Browser gate: required in-app browser proof on the dashboard route.
- Boundary/migration gate: run any non-destructive migrations introduced by implementation before final proof.
  External docs needed: none unless implementation changes third-party API usage.
  Parallelization: single orchestrator or verification worker after implementation.
  Worker role: verification worker; owns proof and behavior-preservation report.
  Exit evidence: commands, browser route/flow, DB/fixture facts, skipped checks, confidence score.
  Blocked on: S3, S4, S5, S6, S7.
