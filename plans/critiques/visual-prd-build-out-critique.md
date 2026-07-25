# Critique: visually building out app/web PRDs in MermaidAI

Feature-level critique of the path from canvas → PRD: how well MermaidAI's visual model supports
producing a product requirements document for an app or website. Read exhaustively:
`src/lib/services/prd-renderers.ts`, `prd-export-service.ts`, `prd-download.ts`, `llm-tools.ts`,
`prompt-builder.ts`, `prompt-sections.ts`, `open-question-service.ts`, `graph-service.ts`,
`src/components/dashboard/PrdPreviewPanel.tsx`, `project-workspace.tsx`, `scope-workspace.tsx`,
`tool-event-applier.ts`, `src/types/graph.ts`, `src/lib/schemas/*`, `src/lib/project-modes.ts`,
`src/components/canvas/views/ModuleMapView.tsx`, and all seven files in `supabase/migrations/`.
Sampled, not read exhaustively: `src/lib/canvas/*` layout internals (9 modules), the node/edge
React components, `e2e/`.

Verification performed: `npm run type-check` (clean), `npm test` (80 files, 951 tests passing),
`npm run lint` (clean), plus a throwaway probe harness executed against the real
`generateSinglePrd` / `renderModulePrd` code paths to confirm F1, F3 and F4 with actual output
rather than by inspection. The probe was deleted after use; its assertions are reproduced in the
Done-when sections below.

**Not verified live.** The app was never booted. `src/lib/config.ts` requires four Supabase env
vars and no credentials are available in this environment, so no finding here rests on observed
runtime behaviour in a browser. F1 in particular is confirmed from the SQL schema plus the two
call sites rather than from watching a row disappear — the Done-when gives the query to confirm it
against a real database.

---

## What's genuinely strong

- **Open questions as canvas nodes** (`llm-tools.ts:857-893`). Amber `?` markers created in a
  single batched call and wired by edge to the step they threaten. Ignorance made visible and
  spatially located next to the thing it endangers. This is the only part of the product that is
  already a _visual PRD_ rather than a visual flowchart, and it is the right idea.
- **Graph invariants as a model feedback loop** (`graph-invariants.ts`, wired through
  `okWithGraphCheck` at `llm-tools.ts:513-525`). Tool results tell the model its own graph is
  malformed and the prompt requires repair before replying (`prompt-builder.ts:431`). Genuinely
  sophisticated, and rare in tool-calling designs.
- **`insert_node_between` as one atomic tool** (`llm-tools.ts:707-784`). Correctly models "add a
  step in the middle" as a single user intent instead of three primitives, and the prompt forbids
  hand-rolling it (`llm-tools.ts:210-212`). It even reports partial failure as a warning rather
  than an error so the model can repair rather than restart.
- **Server-side question dedup** (`llm-tools.ts:834-852`). Normalising to a comparison key and
  skipping duplicates server-side, rather than trusting a prompt rule, is the correct instinct.
- **Test discipline.** 951 tests, clean type-check and lint. Nothing below is a symptom of a
  sloppy codebase; these are design gaps, not rot.

---

## Findings

Nine findings: 2 Critical, 5 Major, 2 Minor.

### [F1] Critical — Resolving an open question permanently deletes it, along with the client's answer

- **Where**: `src/lib/services/llm-tools.ts:914-932`;
  `supabase/migrations/20260408000000_add_scoping_mode.sql:20`;
  `src/lib/services/open-question-service.ts:35-62`; `src/lib/services/graph-service.ts` (`removeNode`)
- **Current behavior**: the resolve handler writes the resolution, then deletes the marker node:

  ```ts
  // llm-tools.ts:924-929
  const result = await resolveOpenQuestion(questionId, resolution) // UPDATE status/resolution
  if (!result.success) return fail(result.error)
  const nodeId = result.data.node_id
  await removeNode(nodeId) // DELETE FROM flow_nodes
  ```

  and the table cascades on that node:

  ```sql
  -- 20260408000000_add_scoping_mode.sql:20
  node_id uuid NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
  ```

  So the `open_questions` row — including the `resolution` text written one statement earlier — is
  destroyed by the cascade. `status = 'resolved'` and `resolved_at` can never be observed in
  persisted data.

  The client store briefly holds a resolved copy (`tool-event-applier.ts:99-110`, `202-210`), but
  every send ends with `router.refresh()` (`project-workspace.tsx:313`), the page re-reads via
  `listOpenQuestions` (`dashboard/[projectId]/page.tsx:73`), and the `useEffect` at
  `project-workspace.tsx:121-138` overwrites the store with the now-empty list. The answer survives
  until the next message and no longer.

