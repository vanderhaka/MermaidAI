# Critique: MermaidAI as a visual way to see how an app's requirements fit together

Feature-level critique judged against the product's stated purpose: **a visual way to see how all
of an app's requirements fit together.** That framing drives the ranking below — the canvas is the
deliverable, not an input to a markdown export, and "fit together" means the relationships between
requirements, not the order of steps.

Read exhaustively: `src/lib/services/prd-renderers.ts`, `prd-export-service.ts`, `prd-download.ts`,
`llm-tools.ts`, `prompt-builder.ts`, `prompt-sections.ts`, `open-question-service.ts`,
`graph-service.ts`, `src/components/dashboard/PrdPreviewPanel.tsx`, `project-workspace.tsx`,
`scope-workspace.tsx`, `tool-event-applier.ts`, `src/types/graph.ts`, `src/lib/schemas/*`,
`src/lib/project-modes.ts`, `src/components/canvas/views/ModuleMapView.tsx`, and all seven files in
`supabase/migrations/`. Sampled, not read exhaustively: `src/lib/canvas/*` layout internals (9
modules), the node/edge React components, `e2e/`.

Verification performed: `npm run type-check` (clean), `npm test` (80 files, 951 tests passing),
`npm run lint` (clean), plus a throwaway probe harness executed against the real
`generateSinglePrd` / `renderModulePrd` code paths to confirm F3, F4 and F5 with actual output
rather than by inspection. The probe was deleted after use; its assertions are reproduced in the
Done-when sections.

**Not verified live.** The app was never booted — `src/lib/config.ts` requires four Supabase env
vars and no credentials exist in this environment. No finding rests on observed browser behaviour.
F2 in particular is confirmed from the SQL schema plus its two call sites rather than from watching
a row disappear; its Done-when gives the query to confirm against a real database.

> Findings are numbered by severity and this numbering supersedes any earlier draft. No
> implementation work had started when the renumber happened.

---

## What's genuinely strong

- **Open questions as canvas nodes** (`llm-tools.ts:857-893`). Amber `?` markers created in one
  batched call and wired by edge to the step they threaten. Ignorance made visible and spatially
  located next to the thing it endangers. This is the only place the product already does what it
  says it does, and the design instinct behind it is exactly right.
- **Graph invariants as a model feedback loop** (`graph-invariants.ts`, via `okWithGraphCheck` at
  `llm-tools.ts:513-525`). Tool results tell the model its own graph is malformed and the prompt
  requires repair before replying (`prompt-builder.ts:431`). Genuinely sophisticated and rare.
- **`insert_node_between` as one atomic tool** (`llm-tools.ts:707-784`). Models "add a step in the
  middle" as a single user intent, forbids hand-rolling it, and reports partial failure as a
  warning so the model repairs rather than restarts.
- **Server-side question dedup** (`llm-tools.ts:834-852`). Normalising to a comparison key
  server-side instead of trusting a prompt rule is the correct instinct.
- **Test discipline.** 951 tests, clean type-check and lint. Nothing below is rot; these are design
  gaps in a well-kept codebase.

---

## Findings

Ten findings: 3 Critical, 5 Major, 2 Minor. F1 is the root cause of F3, F6 and F7 and a large part
of why F2 is so damaging — read it first.

### [F1] Critical — There is no such thing as a requirement in this product

- **Where**: `supabase/migrations/20260406000000_create_core_tables.sql:34-104` (all core tables);
  `20260408000000_add_scoping_mode.sql:17` (the only later table); `src/types/graph.ts` (all
  exported entity types); `modules.prd_content` (`20260409000000_add_prd_content_to_modules.sql`)
