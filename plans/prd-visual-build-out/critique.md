# Constructive critique: visually building out app/web PRDs

**Scope of this review**: how well MermaidAI's *visual* model supports producing a PRD for an
app or website, and what to change. Code-level review of layout/routing internals is out of scope.

---

## Verdict

MermaidAI builds **flowcharts** and calls the by-product a PRD. For an app or website, the
flowchart is the least contested part of the spec. Nobody argues about "the user clicks checkout,
then we validate the cart." They argue about which screens exist, what each screen looks like when
it's empty or broken, who's allowed to see it, what data it needs, and what was never agreed.

The visual system has no vocabulary for any of that. And the one place a visual PRD would pay off —
the deliverable the client leaves the meeting with — is a markdown drawer.

There's real engineering here (ELK layout, edge separation, handle slotting, graph invariants fed
back to the model for self-repair). It's aimed at the wrong 20% of the document.

---

## What's genuinely strong

Worth protecting through any refactor:

- **Open questions as canvas nodes** (`src/lib/services/llm-tools.ts:857-893`). Amber `?` markers
  wired by edge to the step they relate to. Visible ignorance, spatially located next to the thing
  it threatens. This is the best idea in the product and the only part that's already a *visual PRD*
  rather than a visual flowchart.
- **Graph invariants as a model feedback loop** (`src/lib/canvas/graph-invariants.ts`,
  surfaced via `okWithGraphCheck` in `llm-tools.ts:513-525`). The tool result tells the model its
  own graph is broken and it repairs before replying. Sophisticated, and rare.
- **`insert_node_between` as an atomic tool** (`llm-tools.ts:707-784`). Correctly identifies that
  "add a step in the middle" is a first-class user intent, not three primitive calls.
- **Mode config as data** (`src/lib/project-modes.ts`). Adding a mode is a config entry, not a fork.

---

## The problems

### 1. The node vocabulary cannot describe a web app

```ts
// src/types/graph.ts:44
export type FlowNodeType = 'decision' | 'process' | 'entry' | 'exit' | 'start' | 'end' | 'question'
```

Six shapes, all of them 1970s program-flowchart primitives, plus the question marker. There is no
`screen`, no `state`, no `role`, no `data entity`, no `integration`.

The consequence is lossy compression at the point of capture. "The checkout page shows an inline
error and keeps the card form populated when the payment is declined" becomes a `process` node
labelled `Show error` — because the prompt explicitly instructs 3-6 word labels
(`prompt-builder.ts:434`). The distinction between *a screen*, *a state of that screen*, and *a
background job* is erased on the way into the database, so no downstream renderer can recover it.

For app/web work this is the root cause of most of what follows.

### 2. The PRD is not visual — it's a 672px markdown drawer

`src/components/dashboard/PrdPreviewPanel.tsx:116-127`: `<Markdown>` inside a `prose` container in
a `max-w-2xl` slide-over. Every pixel of layout work in `src/lib/canvas/*` (nine modules) is
discarded at exactly the moment the artefact stops being a working canvas and becomes the
deliverable.

The diagram and the document are two disconnected representations of the same graph, and the
handoff between them is a download button.

### 3. Authoring the PRD silently deletes the generated one

```ts
// src/components/dashboard/PrdPreviewPanel.tsx:47-50
const markdown = useMemo(() => {
  if (hasAuthored) return buildAuthoredMarkdown(projectName, modules)
  return generateSinglePrd(input)
}, [hasAuthored, projectName, modules, input])
```

`hasAuthored` is true as soon as **any** module has a single character of `prd_content`. From that
moment the graph-derived render — Interface, Dependencies, the numbered flow walk, the questions
section, all of `prd-renderers.ts:122-193` — vanishes from both the preview and the download.

So the harder the AI works to document the project, the less of the flowchart survives into the
document. Two renderers that should compose are competing, and the graph one always loses.

This is the single highest-severity item in this review: the app's core visual asset is deleted
from its own deliverable by normal use.

### 4. `write_prd` is append-only, so the PRD is a transcript