- **Why it matters**: in a scoping call, the resolutions _are_ the product. "Refunds within 30
  days", "guest checkout is in scope", "no SMS in v1" — every decision extracted from the client is
  written and then deleted milliseconds later. The PRD can only ever show questions nobody
  answered, which inverts the document's value: it reports the failures of the call and discards
  the successes. It is also unrecoverable — there is no soft-delete and no audit trail.
- **Evidence**: confirmed by reading the FK declaration, the resolve handler, the two service
  functions and the page load path. Two pieces of code prove the intent was the opposite:
  `page.tsx:73` deliberately calls `listOpenQuestions` (all statuses) rather than
  `listOpenOpenQuestions`, and `prd-renderers.ts:110-117` contains a whole `### Resolved` render
  branch. Both are written for data the cascade guarantees never exists — the Resolved branch is
  unreachable dead code. Not confirmed against a live database (no credentials).
- **Fix**: decouple the question record from its marker node. New forward-only migration
  `supabase/migrations/<timestamp>_decouple_open_questions_from_nodes.sql`:

  ```sql
  ALTER TABLE open_questions ADD COLUMN module_id uuid REFERENCES modules(id) ON DELETE CASCADE;
  UPDATE open_questions SET module_id = (
    SELECT module_id FROM flow_nodes WHERE flow_nodes.id = open_questions.node_id
  );
  ALTER TABLE open_questions ALTER COLUMN node_id DROP NOT NULL;
  ALTER TABLE open_questions DROP CONSTRAINT open_questions_node_id_fkey;
  ALTER TABLE open_questions ADD CONSTRAINT open_questions_node_id_fkey
    FOREIGN KEY (node_id) REFERENCES flow_nodes(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_open_questions_module_id ON open_questions(module_id);
  ```

  Then: set `module_id` on insert in `createOpenQuestion` and at the `add_open_questions` call site
  (`llm-tools.ts:870-875`); make `node_id` nullable in `OpenQuestion` (`src/types/graph.ts:95`) and
  in `createOpenQuestionSchema`; change the module filter in `renderModulePrd`
  (`prd-renderers.ts:134`) from `moduleNodeIds.has(q.node_id)` to `q.module_id === module.id` so
  resolved questions survive into the PRD. Keep the `removeNode` call — the marker _should_ leave
  the canvas on resolve; only the record must outlive it. Preserve the existing dedup behaviour at
  `llm-tools.ts:834-852` (it reads `listOpenQuestions`, which will now include resolved rows —
  that is correct, a resolved topic should not be re-asked).

- **Done when**: a new test in `src/lib/services/` asserts that after `resolveOpenQuestion`, a
  `listOpenQuestions` call still returns the row with `status: 'resolved'` and the resolution text;
  and a `prd-renderers` test asserts the `### Resolved` branch renders. Against a real database:
  `select id, status, resolution from open_questions where status = 'resolved'` returns rows after
  a resolve. `npm test` and `npm run type-check` pass.

### [F2] Critical — One `write_prd` call discards the entire graph-derived PRD

- **Where**: `src/components/dashboard/PrdPreviewPanel.tsx:40-50`
- **Current behavior**:

  ```ts
  const hasAuthored = modules.some((m) => m.prd_content?.trim())
  const markdown = useMemo(() => {
    if (hasAuthored) return buildAuthoredMarkdown(projectName, modules)
    return generateSinglePrd(input)
  }, [hasAuthored, projectName, modules, input])
  ```

  `hasAuthored` flips true on a single non-whitespace character in any module's `prd_content`. From
  that moment the entire graph-derived render — Interface, Dependencies, the numbered flow walk,
  the Questions section, all of `prd-renderers.ts:122-193` — is dropped from the preview _and_ from
  `handleDownload` (`PrdPreviewPanel.tsx:52-66`), which branches on the same flag.

- **Why it matters**: the prompts instruct the model to call `write_prd` after essentially every
  graph mutation (`prompt-builder.ts:311`, `481-483`, `536`). So the flag flips within the first
  couple of messages of every session, in every mode. In practice the graph-derived renderer almost
  never runs in production — the app's entire visual asset is absent from its own deliverable, and
  the harder the AI documents, the less of the flowchart survives. Measured on a realistic
  five-node checkout module: 432 characters of structured document reduced to 39. **91% of the PRD
  discarded.**