- **Current behavior**: the schema has eight tables — `profiles`, `projects`, `modules`,
  `flow_nodes`, `flow_edges`, `module_connections`, `chat_messages`, `open_questions`. None of them
  is a requirement. Requirements exist only as unstructured markdown accumulated into a single
  `modules.prd_content` text column by `write_prd` (`llm-tools.ts:802-818`), and that column is
  rendered in exactly one place: the `PrdPreviewPanel` drawer.

  Searching the source for the concept confirms it is only ever a word, never an object:
  `grep -rn "requirement" src/ -i` returns UI button labels
  (`project-workspace.tsx:373`, `scope-workspace.tsx:463`), landing-page copy
  (`app/page.tsx:62`), prompt prose instructing the model to "document the requirements"
  (`prompt-builder.ts:154, 252, 311, 477`), and one markdown heading name inside the `write_prd`
  guidance (`prompt-builder.ts:487`). There is no type, no table, no service, no component.

  So the canvas — the product's entire visual surface — renders modules, steps, branches and gaps.
  The requirements are the one thing it cannot show, because they are prose in a text column.

- **Why it matters**: this is the product's stated purpose going unmet at the data layer. "A visual
  way to see how all an app's requirements fit together" requires (a) a requirement to be an object
  you can draw, and (b) relationships between requirements to be edges you can follow. Neither
  exists. What the canvas currently shows is _control flow_ — the order behaviour happens in —
  which is a different and far less contested thing. Nobody disputes that checkout follows the
  cart; they dispute whether guest checkout is in scope, whether refunds run 14 or 30 days, and
  which screens an unverified user may see. Those are requirements, and they are invisible.

  This is also why several other findings exist rather than being independent bugs. F3 (the PRD
  renderer must _choose_ between authored prose and graph render) is unavoidable when structure and
  requirements are stored in two incompatible shapes with no join. F6 (no `screen`/`role`/`data`
  node types) and F7 (the coverage map has nothing to render) are both downstream of having no
  requirement object to attach to.

  The sharpest illustration is the resolution pipeline. When a client answers an open question,
  that answer _is_ a requirement — atomic, client-confirmed, and the single most valuable artefact
  the app produces. The current pipeline is `open question → client answers → DELETE` (see F2).
  The one moment the system holds a structured requirement, it throws it away.

- **Evidence**: confirmed by enumerating `CREATE TABLE` across all seven migrations (eight tables,
  listed above), by reading every exported type in `src/types/graph.ts`, and by the case-insensitive
  source grep for "requirement" whose full result set is the nine incidental matches above.
- **Fix**: introduce requirements as first-class objects, then draw them. Staged so value lands
  early:
  1. **The object.** New `requirements` table: `id`, `project_id`, `module_id` (nullable),
     `statement` text, `kind` (`functional` | `rule` | `constraint` | `non_functional`), `status`
     (`proposed` | `agreed` | `disputed` | `out_of_scope`), `coverage_area` (the F7 enum),
     `source_question_id` (nullable FK), `created_at`, `updated_at`. RLS mirroring the policy shape
     at `20260408000000_add_scoping_mode.sql:36-80`.
  2. **The pipeline.** Change `resolve_open_question` (`llm-tools.ts:914-932`) to _promote_ rather
     than delete: on resolve, insert a `requirements` row with `status: 'agreed'`,
     `statement` = the resolution, `coverage_area` inherited from the question, and
     `source_question_id` set. This is the same code path F2 fixes — do them together.
  3. **The relationships.** `requirement_links` table: `source_requirement_id`,
     `target_requirement_id`, `kind` (`depends_on` | `conflicts_with` | `refines`), plus
     `requirement_nodes` (`requirement_id`, `node_id`) for traceability onto flow steps. "Fit
     together" is exactly these two tables.
  4. **The visual.** A requirements view alongside the existing module map and module detail
     (`CanvasContainer` already switches views): nodes are requirements grouped by module or
     coverage area, edges are `requirement_links`, colour by `status`, and a badge showing
     unresolved questions blocking each one. Selecting a requirement highlights the flow nodes it
     governs on the flow view — that cross-highlight is what makes the two views one product
     rather than two.
  5. **Minimum viable slice** if the above is too large to land at once: steps 1, 2 and a
     requirements list rendered as chips on the existing module cards
     (`ModuleCardNode.tsx`). That alone makes the product's core promise true — requirements
     become countable, visible, and attached to structure — and everything else is additive.

  Give the model a `write_requirement` tool alongside `write_prd` so requirements are captured
  structurally at source rather than parsed back out of markdown later.

