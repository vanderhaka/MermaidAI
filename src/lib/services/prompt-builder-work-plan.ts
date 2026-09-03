import type { ArchitectureReadinessDecision } from '@/lib/services/architecture-readiness'
import { UNVERIFIED_CHECK_PREFIX } from '@/lib/planning/evidence-boundary'
import type { CompletePlanningArtifactVersion } from '@/lib/services/planning-artifact-service'
import type { WorkPlanContent } from '@/types/planning'

type WorkPlanPromptInput = {
  projectName: string
  architectureVersion: CompletePlanningArtifactVersion<'architecture'>
  decisions: ArchitectureReadinessDecision[]
}

type WorkPlanRefinementPromptInput = WorkPlanPromptInput & {
  workPlan: WorkPlanContent
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function buildWorkPlanPrompt(input: WorkPlanPromptInput): string {
  const acceptedDecisions = input.decisions.filter((decision) => decision.state === 'accepted')
  const proposedAssumptions = input.decisions.filter((decision) => decision.state === 'proposed')

  return [
    'You are the Work Plan architect for a staged planning product.',
    '',
    'Turn the frozen high-level Architecture below into an implementation-ready plan.',
    'The Architecture is immutable input. Do not edit it, reinterpret its version, or call graph tools.',
    'Call submit_work_plan exactly once with the complete plan. Do not return a prose plan.',
    '',
    'Plan rules:',
    '- Use small vertical slices that each produce an observable user or system outcome.',
    '- Give every slice a protected invariant, acceptance criteria, verification, risks, and rollback notes.',
    '- Make dependencies explicit and acyclic. Put every slice in exactly one phase.',
    '- Cover every Architecture capability with at least one slice.',
    '- Add conventional completeness for each explicit capability when it does not conflict with an accepted decision.',
    '- For password-based authentication, include email verification, password reset or account recovery, sign-out, secure session expiry, rate limiting, and safe error handling.',
    '- Treat those product basics as baseline acceptance criteria, not new assumptions or blockers. Do not invent product-specific policy.',
    '- For user-facing asynchronous work, include accessible loading, empty, error, and retry states where applicable.',
    '- Carry unresolved blockers and assumptions visibly. Never silently decide a blocker.',
    '- likely_targets are informed implementation hypotheses, not claims that files already exist.',
    '- Never invent a repository script, file path, command, framework, or test runner that is not present in the frozen input.',
    `- When repository tooling is absent, write each verification command as a human-readable check prefixed exactly "${UNVERIFIED_CHECK_PREFIX}".`,
    '- Keep IDs stable-looking, concise, and unique, using lowercase kebab-case where practical.',
    '',
    `Project: ${input.projectName}`,
    `Frozen source: Architecture v${input.architectureVersion.version}`,
    `Frozen source version ID: ${input.architectureVersion.id}`,
    '',
    'Architecture content:',
    json(input.architectureVersion.content),
    '',
    'Accepted decisions:',
    json(acceptedDecisions),
    '',
    'Proposed assumptions still requiring review:',
    json(proposedAssumptions),
  ].join('\n')
}

export function buildWorkPlanRefinementPrompt(input: WorkPlanRefinementPromptInput): string {
  const acceptedDecisions = input.decisions.filter((decision) => decision.state === 'accepted')
  const proposedAssumptions = input.decisions.filter((decision) => decision.state === 'proposed')

  return [
    'You are refining one immutable, source-bound Work Plan in a staged planning product.',
    '',
    'Treat the frozen Architecture, durable decisions, and current Work Plan below as truth.',
    'Do not edit Architecture, call graph tools, or return an arbitrary replacement document.',
    'Call submit_work_plan_edits exactly once with the smallest complete batch of finite edits that satisfies the latest user request.',
    '',
    'Refinement rules:',
    '- Preserve unrelated phases, slices, IDs, acceptance checks, and source links.',
    '- Keep the result dependency-acyclic and keep every slice in exactly one phase.',
    '- Phase membership is derived by add_slice, move_slice, and remove_slice. Never include slice_ids in a command or nested slice.',
    '- Keep every Architecture capability covered by at least one slice.',
    '- Preserve conventional completeness for each explicit capability unless the latest request or an accepted decision changes it.',
    '- For password-based authentication, preserve email verification, password reset or account recovery, sign-out, secure session expiry, rate limiting, and safe error handling as baseline acceptance criteria.',
    '- For user-facing asynchronous work, preserve accessible loading, empty, error, and retry states where applicable.',
    '- Never silently resolve a blocker or assumption. Update planning notes explicitly.',
    '- Do not invent known file paths. likely_targets remain informed hypotheses.',
    '- Never invent a repository script, command, framework, or test runner that is not present in the frozen input.',
    `- Preserve verified commands only when their repository evidence is present. Otherwise prefix each verification command exactly "${UNVERIFIED_CHECK_PREFIX}".`,
    '- Make the batch summary short, specific, and suitable for a persisted receipt.',
    '',
    `Project: ${input.projectName}`,
    `Frozen source: Architecture v${input.architectureVersion.version}`,
    `Frozen source version ID: ${input.architectureVersion.id}`,
    '',
    'Frozen Architecture:',
    json(input.architectureVersion.content),
    '',
    'Current Work Plan:',
    json(input.workPlan),
    '',
    'Accepted decisions:',
    json(acceptedDecisions),
    '',
    'Proposed assumptions still requiring review:',
    json(proposedAssumptions),
  ].join('\n')
}
