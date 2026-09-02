import type { ArchitectureChangeSummary } from '@/types/chat'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function operationTypes(value: unknown): string[] {
  const root = isRecord(value) ? value : null
  const nestedReceipt = root && isRecord(root.architectureReceipt) ? root.architectureReceipt : null
  const operations = Array.isArray(value)
    ? value
    : Array.isArray(root?.operations)
      ? root.operations
      : Array.isArray(nestedReceipt?.operations)
        ? nestedReceipt.operations
        : null
  if (!operations) return []

  return operations.flatMap((operation) => {
    if (!isRecord(operation) || typeof operation.type !== 'string') return []
    return [operation.type]
  })
}

export function summarizeArchitectureOperations(value: unknown): ArchitectureChangeSummary | null {
  const types = operationTypes(value)
  if (types.length === 0) return null

  const count = (matches: (type: string) => boolean) => types.filter(matches).length
  return {
    created: count(
      (type) =>
        type === 'module.create' ||
        type === 'module_connection.create' ||
        type === 'flow_node.create' ||
        type === 'flow_edge.create' ||
        type === 'question.create',
    ),
    updated: count(
      (type) =>
        type === 'module.update' ||
        type === 'flow_node.update' ||
        type === 'flow_edge.update' ||
        type === 'decision.update',
    ),
    deleted: count((type) => type.endsWith('.delete')),
    assumed: count((type) => type === 'decision.create'),
    resolved: count((type) => type === 'question.resolve'),
    capabilitiesCreated: count((type) => type === 'module.create'),
    connectionsCreated: count((type) => type === 'module_connection.create'),
    assumptionsRecorded: count((type) => type === 'decision.create'),
    questionsRecorded: count((type) => type === 'question.create'),
    provisional: true,
  }
}

export function readArchitectureChangeSummary(value: unknown): ArchitectureChangeSummary | null {
  if (!isRecord(value)) return null
  const source = isRecord(value.metadata) ? value.metadata : value
  const candidate = source.change_summary
  const derived = summarizeArchitectureOperations(value)
  if (!isRecord(candidate)) return derived
  if (
    !isCount(candidate.capabilitiesCreated) ||
    !isCount(candidate.connectionsCreated) ||
    !isCount(candidate.assumptionsRecorded) ||
    !isCount(candidate.questionsRecorded) ||
    candidate.provisional !== true
  ) {
    return derived
  }

  return {
    created: isCount(candidate.created)
      ? candidate.created
      : candidate.capabilitiesCreated + candidate.connectionsCreated + candidate.questionsRecorded,
    updated: isCount(candidate.updated) ? candidate.updated : (derived?.updated ?? 0),
    deleted: isCount(candidate.deleted) ? candidate.deleted : (derived?.deleted ?? 0),
    assumed: isCount(candidate.assumed) ? candidate.assumed : candidate.assumptionsRecorded,
    resolved: isCount(candidate.resolved) ? candidate.resolved : (derived?.resolved ?? 0),
    capabilitiesCreated: candidate.capabilitiesCreated,
    connectionsCreated: candidate.connectionsCreated,
    assumptionsRecorded: candidate.assumptionsRecorded,
    questionsRecorded: candidate.questionsRecorded,
    provisional: true,
  }
}

export function mergeArchitectureChangeSummaries(
  current: ArchitectureChangeSummary | null,
  next: ArchitectureChangeSummary | null,
): ArchitectureChangeSummary | null {
  if (!current) return next
  if (!next) return current

  return {
    created: current.created + next.created,
    updated: current.updated + next.updated,
    deleted: current.deleted + next.deleted,
    assumed: current.assumed + next.assumed,
    resolved: current.resolved + next.resolved,
    capabilitiesCreated: current.capabilitiesCreated + next.capabilitiesCreated,
    connectionsCreated: current.connectionsCreated + next.connectionsCreated,
    assumptionsRecorded: current.assumptionsRecorded + next.assumptionsRecorded,
    questionsRecorded: current.questionsRecorded + next.questionsRecorded,
    provisional: true,
  }
}