- **Done when**: a resolved open question produces a `requirements` row queryable by
  `select statement, status from requirements where status = 'agreed'`; the requirements view
  renders those rows as nodes with `requirement_links` as edges; selecting one highlights its
  linked flow nodes. `npm test`, `npm run type-check`, `npm run lint`, `npm run build` pass.

### [F2] Critical — Resolving an open question permanently deletes it, along with the client's answer

- **Where**: `src/lib/services/llm-tools.ts:914-932`;
  `supabase/migrations/20260408000000_add_scoping_mode.sql:20`;
  `src/lib/services/open-question-service.ts:35-62`; `src/lib/services/graph-service.ts`
  (`removeNode`)
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

  The `open_questions` row — including the `resolution` written one statement earlier — is destroyed
  by the cascade. `status = 'resolved'` and `resolved_at` can never be observed in persisted data.

  The client store briefly holds a resolved copy (`tool-event-applier.ts:99-110`, `202-210`), but
  every send ends with `router.refresh()` (`project-workspace.tsx:313`), the page re-reads via
  `listOpenQuestions` (`dashboard/[projectId]/page.tsx:73`), and the `useEffect` at
  `project-workspace.tsx:121-138` overwrites the store with the now-empty list. The answer survives
  until the next message and no longer.

- **Why it matters**: under this product's purpose, resolutions are not metadata about questions —
  they are the requirements themselves (see F1). Every decision extracted from a client during a
  call is written and deleted milliseconds later, unrecoverably, with no soft-delete and no audit
  trail. The visible consequence is that the app can only ever display what nobody answered: it
  shows the failures of the session and discards the successes. That is the exact inverse of
  "see how all the requirements fit together."
- **Evidence**: confirmed by reading the FK declaration, the resolve handler, both service
  functions and the page load path. Two pieces of code prove the intent was the opposite:
  `page.tsx:73` deliberately calls `listOpenQuestions` (all statuses) rather than
  `listOpenOpenQuestions`, and `prd-renderers.ts:110-117` contains a whole `### Resolved` render
  branch. Both are written for data the cascade guarantees never exists — that branch is
  unreachable dead code. Not confirmed against a live database (no credentials).
- **Fix**: decouple the question record from its marker node, and promote the resolution into a
  requirement (F1 step 2 — same code path, do them in one change). New forward-only migration:

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
  (`prd-renderers.ts:134`) from `moduleNodeIds.has(q.node_id)` to `q.module_id === module.id`. Keep
  the `removeNode` call — the marker _should_ leave the canvas on resolve; only the record must
  outlive it. Preserve the dedup at `llm-tools.ts:834-852`; it reads `listOpenQuestions`, which will
  now include resolved rows, and that is correct — a settled topic should not be re-asked.

- **Done when**: a test asserts that after `resolveOpenQuestion`, `listOpenQuestions` still returns
  the row with `status: 'resolved'` and its resolution text, and that a `requirements` row was
  created; a `prd-renderers` test asserts the `### Resolved` branch renders. Against a real
  database: `select id, status, resolution from open_questions where status = 'resolved'` returns
  rows after a resolve. `npm test`, `npm run type-check` pass.

### [F3] Critical — One `write_prd` call discards the entire graph-derived document

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
  then on the entire graph-derived render — Interface, Dependencies, the numbered flow walk, the
  Questions section, all of `prd-renderers.ts:122-193` — is dropped from the preview _and_ from
  `handleDownload` (`PrdPreviewPanel.tsx:52-66`), which branches on the same flag.

- **Why it matters**: the prompts instruct `write_prd` after essentially every graph mutation
  (`prompt-builder.ts:311`, `481-483`, `536`), so the flag flips within the first couple of
  messages of every session in every mode. The graph-derived renderer therefore almost never runs
  in production. Measured on a realistic five-node checkout module: 432 characters of structured
  document reduced to 39 — **91% discarded.** This is the visible symptom of F1: with structure in
  a graph and requirements in a text blob and no join between them, a renderer has no choice but to
  pick one.
- **Evidence**: executed. Probe harness called the real `generateSinglePrd` and a copy of
  `buildAuthoredMarkdown` on identical fixtures. Generated output contained `## Interface`, all five
  flow steps, both decision branches and the open question; authored output contained none of them.