- **Evidence**: executed. Probe harness called the real `generateSinglePrd` and a copy of
  `buildAuthoredMarkdown` on identical module/node/edge fixtures. Generated output contained
  `## Interface`, all five flow steps, the Yes/No decision branches and the open question; authored
  output contained none of them.
- **Fix**: compose instead of choosing. Replace the branch with a merge that always includes the
  graph render and inserts authored prose per module. Concretely, in `prd-export-service.ts` give
  `renderModulePrd` an `authored?: string` parameter and emit it as a `## Requirements` section
  after `## Interface`/`## Dependencies` and before `## Flow`; then `PrdPreviewPanel` calls
  `generateSinglePrd(input)` unconditionally and deletes both `hasAuthored` and
  `buildAuthoredMarkdown`. `handleDownload` loses its `hasAuthored` branch too and keeps only the
  single-vs-multi-module split. Edge cases to preserve: a module with empty `prd_content` must
  render exactly as it does today; the multi-module `---` separator behaviour must survive; the
  empty-state message at `PrdPreviewPanel.tsx:122-126` must still appear when there are no modules,
  no nodes and no authored content.
- **Done when**: a `prd-export-service` test asserts that for a module with both `prd_content` and
  flow nodes, the output contains the authored text _and_ every node label _and_ `## Interface`.
  `npm test`, `npm run type-check`, `npm run lint` pass.

### [F3] Major — Unanswered questions render as specified system behaviour in the PRD

- **Where**: `src/lib/services/prd-renderers.ts:48-92` (`renderFlowSection`), `7-46` (`walkFlow`)
- **Current behavior**: neither function excludes `node_type === 'question'`. Question markers are
  ordinary `flow_nodes` rows (`llm-tools.ts:857-864`), edged from the step they relate to
  (`llm-tools.ts:884-893`), so they are traversed like any other node and fall through to the
  generic `else` branch at `prd-renderers.ts:81-88`. Actual generated output:

  ```
  2. **Payment authorised?** *(decision)*

     - **Yes** → Show order confirmation
     - **No** → Show decline message
     - **Default** → Do we retry a declined card automatically?

  3. **Do we retry a declined card automatically?**
  ```

  The `Default` line comes from `prd-renderers.ts:72`, which falls back to the literal string
  `'Default'` when an edge has no condition or label — and question edges are created with neither.

- **Why it matters**: an open question is the _absence_ of a decision. Rendering it as a labelled
  branch of a payment decision states the opposite: that the system has a defined default path for
  declined cards. This is a client-facing document used for sign-off on paid work. It is the most
  directly damaging finding in this review because it does not look like a bug — it reads as a
  specification.
- **Evidence**: executed. Probe added one `question` node edged from the decision node; the block
  above is verbatim generated output.
- **Fix**: filter question nodes out of the flow walk and keep them solely in the Questions
  section. In `renderModulePrd`, narrow `moduleNodes` before it reaches `renderFlowSection`:
  `const flowNodes = moduleNodes.filter((n) => n.node_type !== 'question')`, and pass `flowNodes`
  to `renderFlowSection` while continuing to use the full `moduleNodes` set for the question lookup.
  Also drop edges whose target is a question node so no dangling branch is emitted:
  `moduleEdges.filter((e) => !questionNodeIds.has(e.target_node_id))`. Separately, the
  `'Default'` fallback at `prd-renderers.ts:72` should read `'Otherwise'` — `Default` implies a
  configured default; it is only ever reached for an unlabelled edge.
- **Done when**: a `prd-renderers` test builds a module with a question node edged from a decision
  and asserts the `## Flow` section contains neither the question text nor a `Default` branch,
  while `## Questions` still lists it. `npm test` passes.

### [F4] Major — `write_prd` is append-only, so the PRD accumulates contradictions

- **Where**: `src/lib/services/llm-tools.ts:802-818`; tool description at `334-353`
- **Current behavior**:

  ```ts
  const existing = modResult.data.prd_content ?? ''
  const updated = existing ? `${existing}\n\n${markdown}` : markdown
  ```

  No replace, no section addressing, no delete. The tool description states "Each call appends to
  the existing content" and the prompts call it after every mutation.

