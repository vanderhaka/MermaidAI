import { executionHandoffContentSchema } from '@/lib/schemas/planning'
import { WORK_PLAN_EVIDENCE_NOTICE } from '@/lib/planning/evidence-boundary'
import type { CompletePlanningArtifactVersion } from '@/lib/services/planning-artifact-service'
import type { ExecutionHandoffContent, WorkPlanContent } from '@/types/planning'

export const EXECUTION_HANDOFF_AUTHORIZATION_NOTICE =
  'This packet is for review, copy, or download only. It does not authorize or start implementation.' as const

function topologicalDependencyOrder(workPlan: WorkPlanContent): string[] {
  const originalIndex = new Map(workPlan.slices.map((slice, index) => [slice.id, index]))
  const dependencyCount = new Map(
    workPlan.slices.map((slice) => [slice.id, slice.dependencies.length]),
  )
  const dependants = new Map(workPlan.slices.map((slice) => [slice.id, [] as string[]]))
  for (const slice of workPlan.slices) {
    for (const dependencyId of slice.dependencies) {
      dependants.get(dependencyId)?.push(slice.id)
    }
  }

  const ready = workPlan.slices
    .filter((slice) => dependencyCount.get(slice.id) === 0)
    .map((slice) => slice.id)
  const ordered: string[] = []

  while (ready.length > 0) {
    ready.sort((left, right) => (originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0))
    const next = ready.shift()
    if (!next) break
    ordered.push(next)
    for (const dependantId of dependants.get(next) ?? []) {
      const remaining = (dependencyCount.get(dependantId) ?? 0) - 1
      dependencyCount.set(dependantId, remaining)
      if (remaining === 0) ready.push(dependantId)
    }
  }

  if (ordered.length !== workPlan.slices.length) {
    throw new Error('Cannot render a handoff from a cyclic Work Plan.')
  }
  return ordered
}

export function buildExecutionHandoffContent(
  workPlanVersion: CompletePlanningArtifactVersion<'work_plan'>,
): ExecutionHandoffContent {
  const workPlan = workPlanVersion.content
  return executionHandoffContentSchema.parse({
    source_architecture_version: workPlan.source_architecture_version,
    source_work_plan_version: {
      id: workPlanVersion.id,
      artifact_kind: 'work_plan',
      version: workPlanVersion.version,
    },
    objective: workPlan.objective,
    non_goals: workPlan.non_goals,
    dependency_order: topologicalDependencyOrder(workPlan),
    slices: workPlan.slices.map((slice) => ({
      id: slice.id,
      title: slice.title,
      dependencies: slice.dependencies,
      acceptance_criteria: slice.acceptance_criteria,
      verification: slice.verification,
      risks: slice.risks,
      rollback_notes: slice.rollback_notes,
    })),
    assumptions: workPlan.assumptions,
    unresolved_blockers: workPlan.unresolved_blockers,
    out_of_scope: workPlan.non_goals,
    authorization_notice: EXECUTION_HANDOFF_AUTHORIZATION_NOTICE,
  })
}

function inline(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function bullets(values: string[], empty: string): string[] {
  return values.length > 0 ? values.map((value) => `- ${inline(value)}`) : [`_${empty}_`]
}

export function renderExecutionHandoffPacket(input: {
  projectName: string
  content: ExecutionHandoffContent
}): string {
  const content = executionHandoffContentSchema.parse(input.content)
  const slicesById = new Map(content.slices.map((slice) => [slice.id, slice]))
  const lines = [
    `# ${inline(input.projectName)} Execution Handoff`,
    '',
    `> ${content.authorization_notice}`,
    '',
    '## Frozen sources',
    '',
    `- Architecture v${content.source_architecture_version.version} (\`${content.source_architecture_version.id}\`)`,
    `- Work Plan v${content.source_work_plan_version.version} (\`${content.source_work_plan_version.id}\`)`,
    '',
    '## Repository evidence boundary',
    '',
    `> ${WORK_PLAN_EVIDENCE_NOTICE}`,
    '',
    '## Objective',
    '',
    inline(content.objective),
    '',
    '## Non-goals',
    '',
    ...bullets(content.non_goals, 'No explicit non-goals.'),
    '',
    '## Dependency order',
    '',
    ...content.dependency_order.map((sliceId, index) => {
      const slice = slicesById.get(sliceId)
      return `${index + 1}. **${inline(slice?.title ?? sliceId)}** (\`${sliceId}\`)`
    }),
    '',
    '## Delivery slices',
    '',
  ]

  for (const sliceId of content.dependency_order) {
    const slice = slicesById.get(sliceId)
    if (!slice) continue
    lines.push(
      `### ${inline(slice.title)}`,
      '',
      `ID: \`${slice.id}\``,
      '',
      '**Dependencies**',
      '',
      ...bullets(
        slice.dependencies.map((dependency) => `\`${dependency}\``),
        'None.',
      ),
      '',
      '**Acceptance criteria**',
      '',
      ...bullets(slice.acceptance_criteria, 'None recorded.'),
      '',
      '**Verification**',
      '',
      ...slice.verification.flatMap((verification) => [
        `- \`${inline(verification.command)}\`${verification.purpose ? `: ${inline(verification.purpose)}` : ''}`,
      ]),
      '',
      '**Risks**',
      '',
      ...bullets(slice.risks, 'None recorded.'),
      '',
      '**Rollback**',
      '',
      ...bullets(slice.rollback_notes, 'None recorded.'),
      '',
    )
  }

  lines.push(
    '## Assumptions',
    '',
    ...bullets(
      content.assumptions.map((assumption) => `${assumption.statement} (\`${assumption.id}\`)`),
      'No assumptions.',
    ),
    '',
    '## Unresolved blockers',
    '',
    ...bullets(
      content.unresolved_blockers.map((blocker) => `${blocker.statement} (\`${blocker.id}\`)`),
      'No unresolved blockers.',
    ),
    '',
    '## Out of scope',
    '',
    ...bullets(content.out_of_scope, 'Nothing additional recorded.'),
    '',
    '## Authorization boundary',
    '',
    content.authorization_notice,
  )

  return `${lines.join('\n').trim()}\n`
}