- **Fix**: compose instead of choosing. Give `renderModulePrd` an `authored?: string` parameter
  emitted as a `## Requirements` section after `## Interface`/`## Dependencies` and before
  `## Flow`; `PrdPreviewPanel` then calls `generateSinglePrd(input)` unconditionally and deletes
  both `hasAuthored` and `buildAuthoredMarkdown`. `handleDownload` loses its `hasAuthored` branch
  and keeps only the single-vs-multi-module split. Once F1 lands, that `## Requirements` section
  should be generated from `requirements` rows rather than the prose blob. Edge cases to preserve:
  a module with empty `prd_content` renders exactly as today; the multi-module `---` separator
  survives; the empty state at `PrdPreviewPanel.tsx:122-126` still appears when there are no
  modules, nodes or authored content.
- **Done when**: a `prd-export-service` test asserts that for a module with both `prd_content` and
  flow nodes, output contains the authored text _and_ every node label _and_ `## Interface`.
  `npm test`, `npm run type-check`, `npm run lint` pass.

### [F4] Major — Unanswered questions render as specified system behaviour

- **Where**: `src/lib/services/prd-renderers.ts:48-92` (`renderFlowSection`), `7-46` (`walkFlow`)
- **Current behavior**: neither function excludes `node_type === 'question'`. Question markers are
  ordinary `flow_nodes` rows (`llm-tools.ts:857-864`) edged from the step they relate to
  (`llm-tools.ts:884-893`), so they are traversed like any other node and fall through to the
  generic branch at `prd-renderers.ts:81-88`. Actual generated output:

  ```
  2. **Payment authorised?** *(decision)*

     - **Yes** → Show order confirmation
     - **No** → Show decline message
     - **Default** → Do we retry a declined card automatically?

  3. **Do we retry a declined card automatically?**
  ```

  The `Default` line comes from `prd-renderers.ts:72`, which falls back to that literal when an edge
  has no condition or label — and question edges are created with neither.

- **Why it matters**: an open question is the _absence_ of a decision. Rendering it as a labelled
  branch of a payment decision asserts the opposite: that a default path for declined cards exists.
  This is the most directly damaging finding in the review because it does not read as a bug — it
  reads as a specification, in a document used for sign-off on paid work. It is also type confusion
  caused by F1: questions, steps and requirements are all forced through one `flow_nodes` primitive.
- **Evidence**: executed. Probe added one `question` node edged from the decision node; the block
  above is verbatim output.
- **Fix**: filter question nodes out of the flow walk and keep them in the Questions section only.
  In `renderModulePrd`, narrow before `renderFlowSection`:
  `const flowNodes = moduleNodes.filter((n) => n.node_type !== 'question')`, passing `flowNodes` to
  `renderFlowSection` while still using full `moduleNodes` for question lookup. Also drop edges
  targeting question nodes so no dangling branch is emitted:
  `moduleEdges.filter((e) => !questionNodeIds.has(e.target_node_id))`. Separately change the
  `'Default'` fallback at `prd-renderers.ts:72` to `'Otherwise'` — it is only ever reached for an
  unlabelled edge, and `Default` implies a configured default.
- **Done when**: a `prd-renderers` test builds a module with a question node edged from a decision
  and asserts `## Flow` contains neither the question text nor a `Default` branch, while
  `## Questions` still lists it. `npm test` passes.

### [F5] Major — `write_prd` is append-only, so requirements accumulate as contradictions

- **Where**: `src/lib/services/llm-tools.ts:802-818`; tool description at `334-353`
- **Current behavior**:

  ```ts
  const existing = modResult.data.prd_content ?? ''
  const updated = existing ? `${existing}\n\n${markdown}` : markdown
  ```

  No replace, no section addressing, no delete. The description states "Each call appends to the
  existing content" and the prompts call it after every mutation.

- **Why it matters**: requirements change constantly during a call. Three passes over refund policy
  produce three `## Refunds` headings with mutually exclusive rules, chronologically ordered, with
  nothing marking which is current:

  ```
  ## Refunds

  Refunds allowed within 14 days.

  ## Refunds

  Refunds allowed within 30 days.

  ## Refunds

  No refunds on sale items.
  ```

  A record that cannot be revised is a transcript. It also means that even after F3, the merged
  document is incoherent — you cannot show how requirements fit together when three versions of the
  same requirement coexist with equal standing.