```ts
// src/lib/services/llm-tools.ts:809-810
const existing = modResult.data.prd_content ?? ''
const updated = existing ? `${existing}\n\n${markdown}` : markdown
```

No replace, no section addressing, no delete. In a 45-minute scoping call where the client changes
their mind three times about refunds, the PRD ends up containing all three refund policies in
chronological order, with nothing marking which one is current.

The prompt tells the model to call `write_prd` after *every* graph mutation
(`prompt-builder.ts:481-483`), which maximises the accumulation. A document you cannot revise is a
log, and shipping a log to a client as a requirements document is a liability.

### 5. The coverage map — the best available visual — renders zero pixels

`prompt-builder.ts:404-420` defines an 11-area scope sweep: Actors & roles, Onboarding &
verification, Discovery, Core transaction, Money, Scheduling & availability, Failure modes,
Post-transaction, Communications, Operations, Liability & compliance.

The model tracks which areas are still unexplored, steers its follow-up questions with it, and
the user **never sees it**. It exists only inside the system prompt.

This is the answer to "what should the PRD look like visually" and it's already written down. A
client watching an 11-segment rail fill in during a call understands the state of the engagement
instantly, and understands *why* they're being asked about liability when they thought they were
finished. Right now that reasoning is invisible, which makes the questioning feel arbitrary — a
problem the prompt itself is fighting at `prompt-builder.ts:395-397`.

### 6. Nothing represents what clients actually dispute

For an app/web build, scope arguments happen over:

| What's argued about | Current representation |
|---|---|
| Screen inventory ("you never said there was an admin view") | none — screens are `process` nodes |
| Per-screen states (empty / loading / error / partial / success) | none |
| Roles & permissions | none — no role concept exists |
| Data the system stores | none — no entity concept |
| Notifications: who gets told what, when, via what channel | none |
| Explicitly out of scope | none — there is no "no" in the data model |

`entry_points` / `exit_points` on modules (`types/graph.ts:31-32`) are the closest thing to an
interface contract, and they're free-text strings with no schema.

The "out of scope" gap deserves particular attention: an open question that the client explicitly
dismisses is currently resolved and the node deleted (`llm-tools.ts:924-929`). The decision *not*
to build something is one of the most valuable lines in a client PRD, and the product throws it
away.

### 7. Nothing that leaves the app is visual, and nothing is client-shareable

`prd-download.ts` offers exactly two exits: `.md`, or a `.zip` of `.md`
(`prd-export-service.ts:88-109`). No PDF, no hosted link, no image of the diagram, no embed.

The stated use case is *"lightweight scoping for live client calls"*
(`project-modes.ts:37`). At the end of the call the client receives a zip of markdown files —
a format most non-technical clients cannot open usefully. And `MobileGate`
(`src/app/(dashboard)/layout.tsx:4`) hard-blocks under 768px, so they cannot open it on the phone
that's in their hand during the meeting.

Related: the product is called **MermaidAI** and there is no Mermaid syntax anywhere in `src/`.
Mermaid is precisely the format that would let a diagram paste into Notion, Linear, GitHub and
Confluence — the places PRDs actually live.

---

## What to build

Ordered by leverage per unit of work.

### A. Coverage rail — *days, very high impact*

Render the 11-area map from `prompt-builder.ts:404-420` as a persistent rail beside the canvas.
Three states per area: untouched (grey), open questions (amber, with count), covered (green).

Implementation is small because the data is nearly there: `OpenQuestion.section` already carries a
topic string (`schemas/open-question.ts`). Add a stable `area` enum, have the model map its section
to one of the 11, derive rail state from open/resolved counts. Extract the area list to a shared
constant so the prompt and the UI cannot drift.

This converts the model's private checklist into the client-facing artefact "here is what we still
don't know", which *is* the most valuable page of a scoping PRD.

### B. Fix the renderer conflict, then make the PRD a real view — *the actual unlock*

Two steps, in order:

