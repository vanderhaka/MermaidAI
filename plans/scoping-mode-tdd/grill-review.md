# Grill Review: Scoping Mode with Hybrid Open Questions

Plan: plans/scoping-mode-tdd/plan.md
Date: 2026-04-08
Status: COMPLETE

---

## Round 1: Completeness & Scope

### Questions Asked

1. When should the invisible scope module be auto-created — at project creation or on first message?
2. What happens to the scope flowchart when promoting to architecture?
3. Where should the Open Questions panel live in the UI?
4. Should scope workspace logic be split into its own component?

### Answers

1. **At project creation** — a hidden "Scope" module is auto-created immediately when the user picks Scope mode.
2. **AI re-interviews** — promotion triggers the AI to review the scope and propose breaking it into proper modules (Map phase). Most powerful.
3. **Canvas bottom** — a collapsible drawer at the bottom of the canvas area.
4. **Split now** — create a ScopeWorkspace component alongside ProjectWorkspace.

### Decisions Made

- Auto-create scope module at project creation time (in createProject or project page SSR)
- Promotion is not just a mode flip — it triggers AI-driven module decomposition from the scope content
- OpenQuestionsPanel is a bottom drawer on the canvas, not a sidebar
- Scope-specific workspace UI goes in a separate ScopeWorkspace component

### Plan Changes Required

- [ ] Add issue: Auto-create hidden scope module at project creation
- [ ] Modify Issue 22 (Promote button): Change from simple mode flip to triggering AI re-interview with scope content as context
- [ ] Modify Issue 18 (OpenQuestionsPanel): Specify bottom drawer positioning
- [ ] Add issue: Create ScopeWorkspace component (extracts scope-specific rendering from ProjectWorkspace)
- [ ] Modify Issue 20 (Scope layout): Route to ScopeWorkspace instead of conditionals in ProjectWorkspace
- [ ] Add issue: Load initial open questions on page load (missing from project page SSR)

---

## Round 2: Clarifications

### Questions Asked

1. What defines a "section" for grouping open questions?
2. How big should question nodes be on the canvas?
3. Should the questions drawer start open or closed on page load?

### Answers

1. **AI decides** — the AI assigns section names based on context. User doesn't have to think about it.
2. **Same size as process nodes** — consistent look, easier to read (260px width).
3. **Start open if questions exist** — if there are unresolved questions, drawer opens automatically.

### Decisions Made

- Sections are AI-inferred labels, no user input needed. The scoping prompt should instruct the AI to assign section names.
- QuestionNode uses same width as ProcessNode (260px). Layout engine treats it identically.
- OpenQuestionsPanel drawer auto-opens when there are open questions, stays closed when empty.

### Plan Changes Required

- [ ] Modify Issue 4 (QuestionNode): Specify 260px width matching ProcessNode
- [ ] Modify Issue 13 (Scoping prompt): Clarify that AI assigns section names automatically
- [ ] Modify Issue 18 (OpenQuestionsPanel): Add auto-open behavior when open questions exist, bottom drawer positioning
- [ ] Add issue: Layout engine dimensions for question node type (getFlowDetailNodeDimensions)

---

## Final State

Plan reviewed and updated. **27 issues in 7 waves.**

Changes made:

- 4 issues added (#23 page routing, #24 auto scope module, #25 initial open questions load, #26 layout dimensions)
- 4 issues modified (#4 QuestionNode width, #13 AI-assigned sections, #18 bottom drawer + auto-open, #22 AI re-interview promotion)
- 1 issue restructured (#20 → ScopeWorkspace component, #21 → scoped to ScopeWorkspace)
- 0 issues removed

Unresolved concerns (noted for awareness):

- The AI re-interview on promotion (Issue 22) is the most complex single issue — the prompt engineering for reviewing a scope flowchart and proposing module decomposition may need iteration after the first implementation.
- `project-workspace.tsx` should be reviewed for any shared logic that can be extracted to a common hook or component once ScopeWorkspace exists.