- **Evidence**: executed. Probe replayed the exact append expression three times; output verbatim.
- **Fix**: if F1 lands, requirements move to their own table and this largely dissolves — the
  remaining `prd_content` should hold narrative prose only. Until then (or for that residual prose),
  make it section-addressed: change the tool to
  `write_prd(moduleId, section, markdown, mode?: 'append' | 'replace')` defaulting to `'replace'`,
  upserting on `(module_id, section)` in a `module_prd_sections` table (`id`, `module_id` FK
  cascade, `section`, `content`, `position`, timestamps, unique on `(module_id, section)`), RLS
  mirroring `20260408000000_add_scoping_mode.sql:36-80`. Update the prompt sites that describe
  `write_prd` (`prompt-builder.ts:152-154`, `250-252`, `331-333`, `481-493`, plus
  `prompt-builder-brainstorm.ts` if it mentions it) to name the section and state that re-writing
  replaces it. Do not leave two sources of truth: migrate `PrdPreviewPanel` and
  `prd-export-service` in the same change, or keep `prd_content` populated as a derived
  concatenation.
- **Done when**: a test asserts two `write_prd` calls with the same `section` yield one section
  containing only the second body, and different sections yield two. Existing `llm-tools` tests
  pass. `npm test`, `npm run type-check` pass.

### [F6] Major — The node vocabulary cannot express an app or website

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

  Six program-flowchart primitives plus the question marker. No `screen`, no `state`, no `role`, no
  `data` entity. The scope prompt additionally caps labels at 3-6 words
  (`prompt-builder.ts:434`).

- **Why it matters**: requirements for an app attach to _things_ — a screen, a role, a data entity —
  and the app has no way to name any of them. "The checkout page keeps the card form populated and
  shows an inline error when payment is declined" compresses to a `process` node labelled
  `Show error`. The distinction between a screen, a state of that screen, and a background job is
  destroyed at write time, so requirements have nothing stable to attach to and no renderer can
  recover the difference. Combined with F1, this is why the product currently visualises sequence
  instead of structure.
- **Evidence**: confirmed by reading the type union, the zod enum, all three tool enums and all
  three prompt node-type lists. Cross-checked that nothing else exists: `layout.ts:42,667,878`
  handles exactly this set.
- **Fix**: extend with `screen`, `role` and `data`, in that order of value. `screen` is the one that
  matters: render it as a card with a states strip (empty / loading / error / success), each state
  marked defined / unknown / N-A, where `unknown` is clickable and raises an open question. Touch
  points, all mechanical: `src/types/graph.ts:44`, `FLOW_NODE_TYPES` in `flow-node.ts`, one
  component per type under `src/components/canvas/nodes/`, registration in the `nodeTypes` map used
  by `ModuleDetailView`, the three tool enums, the `layout.ts:667` and `layout.ts:878` sizing/spread
  sets, and the prompt lists. The hard part is prompt guidance for when a step is a screen versus a
  process — budget iteration there, not in the type plumbing.
- **Done when**: `create_node` with `nodeType: 'screen'` round-trips through `createFlowNodeSchema`
  and renders; `renderModulePrd` emits screens under `## Screens` rather than as flow steps.
  `npm test`, `npm run type-check`, `npm run lint`, `npm run build` pass.

### [F7] Major — The completeness model exists only in the prompt and renders zero pixels

- **Where**: `src/lib/services/prompt-builder.ts:404-420`
- **Current behavior**: eleven coverage areas — Actors & roles, Onboarding & verification,
  Discovery, Core transaction, Money, Scheduling & availability, Failure modes, Post-transaction,
  Communications, Operations, Liability & compliance — with instructions to track which remain
  unexplored and steer follow-ups accordingly. `grep -rln "Liability & compliance" src/` returns
  exactly one file: `prompt-builder.ts`. Nothing under `src/components/` or `src/app/` references
  any area name.