- **Why it matters**: requirements change constantly during a scoping call. Three passes over
  refund policy produce three `## Refunds` headings with mutually exclusive rules, in chronological
  order, with nothing marking which is current:

  ```
  ## Refunds

  Refunds allowed within 14 days.

  ## Refunds

  Refunds allowed within 30 days.

  ## Refunds

  No refunds on sale items.
  ```

  A document that cannot be revised is a transcript. Handing a transcript to a client as a
  requirements document is a commercial liability, and it is also what blocks F2's merged renderer
  from producing anything coherent.

- **Evidence**: executed. Probe replayed the exact append expression three times; output above is
  verbatim.
- **Fix**: make PRD content section-addressed. Migration adding a `module_prd_sections` table
  (`id`, `module_id` FK cascade, `section` text, `content` text, `position` int, timestamps, unique
  on `(module_id, section)`), with RLS mirroring the existing `open_questions` policies at
  `20260408000000_add_scoping_mode.sql:36-80`. Change the tool schema to
  `write_prd(moduleId, section, markdown, mode?: 'append' | 'replace')` defaulting to `'replace'`,
  and upsert on `(module_id, section)`. Keep `modules.prd_content` populated as a derived
  concatenation for backward compatibility with `PrdPreviewPanel` and `prd-export-service`, or
  migrate both readers in the same change — do not leave two sources of truth. Update the four
  prompt sites that describe `write_prd` (`prompt-builder.ts:152-154`, `250-252`, `331-333`,
  `481-493`, plus `prompt-builder-brainstorm.ts` if it mentions it) to name the section explicitly
  and to state that re-writing a section replaces it.
- **Done when**: a test asserts two `write_prd` calls with the same `section` yield one section
  containing only the second body, and with different sections yield two. Existing
  `llm-tools` tests still pass. `npm test`, `npm run type-check` pass.

### [F5] Major — The node vocabulary cannot express an app or website

- **Where**: `src/types/graph.ts:44`; `src/lib/schemas/flow-node.ts:3-11`; tool enums at
  `llm-tools.ts:147`, `173`, `219`; prompt node-type lists at `prompt-builder.ts:315-325`,
  `456-464`, `544-551`
- **Current behavior**:

  ```ts
  export type FlowNodeType =
    | 'decision'
    | 'process'
    | 'entry'
    | 'exit'
    | 'start'
    | 'end'
    | 'question'
  ```

  Six program-flowchart primitives plus the question marker. There is no `screen`, no `state`, no
  `role`, no `data` entity. The scope prompt additionally caps labels at 3-6 words
  (`prompt-builder.ts:434`).

- **Why it matters**: this is the root cause of the product's mismatch with its stated job. For an
  app or website the contested surface is the screen inventory, the states each screen can be in
  (empty / loading / error / partial / permission-denied), who may see it, and what data it holds —
  none of which have a representation. "The checkout page keeps the card form populated and shows
  an inline error when payment is declined" compresses to a `process` node labelled `Show error`.
  The distinction between a screen, a state of that screen, and a background job is destroyed at
  write time, so no downstream renderer can recover it and no amount of work on the PRD template
  can compensate.
- **Evidence**: confirmed by reading the type union, the zod enum, all three tool enums and all
  three prompt node-type lists. Cross-checked that no other node type is referenced anywhere:
  `src/lib/canvas/layout.ts:42,667,878` handles exactly this set.
- **Fix**: extend the union with `screen`, `role` and `data`, in this order of value. `screen` is
  the one that matters: render it as a card with a states strip along the bottom (empty / loading /
  error / success), each state marked defined / unknown / N-A, where `unknown` is clickable and
  raises an open question. Touch points, all mechanical: `src/types/graph.ts:44`,
  `FLOW_NODE_TYPES` in `flow-node.ts`, one component per type under
  `src/components/canvas/nodes/`, registration in the `nodeTypes` map used by `ModuleDetailView`,
  the three tool enums, `layout.ts:667` and `layout.ts:878` sizing/spread sets, and the prompt
  lists. The genuinely hard part is prompt guidance for when a step is a screen versus a process —
  budget iteration there, not in the type plumbing.
- **Done when**: a `create_node` call with `nodeType: 'screen'` round-trips through
  `createFlowNodeSchema` and renders on the canvas; `renderModulePrd` emits screens under a
  `## Screens` heading rather than as flow steps. `npm test`, `npm run type-check`,
  `npm run lint`, `npm run build` pass.