1. **Merge instead of choose.** Replace the `hasAuthored` branch (`PrdPreviewPanel.tsx:47-50`) with
   a composition: authored prose *and* the graph-derived flow/interface/questions sections, per
   module. Nothing should ever delete the diagram from the document.
2. **Promote it to a route.** `/dashboard/[projectId]/prd` as a full-width document view: the
   module's flow rendered inline as SVG (React Flow can serialise the same layout the canvas
   already computes), questions as inline callouts in the section they belong to, and every
   requirement anchored to the node it came from — click a requirement, the canvas centres that
   node.

Bidirectional anchoring is what makes it a *visual* PRD rather than a document with a picture in it.

### C. Section-addressed `write_prd` — *prerequisite for B, small*

`write_prd(moduleId, section, markdown, mode: 'append' | 'replace')`, storing sections as
structured records rather than one accreting text column. Fixes the transcript problem (#4), and
without it B.2 has nothing to anchor to.

### D. Screen-shaped node types — *the identity change*

Extend `FlowNodeType` with `screen`, `role`, and `data`. `screen` is the important one: render it
as a card with a states strip along the bottom — empty / loading / error / success — each state
defined, unknown, or marked N/A.

Touches: the type union, one node component per type, the tool `enum`s (`llm-tools.ts:147`, `173`,
`219`), and the node-type lists in the prompts (`prompt-builder.ts:317-325`, `456-464`). Mechanical
work; the hard part is prompt guidance on when a step is a screen versus a process.

This is the difference between a flowchart tool that emits a PRD and a tool that builds app PRDs.

### E. Screen × state matrix view — *the highest-value new visual*

Once `screen` exists (D), add a third canvas view alongside module map and module detail: rows =
screens, columns = empty / loading / error / partial / success / permission-denied, cells =
defined (green) / unknown (amber, click to raise an open question) / N-A (grey).

A wall of amber is the most persuasive scoping artefact you can put in front of a client, because
it makes the unspecified surface area countable. This is where app/web scope disputes actually
originate, and no competing tool shows it.

### F. Exports that survive the meeting — *days*

- **Mermaid** — `graph TD` generated from the same traversal `walkFlow` already performs
  (`prd-renderers.ts:7-46`). Roughly 40 lines, and it makes every diagram paste-able into the tools
  clients already use. It also stops the product name from being a lie.
- **PDF** — canvas as SVG + the document, one file, openable by anyone.
- **Read-only share link** — and let that route render below 768px. `MobileGate` protects the
  *editing* surface; it should not block a client from reading their own spec on a phone.

### G. Capture "out of scope" as a first-class outcome — *small*

When a client dismisses an open question, record it as `dismissed` with the reason instead of
deleting the node (`llm-tools.ts:924-929`). Render as a struck-through grey marker; emit an
**Explicitly out of scope** section in the PRD. Cheap, and it's the section that prevents the
argument three months later.

---

## What not to build

**Wireframe or UI generation.** It's the obvious next thought once `screen` nodes exist, and it's a
trap: it puts you against Figma and v0 on their terms, and it moves the product from
scoping-fidelity to pixel-fidelity. The defensible position is being the tool that knows what is
*unspecified* — pixels imply decisions that haven't been made, which actively damages that.

---

## Suggested sequence

| Phase | Items | Why this order |
|---|---|---|
| 1 | A (coverage rail), F-Mermaid, G (out of scope) | Independent, days each, immediately visible in a client call |
| 2 | C (sectioned `write_prd`) → B (merge + PRD route) | C unblocks B; B.1 alone stops the document losing the diagram |
| 3 | D (screen/role/data nodes) | Identity change; needs prompt iteration |
| 4 | E (screen × state matrix), F-PDF, F-share | Depend on D and B |

Phase 1 makes the *call* better. Phase 2 makes the *deliverable* better. Phases 3-4 change what the
product is.

If only one thing gets done: **B.1**. The app currently deletes its own flowchart from its own PRD
as soon as the AI writes a paragraph, and that undermines every other visual investment in the
codebase.