- **Why it matters**: "**all** an app's requirements" is a completeness claim, and this is the only
  completeness model in the codebase. The model reasons over eleven areas and the user sees none of
  it, so there is no way to answer "what's left?" — the product's central question. Two concrete
  costs: the client cannot see how much of the engagement remains, and because the reasoning is
  invisible the questioning reads as arbitrary. The prompt is actively fighting that perception at
  `prompt-builder.ts:395-397`, where it must forbid the model from ever offering to move on. A
  visible rail makes that behaviour self-explanatory instead of stubborn.
- **Evidence**: confirmed by grep across `src/` for the area names and for "Coverage".
- **Fix**: extract the eleven areas to `src/lib/scope-coverage.ts` as a shared exported constant
  interpolated by `buildScopeBuildPrompt`, so prompt and UI cannot drift. Store `coverage_area` on
  both `open_questions` and `requirements` (F1) — prefer an explicit column over deriving from the
  free-text, model-authored `section`. Render a rail down the canvas edge in `ScopeWorkspace`: one
  segment per area, grey (untouched) / amber with count (open questions) / green (requirements
  agreed, none open). Reuse the `OpenQuestionsPanel` selection handler so clicking a segment filters
  to that area. Depends on F1 and F2: without them every area drops back to grey the moment
  questions are answered, which is precisely backwards.
- **Done when**: the eleven strings exist in exactly one module imported by both `prompt-builder.ts`
  and the rail; a component test asserts an area with one open question renders amber and an area
  with only agreed requirements renders green. `npm test` passes.

### [F8] Major — The visual never leaves the app, and the client cannot open what does

- **Where**: `src/lib/prd-download.ts:19-40`; `src/lib/services/prd-export-service.ts:88-109`;
  `src/app/(dashboard)/layout.tsx:4`; `src/components/MobileGate.tsx:5,19-33`
- **Current behavior**: exactly two exits — a `.md` file or a `.zip` of `.md` files. No image, no
  hosted link, no embeddable diagram, no PDF. `MobileGate` hard-blocks the whole `(dashboard)`
  route group below 768px with "MermaidAI is built for desktop".
- **Why it matters**: if the canvas is the deliverable, the deliverable currently cannot be
  delivered. The stated use case is "Lightweight scoping for live client calls"
  (`project-modes.ts:37`); the client leaves with a zip of markdown they mostly cannot open, and
  cannot view the diagram on the phone in their hand because the gate covers reading as well as
  editing. Priority within this finding shifts under the product's purpose: **the read-only share
  link is the important part, not the file formats.**
- **Evidence**: confirmed by reading both export modules (only `downloadMarkdown` and
  `downloadPrdZip` exist) and the layout wiring (`MobileGate` wraps `{children}` for the group).
- **Fix**: in priority order. (a) A read-only share route rendering the live canvas plus the
  requirements view — scope `MobileGate` to editing routes only so it renders on a phone.
  (b) Mermaid export: `src/lib/services/prd-mermaid.ts` emitting `graph TD` from the traversal
  `walkFlow` already performs (`prd-renderers.ts:7-46`) — roughly 40 lines reusing a
  node-type-to-shape mapping (`process` → `[]`, `decision` → `{}`, `start`/`end` → `()`), embedded
  as a fenced ` ```mermaid ` block so it renders natively in Notion, Linear, GitHub and Confluence.
  (c) PDF alongside the existing `.md` button.
- **Done when**: the share route renders at a 375px viewport; a `prd-mermaid` test asserts a
  decision node with two conditional edges emits `A{Payment authorised?}` with two labelled arrows
  and that exported markdown contains a ` ```mermaid ` fence. `npm test`, `npm run build` pass.

### [F9] Minor — `module_detail` mode advertises a node type it has no tool to create

- **Where**: `src/lib/services/prompt-builder.ts:317`; `NODE_EDGE_TOOLS` at `llm-tools.ts:386-394`;
  `createNodeTool` enum at `llm-tools.ts:147`
