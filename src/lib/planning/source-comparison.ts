import type { ArchitectureSnapshotContent } from '@/types/planning'

export type ArchitectureSourceComparison = {
  fromVersion: number
  toVersion: number
  capabilitiesAdded: number
  capabilitiesRemoved: number
  capabilitiesChanged: number
  connectionsAdded: number
  connectionsRemoved: number
  connectionsChanged: number
  decisionsChanged: number
}

function countCollectionChanges<T>(
  before: readonly T[],
  after: readonly T[],
  identify: (item: T) => string,
): { added: number; removed: number; changed: number } {
  const beforeById = new Map(before.map((item) => [identify(item), item]))
  const afterById = new Map(after.map((item) => [identify(item), item]))
  let changed = 0

  for (const [id, item] of afterById) {
    const previous = beforeById.get(id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(item)) changed += 1
  }

  return {
    added: [...afterById.keys()].filter((id) => !beforeById.has(id)).length,
    removed: [...beforeById.keys()].filter((id) => !afterById.has(id)).length,
    changed,
  }
}

export function compareArchitectureSources(input: {
  fromVersion: number
  toVersion: number
  before: ArchitectureSnapshotContent
  after: ArchitectureSnapshotContent
}): ArchitectureSourceComparison {
  const capabilities = countCollectionChanges(
    input.before.capabilities,
    input.after.capabilities,
    (capability) => capability.id,
  )
  const connections = countCollectionChanges(
    input.before.connections,
    input.after.connections,
    (connection) => `${connection.from_capability_id}\u0000${connection.to_capability_id}`,
  )
  const assumptions = countCollectionChanges(
    input.before.assumptions,
    input.after.assumptions,
    (assumption) => assumption.id,
  )
  const blockers = countCollectionChanges(
    input.before.blockers,
    input.after.blockers,
    (blocker) => blocker.id,
  )

  return {
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    capabilitiesAdded: capabilities.added,
    capabilitiesRemoved: capabilities.removed,
    capabilitiesChanged: capabilities.changed,
    connectionsAdded: connections.added,
    connectionsRemoved: connections.removed,
    connectionsChanged: connections.changed,
    decisionsChanged:
      assumptions.added +
      assumptions.removed +
      assumptions.changed +
      blockers.added +
      blockers.removed +
      blockers.changed,
  }
}
