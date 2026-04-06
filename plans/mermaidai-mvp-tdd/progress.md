# TDD Progress: MermaidAI MVP

## Pipeline Phase: EXECUTING

Status: Waves 1-2 COMPLETE, Wave 3 PENDING

## Issues

| #   | Title                                        | Wave | RED | GREEN | REFACTOR | Commit    | Status  |
| --- | -------------------------------------------- | ---- | --- | ----- | -------- | --------- | ------- |
| 1   | Env config validates required env vars       | 1    | ✓   | ✓     | ✓        | `f49c2f7` | DONE    |
| 2   | Database types placeholder                   | 1    | ✓   | ✓     | ✓        | `567349d` | DONE    |
| 3   | Project type                                 | 1    | ✓   | ✓     | ✓        | `d73ad22` | DONE    |
| 4   | Module type with entry/exit points           | 1    | ✓   | ✓     | ✓        | `b139cf3` | DONE    |
| 5   | FlowNode type with node types                | 1    | ✓   | ✓     | ✓        | `b5933c1` | DONE    |
| 6   | FlowEdge type                                | 1    | ✓   | ✓     | ✓        | `c070d9b` | DONE    |
| 7   | ModuleConnection type                        | 1    | ✓   | ✓     | ✓        | `043373f` | DONE    |
| 8   | Chat types — messages, operations, context   | 1    | ✓   | ✓     | ✓        | `3a4a110` | DONE    |
| 9   | Zod schema CreateProjectInput                | 1    | ✓   | ✓     | ✓        | `b839021` | DONE    |
| 10  | Zod schema CreateModuleInput                 | 1    | ✓   | ✓     | ✓        | `4a67441` | DONE    |
| 11  | Zod schema CreateFlowNodeInput               | 1    | ✓   | ✓     | ✓        | `4ff0c7a` | DONE    |
| 12  | Zod schema CreateFlowEdgeInput               | 1    | ✓   | ✓     | ✓        | `d553868` | DONE    |
| 13  | Zod schema CreateModuleConnectionInput       | 1    | ✓   | ✓     | ✓        | `11e0616` | DONE    |
| 14  | FileTreeNode type + file path pattern        | 1    | ✓   | ✓     | ✓        | `f325b44` | DONE    |
| 15  | Supabase server client factory               | 1    | ✓   | ✓     | ✓        | `ce836c2` | DONE    |
| 16  | Supabase browser client singleton            | 1    | ✓   | ✓     | ✓        | `a96fd34` | DONE    |
| 17  | Supabase middleware client                   | 1    | ✓   | ✓     | ✓        | `3c1bd07` | DONE    |
| 18  | Database migrations (7 tables, RLS)          | 1    | ✓   | ✓     | ✓        | `b2c2098` | DONE    |
| 19  | Signup server action                         | 2    | ✓   | ✓     | ✓        | `cfc3b55` | DONE    |
| 20  | Login server action                          | 2    | ✓   | ✓     | ✓        | `b0db456` | DONE    |
| 21  | Logout server action                         | 2    | ✓   | ✓     | ✓        | `6c35a88` | DONE    |
| 22  | Profile creation on signup                   | 2    | ✓   | ✓     | ✓        | `77c4a49` | DONE    |
| 23  | Auth middleware                              | 2    | ✓   | ✓     | ✓        | `74f913b` | DONE    |
| 24  | createProject service                        | 2    | ✓   | ✓     | ✓        | `7c73227` | DONE    |
| 25  | listProjectsByUser                           | 2    | ✓   | ✓     | ✓        | `62565f6` | DONE    |
| 26  | getProjectById                               | 2    | ✓   | ✓     | ✓        | `fa0dbcb` | DONE    |
| 27  | updateProject                                | 2    | ✓   | ✓     | ✓        | `bbe0b1d` | DONE    |
| 28  | deleteProject                                | 2    | ✓   | ✓     | ✓        | `dccbf75` | DONE    |
| 29  | createModule                                 | 2    | ✓   | ✓     | ✓        | `f289192` | DONE    |
| 30  | listModulesByProject                         | 2    | ✓   | ✓     | ✓        | `70af0d8` | DONE    |
| 31  | getModuleById                                | 2    | ✓   | ✓     | ✓        | `e9e83c7` | DONE    |
| 32  | updateModule                                 | 2    | ✓   | ✓     | ✓        | `60bb136` | DONE    |
| 33  | deleteModule                                 | 2    | ✓   | ✓     | ✓        | `f324594` | DONE    |
| 34  | Signup form component                        | 3    | ✓   | ✓     | ✓        | `7f59c2f` | DONE    |
| 35  | Login form component                         | 3    | ✓   | ✓     | ✓        | `0d1f387` | DONE    |
| 36  | Logout button component                      | 3    | ✓   | ✓     | ✓        | `bc6926d` | DONE    |
| 37  | Dashboard page                               | 3    | ✓   | ✓     | ✓        | `6c9b8cd` | DONE    |
| 38  | getGraphForModule                            | 3    | ✓   | ✓     | ✓        | `8f56637` | DONE    |
| 39  | addNode                                      | 3    | ✓   | ✓     | ✓        | `0cfe8be` | DONE    |
| 40  | updateNode                                   | 3    | -   | -     | -        | -         | PENDING |
| 41  | removeNode                                   | 3    | -   | -     | -        | -         | PENDING |
| 42  | addEdge                                      | 3    | -   | -     | -        | -         | PENDING |
| 43  | removeEdge                                   | 3    | -   | -     | -        | -         | PENDING |
| 44  | connectModules + disconnectModules           | 3    | ✓   | ✓     | ✓        | `5373297` | DONE    |
| 45  | addChatMessage + listChatMessages            | 3    | ✓   | ✓     | ✓        | `773d877` | DONE    |
| 46  | React Flow base canvas                       | 3    | ✓   | ✓     | ✓        | `053c2c1` | DONE    |
| 47  | Module card custom node                      | 3    | ✓   | ✓     | ✓        | `834a62b` | DONE    |
| 48  | Decision node                                | 3    | ✓   | ✓     | ✓        | `ad302af` | DONE    |
| 49  | Process node with pseudocode                 | 3    | ✓   | ✓     | ✓        | `6c9b8cd` | DONE    |
| 50  | Entry and exit nodes                         | 3    | ✓   | ✓     | ✓        | `48e063e` | DONE    |
| 51  | Start and end nodes                          | 3    | ✓   | ✓     | ✓        | `834a62b` | DONE    |
| 52  | Auto-layout (dagre)                          | 3    | ✓   | ✓     | ✓        | `7f59c2f` | DONE    |
| 53  | Custom condition edge                        | 3    | ✓   | ✓     | ✓        | `a269331` | DONE    |
| 54  | Node color config                            | 3    | ✓   | ✓     | ✓        | `5373297` | DONE    |
| 55  | Chat store                                   | 4    | -   | -     | -        | -         | PENDING |
| 56  | System prompt — discovery mode               | 4    | -   | -     | -        | -         | PENDING |
| 57  | System prompt — module map mode              | 4    | -   | -     | -        | -         | PENDING |
| 58  | System prompt — module detail mode           | 4    | -   | -     | -        | -         | PENDING |
| 59  | LLM response parser                          | 4    | -   | -     | -        | -         | PENDING |
| 60  | LLM client wrapper (streaming)               | 4    | -   | -     | -        | -         | PENDING |
| 61  | Graph executor — module ops                  | 4    | -   | -     | -        | -         | PENDING |
| 62  | Graph executor — node/edge + partial failure | 4    | -   | -     | -        | -         | PENDING |
| 63  | Graph store (Zustand)                        | 4    | -   | -     | -        | -         | PENDING |
| 64  | Chat route handler (streaming)               | 5    | -   | -     | -        | -         | PENDING |
| 65  | Chat message list (streaming)                | 5    | -   | -     | -        | -         | PENDING |
| 66  | Chat input component                         | 5    | -   | -     | -        | -         | PENDING |
| 67  | Derive file tree from nodes                  | 5    | -   | -     | -        | -         | PENDING |
| 68  | FileTree component                           | 5    | -   | -     | -        | -         | PENDING |
| 69  | Module map view                              | 6    | -   | -     | -        | -         | PENDING |
| 70  | ModuleDetailView                             | 6    | -   | -     | -        | -         | PENDING |
| 71  | Canvas container (drill-down)                | 6    | -   | -     | -        | -         | PENDING |
| 72  | useFileTree hook                             | 6    | -   | -     | -        | -         | PENDING |
| 73  | FileTreeSidebar                              | 6    | -   | -     | -        | -         | PENDING |
| 74  | Pseudocode display                           | 6    | -   | -     | -        | -         | PENDING |

## Test Suite

- **Wave 1 exit**: 181 tests, 0 failures
- **Wave 2 exit**: 243 tests, 0 failures

## Notes

- jsdom ESM compat issue: use `// @vitest-environment node` for non-DOM test files
- Placeholder Database types cause tsc `never` errors on `.insert()`/`.update()` — resolved when `supabase gen types` runs against real schema
- Issues 21 and 28 code landed in neighboring agent commits due to concurrent staging; attribution commits added