- **Current behavior**: the module-detail prompt lists `question` among available node types, but
  `NODE_EDGE_TOOLS` excludes `addOpenQuestionsTool` and `createNodeTool`'s enum omits `'question'`.
  There is no way to create one in that mode. Worse, `createFlowNodeSchema` _does_ accept
  `'question'` (`flow-node.ts:3-11`) and the executor passes the value straight through
  (`llm-tools.ts:646`), so a model ignoring the enum creates an orphan: a `?` node with no
  `open_questions` row, invisible to the questions panel and impossible to resolve.
- **Why it matters**: low frequency, but the failure is silent and leaves a canvas artefact the user
  cannot remove through any normal path. It also means module-detail — the deepest part of the
  product — cannot record gaps at all, which is where gaps most often surface.
- **Evidence**: confirmed by reading the tool set composition, the enum, the zod schema and the
  executor pass-through.
- **Fix**: add `addOpenQuestionsTool` and `resolveOpenQuestionTool` to `NODE_EDGE_TOOLS` (preferred
  — module detail should be able to flag gaps); alternatively remove `question` from
  `prompt-builder.ts:317`. Either way defend the invariant in the executor: reject
  `node_type: 'question'` in the `create_node` branch with a message pointing at
  `add_open_questions`, so the only path to a question node also creates its row.
- **Done when**: a test asserts `create_node` with `nodeType: 'question'` returns an error naming
  `add_open_questions`. `npm test` passes.

### [F10] Minor — The product is called MermaidAI and contains no Mermaid

- **Where**: `grep -rin "mermaid" src/ --include="*.ts*"` matches only marketing copy in
  `src/app/page.tsx`, the auth pages/layout, `MobileGate.tsx` and `FloatingChat.tsx`
- **Current behavior**: no Mermaid syntax is generated, parsed or rendered anywhere.
- **Why it matters**: minor alone, but it points at the distribution gap in F8 — Mermaid is the
  format that would let these diagrams live where requirements documents actually live.
- **Evidence**: confirmed by grep.
- **Fix**: covered by F8(b). No separate work.
- **Done when**: F8's Done-when passes.

**Long tail, not itemised.** `npm test` surfaces two vitest worker crashes
(`ERR_REQUIRE_ASYNC_MODULE`, jsdom → `@asamuzakjp/css-color`) that abort two files without failing
the run — all 80 files report passing, so this masks whether those files executed; worth pinning
`environment: 'happy-dom'` (already a devDependency) or a per-file `@vitest-environment` override.
Also: `truncateDescription` (`project-workspace.tsx:49-56`) splits on `.` and mangles decimals and
abbreviations; `generateOverview` hardcodes `en-AU` dates (`prd-export-service.ts:29`); the
`description`/`prd_content` split has no documented boundary, so the model has two places to put
the same prose. None change a decision about the visual requirements work.

---

## The one thing

**F1.** The product is described as a visual way to see how an app's requirements fit together, and
there is no requirement in it — not as a table, a type, a service, or anything the canvas can draw.
Requirements are prose in one text column, visible only in a drawer, while the canvas draws control
flow. Every other Critical is downstream: F2 deletes requirements at the moment they are confirmed,
and F3 exists only because structure and requirements are stored in shapes that cannot be joined.

The cheapest proof of the idea is the promotion pipeline in F1 step 2 plus F2 — turn
`open question → client answers → DELETE` into `open question → client answers → requirement`, and
render those requirements as chips on the module cards. That is a small change that makes the core
promise true for the first time, and everything else in F1 builds on it.

---

## Verdict

**Rethink the model, but repair the data layer first.** The engineering is sound — clean
type-check, 951 passing tests, real quality in the invariants loop and the question markers. The
gap is not craft, it is that the product models software as a flowchart while describing itself as
a requirements map, and those are different objects with different relationships.

Two things follow. First, three defects make the current output unsafe to put in front of a client
and should be fixed regardless of any product decision: F2 destroys the client's answers, F4
presents unanswered questions as specified behaviour, F3 empties the document in normal use. Those
are days of work. Second, F1 is the actual product decision, and it is worth making deliberately
rather than incrementally — a `requirements` table with links to modules, flow nodes and each other
is what turns the existing canvas engineering into the product being described. The layout work in
`src/lib/canvas/*` is already good enough to draw that graph the day it exists; it is currently
pointed at the less contested half of the problem.

