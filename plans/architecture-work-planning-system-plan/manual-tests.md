# Manual and In-App Browser Test Plan

## Environment and safety

- Use the Codex in-app browser for every required UI proof.
- Use an isolated local/dev Supabase stack and synthetic projects only.
- Verify the actual local target, configured ports, and synthetic user before opening a mutating route.
- Do not use production customer records or a linked remote database for failure injection, Undo, or migration testing.
- Preserve the pre-existing untracked `.claude/` directory.

For every scenario record:

- route and viewport;
- source artifact/version;
- action taken;
- visible result;
- persisted result after reload;
- console/network result;
- screenshot or scoped DOM evidence when useful.

## Scenario 1: Detailed first brief builds immediately

1. Create a new Full Design project.
2. Send: `Plan an appointment booking feature for a salon: customers choose a service, stylist, and time, pay a deposit, and staff manage cancellations and reminders.`
3. Confirm visible tool activity begins without a pre-build confirmation interview.
4. Confirm the sent message and truthful building state appear immediately, without waiting for the first model token.
5. Confirm a provisional connected top-level Architecture appears in the same turn.
6. Confirm the assistant does not ask who the users are.
7. Confirm it asks at most one genuinely material follow-up after producing useful work.
8. Confirm the happy path used one provider generation and one atomic Architecture commit.
9. Reload and confirm the Architecture, receipt, assumptions, and chat remain.

Expected: the first turn is useful, fast, provisional, and honest.

## Scenario 2: Vague brief remains honest

1. Create another Full Design project.
2. Send a genuinely vague brief such as `I want an app for local clubs.`
3. Confirm the assistant asks one high-value question.
4. Confirm it does not invent a complete architecture or claim readiness.

Expected: speed does not come from unsupported certainty.

## Scenario 3: Readiness truth table in the UI

Exercise these states in separate synthetic projects or reversible latest-turn edits:

1. Blank project: `draft`, with exact missing inputs.
2. Connected map with blocker: `needs_input`, with a Resolve blocker CTA.
3. Coherent map with two assumptions: `ready_with_assumptions`, with Review 2 assumptions.
4. Accepted assumptions: Create Work Plan becomes available with clear source version.
5. Fully confirmed Architecture: `ready`.

Confirm an empty staged Architecture Brief cannot be downloaded as a finished plan.

## Scenario 4: Assumption and decision lifecycle

1. Enable Auto-Decide and prompt a feature containing an obvious default.
2. Confirm the assumption appears in a durable panel, not only chat.
3. Edit it, reject it, then supply a confirmed decision.
4. Confirm the old assumption is superseded rather than silently overwritten.
5. Reload and confirm the final decision remains.

Expected: users can see exactly what the system decided for them.

## Scenario 5: Review, partial turn, and Undo

1. Ask the assistant for a multi-change Architecture refinement.
2. Stop the turn after at least one committed batch.
3. Confirm the turn is marked partial and lists the committed changes.
4. Open Review and inspect created, updated, deleted, and assumed changes.
5. Undo the latest change set.
6. Reload and confirm the prior state is restored.
7. Make a newer edit, then attempt to undo the older change.
8. Confirm the app refuses rather than overwriting newer work.

## Scenario 6: Two-tab concurrency

1. Open the same synthetic Architecture project in two in-app browser tabs.
2. Start edits from the same revision.
3. Commit one edit, then complete the other.
4. Confirm one succeeds and the stale request receives an explanatory conflict.
5. Reload both tabs and confirm there is no lost or duplicated change.

## Scenario 7: Quick Capture to Architecture recovery

1. Create a Quick Capture project and capture a useful flow.
2. Start the Architecture handoff.
3. Reload while it is pending/running.
4. Confirm the same job resumes or presents accurate running state.
5. Inject one safe local generation failure.
6. Confirm source content remains, failure is visible, and Retry completes one Architecture output.
7. Confirm the mode changes only after the output commits.

## Scenario 8: Architecture to Work Plan

1. Use an Architecture in `ready_with_assumptions`.
2. Review and explicitly accept proceeding with those assumptions.
3. Create the Work Plan.
4. Confirm the UI immediately shows a durable pending state.
5. Reload during generation.
6. Confirm one structured Work Plan completes and displays `Based on Architecture vN`.
7. Inspect multiple slices for actor/trigger, outcome, invariant, dependency, acceptance, verification, risk, and likely targets.
8. Confirm the Architecture remains navigable and unchanged.

## Scenario 9: Stage 2 refinement and durable context

1. Refine one Work Plan slice through chat.
2. Add a dependency and strengthen an acceptance check.
3. Confirm a new Work Plan version is created with a persisted receipt.
4. Reload and confirm the plan and chat remain attached to the Work Plan stage.
5. Continue a long synthetic conversation beyond the recent-message window.
6. Confirm an early accepted decision is still present in context and output.

## Scenario 10: Staleness and refresh

1. Return to Architecture and make a semantic module or connection change.
2. Confirm the Work Plan becomes stale immediately.
3. Inspect the concise source comparison.
4. Confirm stale Work Plan cannot produce a current Handoff.
5. Refresh the Work Plan.
6. Confirm a new version is created and the old version remains reviewable.
7. Move a node, change the viewport, or change colour only; confirm the edit is saved and concurrency-protected but does not create a semantic Architecture version or stale the refreshed Work Plan.

## Scenario 11: Execution Handoff boundary

1. Generate an Execution Handoff from a fresh ready Work Plan.
2. Confirm it names exact Architecture and Work Plan versions.
3. Inspect objective, non-goals, dependency order, checks, assumptions, risks, rollback, blockers, and out-of-scope work.
4. Copy and download the Markdown.
5. Confirm there is no control that starts a task, coding session, branch, commit, deploy, migration, or provider action.
6. Edit the Work Plan and confirm the packet becomes stale.

## Scenario 12: Failure and empty states

Verify visible, actionable states for:

- invalid stage URL;
- unavailable Work Plan stage;
- failed generation;
- expired running claim;
- stale source;
- invalid model output;
- chat persistence failure;
- stale revision conflict;
- Undo no longer safe;
- empty Architecture Brief;
- blocked Work Plan handoff.

No state may look complete when work failed or never started.

## Scenario 13: Responsive and accessibility smoke

Run the primary Architecture -> Work Plan -> Handoff flow at desktop and narrow mobile viewports.

Confirm:

- stage navigation remains reachable;
- canvas and chat remain usable in Architecture;
- Work Plan does not require horizontal page scrolling;
- readiness and Review panels are keyboard reachable;
- focus returns sensibly after dialogs;
- status is not conveyed by colour alone;
- loading text and live regions do not spam screen readers;
- no unexpected console errors or failed network requests occur.

## Completion evidence

The manual plan passes only when:

- every scenario has an explicit verdict;
- all failures are fixed and re-run or documented as blockers;
- the real in-app browser has proven the complete staged journey;
- Playwright and component tests support, but do not replace, that browser proof;
- no live data, deployment, provider, or external execution action occurred.
