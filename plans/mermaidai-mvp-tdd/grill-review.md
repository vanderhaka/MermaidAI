# Grill Review: MermaidAI MVP

Plan: plans/mermaidai-mvp-tdd/plan.md
Date: 2026-04-06
Status: COMPLETE

---

## Round 1: Completeness & Scope

### Questions Asked
1. No database migrations exist — should we add them?
2. No dashboard/project list page — should we add one?
3. No chat input component — should we add one?
4. No ModuleDetailView for inside-a-module canvas — should we add it?

### Answers
1. Yes, add a single migration issue that creates all 7 tables with FKs and RLS
2. Yes, add a dashboard page with project list and "New Project" button
3. Yes, add a chat input component (text field, send button, keyboard submit, disabled while pending)
4. Yes, add a ModuleDetailView as its own issue

### Decisions Made
- Add database migration issue to Wave 1 (before any data layer work)
- Add dashboard page issue to Wave 3 (after auth + project CRUD)
- Add chat input component issue to Wave 5 (alongside message list)
- Add ModuleDetailView issue to Wave 6 (before CanvasContainer drill-down)

### Plan Changes Required
- [x] Add Issue: Database migrations (all 7 tables, FKs, RLS, triggers)
- [x] Add Issue: Dashboard/project list page
- [x] Add Issue: Chat input component
- [x] Add Issue: ModuleDetailView

---

## Round 2: Data Flow, AI Prompts, Rollback, Streaming

### Questions Asked
5. How should canvas know when AI creates things — graph store or re-fetch?
6. Should AI prompts include file path instructions for the file tree sidebar?
7. Should failed AI operations roll back or just report what failed?
8. Streaming or all-at-once for AI responses?

### Answers
5. Yes, add a Zustand graph store — both chat and canvas read from it
6. Yes, update system prompt issues to instruct AI to include file paths in pseudocode
7. Skip rollback for MVP — show what succeeded/failed, let AI retry
8. Stream word-by-word (like ChatGPT)

### Decisions Made
- Add graph store issue to Wave 4 (alongside chat store)
- Modify prompt builder issues (54-56) to include file path instructions
- Simplify Issue 60: remove rollback, just report partial success/failure
- Modify Issue 61 (chat server action) to use streaming
- Add streaming UI support to chat message list (Issue 62)

### Plan Changes Required
- [x] Add Issue: Graph store (Zustand) for modules, nodes, edges
- [x] Modify Issues 54-56: prompt builder includes file path instructions
- [x] Simplify Issue 60: remove rollback, report partial results
- [x] Modify Issue 61: streaming server action
- [x] Modify Issue 62: streaming message display

---

## Round 3: Model & Wave Structure

### Questions Asked
9. Which AI model to default to?
10. Is Wave 1's 17 type-only issues OK?

### Answers
9. Configurable, default to Sonnet
10. Fine, build foundations first

### Decisions Made
- Issue 58 (LLM client): default model = claude-sonnet-4-6, configurable via env var
- Wave 1 stays as-is (17 issues)

### Plan Changes Required
- [x] Modify Issue 58: specify default model as claude-sonnet-4-6, configurable via AI_MODEL env var

---

## Final State

**Changes applied:**
- 5 issues added (migrations, dashboard, chat input, ModuleDetailView, graph store)
- 5 issues modified (prompt builder x3, executor simplification, LLM client model, chat action streaming, message list streaming)
- 0 issues removed
- Final count: 74 issues across 6 waves

**Unresolved concerns (noted for awareness):**
- Canvas node tests may be fragile in jsdom — may need browser-based tests or special React Flow test utilities
- Streaming adds complexity to the server action pattern — may need to switch from Server Actions to a Route Handler for streaming
- Graph store needs careful design to avoid stale state between chat operations