---

## Execution contract

**Fix order**: F3 → (F2 + F1 steps 1-2 together) → F4 → F5 → F9 → F6 → F1 steps 3-5 → then Group A
and Group B in parallel.

Reasons where non-obvious:

- **F3 first** despite F1 being the one thing: it is a ~30-line deletion with immediate visible
  payoff and it makes every later change observable in the preview.
- **F2 and F1 steps 1-2 in one change**: both rewrite the same `resolve_open_question` handler
  (`llm-tools.ts:914-932`). Splitting them means writing the resolve path twice.
- **F2 before F4**: both edit `prd-renderers.ts` — F2 changes the question-to-module filter at line
  134, F4 changes the flow walk feeding it. Reversed, F4's filter is redone.
- **F5 before F6**: F5 restructures how content is written; F6 adds node types needing new sections.
  Reversed, those sections get written into the append-only column and migrate twice.
- **F9 before F6**: both edit the `create_node` enum and executor branch. F9 is three lines; landing
  it first avoids a conflict in the same switch case.
- **F1 steps 3-5 last in the spine**: the requirements _view_ needs `screen`/`role`/`data` from F6
  to be worth drawing, and needs the table and pipeline from steps 1-2 to have anything to draw.

**Parallel groups**: only after F1 step 5 lands.

- **Group A — F7** (coverage rail). Write boundary: `src/lib/scope-coverage.ts` (new),
  `src/components/canvas/CoverageRail.tsx` (new),
  `src/components/dashboard/scope-workspace.tsx`, `src/lib/services/prompt-builder.ts`, and a new
  migration file.
- **Group B — F8 + F10** (share route and exports). Write boundary:
  `src/lib/services/prd-mermaid.ts` (new), `src/lib/prd-download.ts`,
  `src/lib/services/prd-export-service.ts`, `src/app/(dashboard)/layout.tsx`,
  `src/components/MobileGate.tsx`, and the new share route directory.

These groups touch disjoint files and share no type, schema or API shape — verified against the
file lists above. They rejoin for full verification after both merge. **Everything in the
sequential spine must stay sequential** — each consecutive pair shares at least one file, as noted.

**Skip list**: F10 needs no separate work (subsumed by F8b). The long-tail items — vitest worker
crashes, `truncateDescription`, the `en-AU` locale, the `description`/`prd_content` boundary — are
out of scope this round. Do not build a screen-state matrix view or any wireframe/UI-generation
feature; both are downstream of F6 and neither is a finding here.

**Constraints**:

- Migrations are forward-only. Add new timestamped files under `supabase/migrations/`; never edit an
  existing migration. Every new table must have RLS enabled with project-ownership policies for all
  four operations, mirroring `20260408000000_add_scoping_mode.sql:36-80`.
- Do not weaken or remove the graph-invariants feedback loop (`graph-invariants.ts`,
  `okWithGraphCheck`). If tool result shape changes, keep the `Graph check:` contract intact — the
  scope prompt depends on it at `prompt-builder.ts:431`.
- Do not change the server-side question dedup at `llm-tools.ts:834-852` except as F2 specifies.
- Do not modify `e2e/` or `playwright.config.ts` this round.
- All work on branch `claude/prd-visual-constructive-feedback-g2qqka`. Do not open a pull request
  unless asked.

**Per-fix protocol**: after each finding, run its Done-when check plus `npm run type-check` before
starting the next. On failure retry once; if it fails again, stop and report which finding and what
failed. Do not carry a broken finding forward — the spine is sequential precisely because later
fixes assume earlier ones landed.

**Full verification** after all fixes:

```
npm run type-check
npm run lint
npm test
npm run build
```

All four must pass. Note `npm test` currently reports two `ERR_REQUIRE_ASYNC_MODULE` worker errors
while still showing 80/80 files passing — pre-existing (see long tail), not a regression, and not
to be fixed this round.

**Completion report**: for each of F1-F10, state fixed / skipped / disputed. For fixed, give the
Done-when evidence (command run and result). For disputed, give the reasoning and the code or
output that contradicts the finding — disputing is legitimate and expected where evidence supports
it, but it must be argued, not asserted.
