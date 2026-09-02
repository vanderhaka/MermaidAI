import type { ArchitectureReadinessReport } from '@/lib/services/architecture-readiness'
import type { ArchitectureSnapshotContent } from '@/types/planning'
import type { PlanningDecisionView } from '@/types/planning-ui'

export type ArchitectureBriefVersion = {
  id: string
  version: number
  contentHash: string
  content: ArchitectureSnapshotContent
}

export type ArchitectureBriefInput = {
  projectName: string
  version: ArchitectureBriefVersion
  report: ArchitectureReadinessReport | null
  decisions: PlanningDecisionView[]
}

const READINESS_LABELS = {
  draft: 'Draft',
  needs_input: 'Needs input',
  ready_with_assumptions: 'Ready with assumptions',
  ready: 'Ready for Work Plan',
} as const

function inline(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function bulletList(values: string[], emptyMessage: string): string[] {
  const items = values.map(inline).filter(Boolean)
  return items.length > 0 ? items.map((value) => `- ${value}`) : [`_${emptyMessage}_`]
}

function matchingReport(
  version: ArchitectureBriefVersion,
  report: ArchitectureReadinessReport | null,
): ArchitectureReadinessReport | null {
  if (
    !report ||
    report.architectureVersionId !== version.id ||
    report.architectureVersion !== version.version ||
    report.architectureContentHash !== version.contentHash
  ) {
    return null
  }
  return report
}

function decisionSections(versionId: string, decisions: PlanningDecisionView[]): string[] {
  const active = decisions
    .filter(
      (decision) =>
        decision.artifact_version_id === versionId &&
        (decision.state === 'accepted' || decision.state === 'proposed'),
    )
    .toSorted((left, right) =>
      `${left.state}:${left.category}:${left.id}`.localeCompare(
        `${right.state}:${right.category}:${right.id}`,
      ),
    )
  const accepted = active.filter((decision) => decision.state === 'accepted')
  const proposed = active.filter((decision) => decision.state === 'proposed')

  return [
    '## Accepted decisions',
    '',
    ...bulletList(
      accepted.map((decision) => `${inline(decision.statement)} _(${inline(decision.category)})_`),
      'No accepted decisions recorded for this version.',
    ),
    '',
    '## Proposed assumptions to review',
    '',
    ...bulletList(
      proposed.map((decision) => `${inline(decision.statement)} _(${inline(decision.category)})_`),
      'No proposed assumptions awaiting review.',
    ),
  ]
}

export function renderArchitectureBrief(input: ArchitectureBriefInput): string {
  const { content } = input.version
  const report = matchingReport(input.version, input.report)
  const capabilityNames = new Map(
    content.capabilities.map((capability) => [capability.id, inline(capability.name)]),
  )
  const readiness = report
    ? report.freshness === 'current'
      ? READINESS_LABELS[report.state]
      : 'Readiness needs refresh'
    : `Readiness not evaluated for Architecture v${input.version.version}`

  const lines = [
    `# ${inline(input.projectName)} Architecture Brief`,
    '',
    `> Architecture v${input.version.version} · ${readiness}`,
    '',
    `Source version ID: \`${input.version.id}\`  `,
    `Content hash: \`${input.version.contentHash}\``,
    '',
    '## Objective',
    '',
    inline(content.objective) || '_No objective recorded._',
    '',
    '## Outcomes',
    '',
    ...bulletList(content.outcomes, 'No outcomes recorded.'),
    '',
    '## Actors',
    '',
    ...bulletList(content.actors, 'No actors recorded.'),
    '',
    '## Capabilities',
    '',
  ]

  if (content.capabilities.length === 0) {
    lines.push('_No capabilities recorded._', '')
  } else {
    for (const capability of content.capabilities) {
      lines.push(
        `### ${inline(capability.name)}`,
        '',
        inline(capability.purpose) || '_No purpose recorded._',
        '',
        '**Responsibilities**',
        '',
        ...bulletList(capability.responsibilities, 'No responsibilities recorded.'),
        '',
        '**Boundaries**',
        '',
        ...bulletList(capability.boundaries, 'No boundaries recorded.'),
        '',
      )
    }
  }

  lines.push('## Connections', '')
  if (content.connections.length === 0) {
    lines.push('_No capability connections recorded._', '')
  } else {
    for (const connection of content.connections) {
      const from =
        capabilityNames.get(connection.from_capability_id) ?? connection.from_capability_id
      const to = capabilityNames.get(connection.to_capability_id) ?? connection.to_capability_id
      lines.push(`- **${from} -> ${to}:** ${inline(connection.description)}`)
    }
    lines.push('')
  }

  lines.push('## Important flows', '')
  if (content.important_flows.length === 0) {
    lines.push('_No important actor flows recorded._', '')
  } else {
    for (const flow of content.important_flows) {
      const capabilities = flow.capability_ids.map((id) => capabilityNames.get(id) ?? id)
      lines.push(
        `- **${inline(flow.actor)}: ${inline(flow.outcome)}** via ${capabilities.join(' -> ')}`,
      )
    }
    lines.push('')
  }

  lines.push(
    '## Architecture assumptions',
    '',
    ...bulletList(
      content.assumptions.map((assumption) => assumption.statement),
      'No Architecture assumptions recorded.',
    ),
    '',
    ...decisionSections(input.version.id, input.decisions),
    '',
    '## Blockers',
    '',
    ...bulletList(
      content.blockers.map((blocker) => blocker.statement),
      'No blockers recorded.',
    ),
  )

  if (report && report.reasons.length > 0) {
    lines.push('', '## Readiness attention', '', ...bulletList(report.reasons, 'None.'))
  }

  return `${lines.join('\n').trim()}\n`
}