### [F6] Major — The scope coverage map is the best available visual and renders zero pixels

- **Where**: `src/lib/services/prompt-builder.ts:404-420`
- **Current behavior**: eleven named coverage areas — Actors & roles, Onboarding & verification,
  Discovery, Core transaction, Money, Scheduling & availability, Failure modes, Post-transaction,
  Communications, Operations, Liability & compliance — with instructions to track which remain
  unexplored and to steer follow-up questions accordingly. `grep -rln "Liability & compliance" src/`
  returns exactly one file: `prompt-builder.ts`. Nothing under `src/components/` or `src/app/`
  references any of these area names.
- **Why it matters**: this is already the answer to "what should a scoping PRD look like
  visually", written down and unused. The model reasons over an eleven-point completeness model
  and the client sees none of it. Two concrete costs: the client cannot see how much of the
  engagement remains, and — because the reasoning is invisible — the questioning reads as
  arbitrary. The prompt is actively fighting that perception at `prompt-builder.ts:395-397`, where
  it has to forbid the model from ever offering to move on. A visible rail would make that
  behaviour self-explanatory instead of stubborn.
- **Evidence**: confirmed by grep across `src/` for the area names and for "Coverage".
- **Fix**: extract the eleven areas to `src/lib/scope-coverage.ts` as a shared exported constant
  and have `buildScopeBuildPrompt` interpolate it, so prompt and UI cannot drift. Add an `area`
  column to `open_questions` (or derive it by mapping the existing free-text `section` — prefer the
  explicit column; `section` is model-authored and unstable). Render a rail down the canvas edge in
  `ScopeWorkspace`: one segment per area, grey (untouched) / amber with count (open questions) /
  green (all resolved). Reuse the existing `OpenQuestionsPanel` selection handler so clicking a
  segment filters to that area's questions. This depends on F1 — with the cascade in place, every
  area would drop back to grey the moment questions were answered.
- **Done when**: the eleven area strings exist in exactly one module, imported by both
  `prompt-builder.ts` and the rail component; a component test asserts an area with one open
  question renders amber and an area with only resolved questions renders green. `npm test` passes.

### [F7] Major — Nothing that leaves the app is visual, and the client cannot open it

- **Where**: `src/lib/prd-download.ts:19-40`; `src/lib/services/prd-export-service.ts:88-109`;
  `src/app/(dashboard)/layout.tsx:4`; `src/components/MobileGate.tsx:5,19-33`
- **Current behavior**: exactly two exits — a `.md` file, or a `.zip` of `.md` files. No PDF, no
  image, no hosted link, no embeddable diagram. Separately, `MobileGate` hard-blocks the entire
  `(dashboard)` route group below 768px with "MermaidAI is built for desktop".
- **Why it matters**: the stated use case is "Lightweight scoping for live client calls"
  (`project-modes.ts:37`). At the end of that call the client receives a zip of markdown — a format
  most non-technical buyers cannot usefully open — and cannot view it on the phone in their hand,
  because the gate covers reading as well as editing. The diagram, which is the one artefact that
  would survive the meeting in the client's memory, never leaves the browser in any form.
- **Evidence**: confirmed by reading both export modules (only `downloadMarkdown` and
  `downloadPrdZip` exist) and the layout wiring (`MobileGate` wraps `{children}` for the whole
  dashboard group).
- **Fix**: three additions, smallest first. (a) Mermaid export: a new
  `src/lib/services/prd-mermaid.ts` emitting `graph TD` from the same traversal `walkFlow` already
  performs (`prd-renderers.ts:7-46`) — roughly 40 lines, reusing the node-type-to-shape mapping
  (`process` → `[]`, `decision` → `{}`, `start`/`end` → `()`), embedded as a fenced ```mermaid block
in each module's PRD section so it renders natively in Notion, Linear, GitHub and Confluence.
(b) PDF export alongside the existing `.md`button. (c) A read-only share route that renders
below 768px — scope`MobileGate` to the editing routes only rather than the whole group.
- **Done when**: a `prd-mermaid` test asserts a decision node with two conditional edges emits
  `A{Payment authorised?}` with two labelled arrows; the exported markdown contains a ```mermaid
fence; the share route renders at a 375px viewport. `npm test`, `npm run build` pass.

