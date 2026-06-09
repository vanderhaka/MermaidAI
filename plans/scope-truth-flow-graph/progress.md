# Feature Progress: scope-truth-flow-graph

Status: COMPLETE_EXCEPT_BLOCKED_DATA_REPAIR
Current wave: W4
Last updated: 2026-06-07
Owner: feature-orchestrator

## Graph Summary

| Node | Title                                           | Tier | Depends On         | Parallel Group | Owner             | Status  |
| ---- | ----------------------------------------------- | ---- | ------------------ | -------------- | ----------------- | ------- |
| S1   | ID-bound open-question resolution trigger       | T1   | none               | W1-A           | main orchestrator | DONE    |
| S2   | Graph invariant detector and regression fixture | T1   | none               | W1-B           | main orchestrator | DONE    |
| S3   | Tool-backed resolved-state truth contract       | T1   | S1                 | W2-A           | main orchestrator | DONE    |
| S4   | Flow edit repair and graph-connectivity guards  | T1   | S2                 | W2-B           | main orchestrator | DONE    |
| S5   | Question-node rendering and layout isolation    | T2   | S2                 | W2-C           | main orchestrator | DONE    |
| S6   | Decision branch routing and labels              | T2   | S2                 | W2-D           | main orchestrator | DONE    |
| S7   | Recommendation and accept-action contract       | T2   | S3                 | W3-A           | main orchestrator | DONE    |
| S8   | Chat docking and resize polish                  | T3   | S5, S7             | W3-B           | main orchestrator | DONE    |
| S9   | Current project data repair                     | T1   | S3, S4, S5, S6     | W4-A           | unassigned        | BLOCKED |
| S10  | Full proof and behavior-preservation report     | T1   | S3, S4, S5, S6, S7 | W4-B           | main orchestrator | DONE    |

## Gate Progress

| Node | RED  | GREEN | REFACTOR | Repo Gate | Browser Gate | Boundary Gate | Evidence                                                                                                                                                      | Confidence |
| ---- | ---- | ----- | -------- | --------- | ------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| S1   | DONE | DONE  | DONE     | DONE      | DONE         | DONE          | `agent-runs/S1-main-2026-06-07.md`                                                                                                                            | 92%        |
| S2   | DONE | DONE  | DONE     | DONE      | SKIPPED      | DONE          | `agent-runs/S2-main-2026-06-07.md`; browser skipped because helper is pure.                                                                                   | 90%        |
| S3   | DONE | DONE  | DONE     | DONE      | DONE         | DONE          | `agent-runs/S3-main-2026-06-07.md`                                                                                                                            | 90%        |
| S4   | DONE | DONE  | DONE     | DONE      | SKIPPED      | DONE          | `agent-runs/S4-main-2026-06-07.md`; browser skipped to avoid additional live graph mutation.                                                                  | 88%        |
| S5   | DONE | DONE  | DONE     | DONE      | DONE         | DONE          | `agent-runs/S5-main-2026-06-07.md`                                                                                                                            | 92%        |
| S6   | DONE | DONE  | DONE     | DONE      | DONE         | DONE          | `agent-runs/S6-main-2026-06-07.md`                                                                                                                            | 90%        |
| S7   | DONE | DONE  | DONE     | DONE      | PARTIAL      | DONE          | `agent-runs/S7-main-2026-06-07.md`; accept button render was browser-verified, live accept click skipped to avoid resolving another current-project question. | 91%        |
| S8   | DONE | DONE  | DONE     | DONE      | DONE         | DONE          | `agent-runs/S8-main-2026-06-07.md`                                                                                                                            | 92%        |
| S9   | TODO | TODO  | TODO     | TODO      | TODO         | BLOCKED       | Blocked until user explicitly approves current-project data mutation.                                                                                         | TBD        |
| S10  | DONE | DONE  | DONE     | DONE      | DONE         | DONE          | `agent-runs/S10-main-2026-06-07.md`                                                                                                                           | 91%        |

## Blockers

| Node | Blocker                                                                            | Required Decision Or Evidence                                                                                                                             |
| ---- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S9   | Mutating the currently open project's persisted graph/questions is live-data work. | User must explicitly approve targeted repair of project `9375bc1a-a0ba-4719-a18d-70609ce147d0`, or confirm it should remain as a regression fixture only. |

## Active Wave

- W4-A: S9 remains blocked until explicit current-project data repair approval.
- No unblocked implementation slices remain.

## Completed Evidence

- 2026-06-07: Live review identified the mismatch between assistant copy, open-question drawer, and persisted graph data.
- 2026-06-07: Plan and progress tracker created from `feature-graph-plan`.
- 2026-06-07: S1 completed. Drawer resolution now carries structured open-question identity; focused tests, type-check, lint, and in-app browser smoke passed.
- 2026-06-07: S2 completed. Added pure graph invariant helper and regression fixture; focused tests, type-check, and lint passed.
- 2026-06-07: S3 completed. Selected open-question clicks now carry identity, cannot resolve without a user answer, and click-only requests are deterministically returned as a question plus recommended answer when app state still lists the question open. Focused tests, type-check, lint, and in-app browser smoke passed.
- 2026-06-07: S4 completed. Node/edge tool results now surface invariant-backed graph issues and prompt instructions require repair before replying. Focused tests, type-check, and lint passed; browser gate skipped to avoid further live graph mutation.
- 2026-06-07: S5 completed. Question nodes now render the real question text and are excluded from process-flow fit targets. Focused tests, type-check, lint, and in-app browser smoke passed.
- 2026-06-07: S6 completed. Decision branch labels now infer success/failure handles beyond literal yes/no while leaving recovery labels unforced. Focused tests, type-check, lint, and in-app browser smoke passed.
- 2026-06-07: S7 completed. Accepting or overriding a selected-question recommendation now carries the original open-question ID through chat context. Focused tests, type-check, and lint passed; live accept click skipped to avoid mutating current project data.
- 2026-06-07: S8 completed. Chat opens wider/taller, remains resizable, and persists stretched dimensions with viewport clamps. Focused tests, type-check, lint, and in-app browser smoke passed.
- 2026-06-07: S10 completed. Final focused regression passed with 10 test files and 174 tests, plus type-check, lint, and browser proof.

## Behavior Preservation

- Previous intended behaviors to preserve: chat creation/editing of flow artifacts, grouped open-question drawer, accepted recommendations as user input, canvas pan/zoom/resize usability, scope-to-full-design handoff.
- Intentional changes: ID-bound question resolution, truth-gated assistant copy, graph invariant guards, clearer question nodes/layout, consistent recommendation accept path.
- Confidence: 91% for completed S1/S2/S3/S4/S5/S6/S7/S8/S10 behaviors. Remaining risk is S9 current-project data repair if approved.
