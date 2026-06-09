# Feature Progress: maintainability-cleanup

Status: DONE
Current wave: COMPLETE
Last updated: 2026-06-08
Owner: feature-orchestrator

## Graph Summary

| Node | Title                                                | Tier | Depends On         | Parallel Group | Owner             | Status |
| ---- | ---------------------------------------------------- | ---- | ------------------ | -------------- | ----------------- | ------ |
| M1   | Baseline and write-boundary guard                    | T1   | none               | W1-A           | main orchestrator | DONE   |
| M2   | PRD renderer export and characterization cleanup     | T2   | M1                 | W2-A           | main orchestrator | DONE   |
| M3   | Edge-routing export and characterization cleanup     | T2   | M1                 | W2-B           | Bohr              | DONE   |
| M4   | Chat route orchestration extraction                  | T1   | M1                 | W2-C           | main orchestrator | DONE   |
| M5   | LLM tool executor decomposition                      | T1   | M1                 | W2-D           | main orchestrator | DONE   |
| M6   | Workspace tool-event applier extraction              | T1   | M1                 | W2-E           | main orchestrator | DONE   |
| M7   | Fallow calibration, focused proof, and browser smoke | T1   | M2, M3, M4, M5, M6 | W3-A           | main orchestrator | DONE   |

## Gate Progress

| Node | RED  | GREEN | REFACTOR | Repo Gate | Browser Gate | Boundary Gate | Evidence                             | Confidence |
| ---- | ---- | ----- | -------- | --------- | ------------ | ------------- | ------------------------------------ | ---------- |
| M1   | DONE | DONE  | DONE     | DONE      | SKIPPED      | DONE          | `agent-runs/M1-main-2026-06-08.md`   | 92%        |
| M2   | DONE | DONE  | DONE     | DONE      | SKIPPED      | DONE          | `agent-runs/M2-main-2026-06-08.md`   | 94%        |
| M3   | DONE | DONE  | DONE     | DONE      | SKIPPED      | DONE          | `agent-runs/M3-worker-2026-06-08.md` | 94%        |
| M4   | DONE | DONE  | DONE     | DONE      | DONE         | DONE          | `agent-runs/M4-main-2026-06-08.md`   | 93%        |
| M5   | DONE | DONE  | DONE     | DONE      | DONE         | DONE          | `agent-runs/M5-main-2026-06-08.md`   | 92%        |
| M6   | DONE | DONE  | DONE     | DONE      | DONE         | DONE          | `agent-runs/M6-main-2026-06-08.md`   | 94%        |
| M7   | DONE | DONE  | DONE     | DONE      | DONE         | DONE          | `agent-runs/M7-main-2026-06-08.md`   | 94%        |

## Blockers

| Node | Blocker | Required Decision Or Evidence                       |
| ---- | ------- | --------------------------------------------------- |
| none | none    | all implementation and verification nodes complete. |

## Active Wave

- W1-A: M1 is complete.
- W2-A through W2-E are complete.
- W3-A is complete.

## Planned Parallel Groups

- W2-A and W2-B are pure helper/export cleanup and can run in parallel after M1.
- W2-C and W2-D can run in parallel only with strict file ownership: M4 owns chat route orchestration, M5 owns LLM tool execution.
- W2-E can run in parallel with server work because it owns client workspace event application.
- Package lockfiles, migrations, live DB rows, and git operations are not parallel-safe and are out of scope unless a new node is added.

## Completed Evidence

- 2026-06-08: Issue-fix strategy classified the Fallow report as maintainability work, not a launch-blocking bug list.
- 2026-06-08: Existing `scope-truth-flow-graph` progress reviewed; S1-S8 and S10 are complete, S9 current-project data repair remains blocked and out of scope for this cleanup.
- 2026-06-08: Current dirty tree reviewed; many Fallow target files already have active scope-truth changes, so the plan requires exact write sets and behavior-preservation proof.
- 2026-06-08: Read-only agent pass confirmed safe PRD cleanup is de-exporting only `renderFlowSection` and `renderQuestionsSection` after renderer tests; `renderModulePrd` stays exported.
- 2026-06-08: Read-only agent pass confirmed safe edge-routing cleanup is de-exporting internal path helpers only after public path tests; `buildPathFromSections`, `buildRoundedOrthogonalPath`, `toRgba`, and `getStrokeWidth` stay exported.
- 2026-06-08: Read-only agent pass confirmed `project-workspace.tsx` lacks direct component coverage, making a new component/helper test a required guard before major Full Design workspace extraction.
- 2026-06-08: M1 completed. Baseline focused regression passed with 10 test files and 174 tests, followed by clean `npm run type-check` and `npm run lint`; no browser gate required for this ops node.
- 2026-06-08: M2 completed locally after Planck timed out. Added `prd-renderers.test.ts`, de-exported internal PRD section helpers, and kept `renderModulePrd` exported.
- 2026-06-08: M3 completed by Bohr. Added `edge-routing.test.ts` and de-exported internal-only routing helpers while preserving public edge helpers.
- 2026-06-08: M4 completed. Extracted selected-open-question helpers and chat prompt context loading out of `src/app/api/chat/route.ts`.
- 2026-06-08: M5 completed. Reused the selected-open-question helper in `llm-tools.ts` and removed duplicate prompt matching.
- 2026-06-08: M6 completed. Extracted scope and Full Design tool-event state mutation into `tool-event-applier.ts` with focused tests.
- 2026-06-08: M7 completed. Combined targeted suite passed with 8 files and 82 tests; `npm run type-check`, `npm run lint`, and diff-scoped `fallow audit --diff-stdin --format compact` passed. In-app browser smoke loaded `http://localhost:3000/dashboard/9375bc1a-a0ba-4719-a18d-70609ce147d0`, opened the assistant shell without submitting data, kept open questions at 3, and reported no browser console errors.

## Behavior Preservation

- Previous intended behaviors to preserve: chat route mode selection, open-question ID truth, click-only resolution guard, stream persistence, LLM tool payloads, graph invariant warnings, PRD markdown content, edge routing visuals, workspace tool-event UI updates, and in-app browser usability.
- Intentional changes: internal helper exports may become private; large orchestration handlers may be extracted behind unchanged public contracts; missing characterization tests may be added.
- Evidence: M1 baseline, node-level tests, combined M2-M6 regression suite, typecheck, lint, diff-scoped Fallow audit, and in-app browser smoke are green.
- Confidence: 94% overall.