### [F8] Minor — `module_detail` mode advertises a node type it has no tool to create

- **Where**: `src/lib/services/prompt-builder.ts:317`; tool set `NODE_EDGE_TOOLS` at
  `llm-tools.ts:386-394`; `createNodeTool` enum at `llm-tools.ts:147`
- **Current behavior**: the module-detail prompt states "Available node types: `process`,
  `decision`, `entry`, `exit`, `start`, `end`, `question`". But `NODE_EDGE_TOOLS` does not include
  `addOpenQuestionsTool`, and `createNodeTool`'s enum omits `'question'`. There is no way to create
  one in that mode. Worse, `createFlowNodeSchema` _does_ accept `'question'`
  (`flow-node.ts:3-11`), and the executor passes the value straight through
  (`llm-tools.ts:646`) — so a model that ignores the enum creates an orphan marker: a `?` node on
  the canvas with no `open_questions` row, invisible to the questions panel and impossible to
  resolve.
- **Why it matters**: low frequency, but the failure is silent and produces a canvas artefact the
  user cannot remove through the normal path. It also means module-detail mode — the deepest part
  of the product — cannot record gaps at all, which is where gaps are most likely to surface.
- **Evidence**: confirmed by reading the tool set composition, the enum, the zod schema and the
  executor's pass-through.
- **Fix**: either add `addOpenQuestionsTool` and `resolveOpenQuestionTool` to `NODE_EDGE_TOOLS`
  (preferred — module detail should be able to flag gaps), or remove `question` from the
  module-detail prompt list at `prompt-builder.ts:317`. In both cases, defend the invariant in the
  executor: reject `node_type: 'question'` in the `create_node` branch with a message pointing at
  `add_open_questions`, so the only path to a question node is the one that also creates its row.
- **Done when**: a test asserts `create_node` with `nodeType: 'question'` returns an error result
  naming `add_open_questions`. `npm test` passes.

### [F9] Minor — The product is called MermaidAI and contains no Mermaid

- **Where**: `grep -rin "mermaid" src/ --include="*.ts*"` matches only marketing copy in
  `src/app/page.tsx`, the auth pages/layout, `MobileGate.tsx` and `FloatingChat.tsx`
- **Current behavior**: no Mermaid syntax is generated, parsed or rendered anywhere.
- **Why it matters**: minor on its own, but it points at the missed distribution channel in F7 —
  Mermaid is the format that would let these diagrams live in the tools where PRDs actually live.
  Resolved as a side effect of F7(a).
- **Evidence**: confirmed by grep.
- **Fix**: covered by F7(a). No separate work.
- **Done when**: F7's Done-when passes.

**Long tail, not itemised.** `npm test` surfaces two vitest worker crashes
(`ERR_REQUIRE_ASYNC_MODULE`, jsdom → `@asamuzakjp/css-color`) that abort two files without failing
the run — all 80 files report passing, so this masks whether those files' tests actually executed;
worth pinning `environment: 'happy-dom'` (already a devDependency) or a per-file
`@vitest-environment` override. Beyond that: `truncateDescription`
(`project-workspace.tsx:49-56`) splits on `.` and mangles decimals and abbreviations;
`generateOverview` hardcodes `en-AU` date formatting (`prd-export-service.ts:29`); the module
`description`/`prd_content` split has no documented boundary, so the model has two places to put
the same prose. None of these change a decision about the visual PRD work.

---

## The one thing

**F1.** Every other finding describes a document that renders badly; F1 describes data that no
longer exists. The resolutions extracted during a client call — the entire commercial value of the
scoping session — are written to the database and destroyed by a cascade one statement later, with
no soft-delete and no audit trail. A bad renderer can be rewritten against data that survived; F1
means there is nothing to re-render. Fix the cascade before building anything on top of it, or F6's
coverage rail and F2's merged PRD will both be built over a hole.

---

## Verdict

**Fix criticals first, then rethink the approach.** The engineering is sound — clean type-check,
951 passing tests, genuinely good ideas in the invariants loop and the question markers. But the
path from canvas to PRD has two defects that make the current deliverable unsafe to hand a client
(F1 destroys the answers, F3 presents unanswered questions as specified behaviour), and one that
makes it near-empty (F2 discards 91% of the document in normal use). Those three are days of work,
not weeks, and they are worth doing before anything else.

The larger question the findings point at is strategic and should not be answered by this fix
round: MermaidAI models software as a flowchart, and an app/web PRD is not a flowchart. F5 is the
honest version of that — until `screen` and its states exist, the tool captures the least contested
part of the spec very well and the most contested part not at all. Treat F1-F4 as repairs and F5-F6
as the actual product decision.

---

## Execution contract

**Fix order**: F2 → F1 → F3 → F4 → F8 → F5 → then Group A and Group B in parallel.

Reasons where non-obvious:

- **F2 first** despite F1 being "the one thing": F2 is a ~30-line deletion with the largest
  visible payoff, and it makes every later change observable in the preview. F1's migration is
  slower and benefits from a preview that already shows graph content.
- **F1 before F3**: both edit `prd-renderers.ts`; F1 changes the question-to-module filter at
  line 134, F3 changes the flow walk that feeds it. Doing F3 first means redoing its filter.
- **F4 before F5**: F4 restructures how PRD content is written; F5 adds node types that need new
  PRD sections. Reversed, F5's sections get written into the append-only column and must be
  migrated twice.
- **F8 before F5**: both edit the `create_node` enum and executor branch in `llm-tools.ts`. F8 is
  three lines; landing it first avoids a conflict in the same switch case.

**Parallel groups**: only after F5 lands.

- **Group A — F6** (coverage rail). Write boundary: `src/lib/scope-coverage.ts` (new),
  `src/components/canvas/CoverageRail.tsx` (new), `src/components/dashboard/scope-workspace.tsx`,
  `src/lib/services/prompt-builder.ts`, and a new migration file.
- **Group B — F7 + F9** (exports and share). Write boundary:
  `src/lib/services/prd-mermaid.ts` (new), `src/lib/prd-download.ts`,
  `src/lib/services/prd-export-service.ts`, `src/app/(dashboard)/layout.tsx`,
  `src/components/MobileGate.tsx`, and the new share route directory.

These two groups touch disjoint files and share no type, schema or API shape — verified against
the file lists above. They rejoin for full verification only after both merge. **Everything in the
sequential spine (F2, F1, F3, F4, F8, F5) must stay sequential** — each pair in it shares at least
one file, as noted in the reasons above.

**Skip list**: F9 requires no separate work (subsumed by F7a). The long-tail items — the vitest
worker crashes, `truncateDescription`, the hardcoded `en-AU` locale, the
`description`/`prd_content` boundary — are explicitly out of scope for this round. Do not start
the screen-state matrix view or any wireframe/UI-generation feature; both are downstream of F5 and
neither is a finding here.

**Constraints**:

- Migrations are forward-only. Add new timestamped files under `supabase/migrations/`; never edit
  an existing migration. Mirror the RLS policy shape already used at
  `20260408000000_add_scoping_mode.sql:36-80` for any new table — every new table must have RLS
  enabled and project-ownership policies for all four operations.
- Do not weaken or remove the graph-invariants feedback loop (`graph-invariants.ts`,
  `okWithGraphCheck`). If a change alters tool result shape, keep the `Graph check:` contract
  intact — the scope prompt depends on it at `prompt-builder.ts:431`.
- Do not change the server-side question dedup at `llm-tools.ts:834-852` except as F1 specifies.
- Do not modify `e2e/` or `playwright.config.ts` in this round.
- All work on branch `claude/prd-visual-constructive-feedback-g2qqka`. Do not open a pull request
  unless asked.

**Per-fix protocol**: after each finding, run that finding's Done-when check plus
`npm run type-check` before starting the next. On failure: retry once; if it fails again, stop and
report which finding and what the failure was. Do not carry a broken finding forward into the next
one — the spine is sequential precisely because later fixes assume earlier ones landed.

**Full verification** after all fixes:

```
npm run type-check
npm run lint
npm test
npm run build
```

All four must pass. Note that `npm test` currently reports two `ERR_REQUIRE_ASYNC_MODULE` worker
errors while still showing 80/80 files passing — that is pre-existing (see long tail), not
something a fix here introduced. Do not treat it as a regression, and do not fix it in this round.

**Completion report**: for each of F1-F9, state fixed / skipped / disputed. For fixed, give the
Done-when evidence (the command run and its result). For disputed, give the reasoning and the code
or output that contradicts the finding — disputing a finding is legitimate and expected if the
evidence supports it, but it must be argued, not asserted.
