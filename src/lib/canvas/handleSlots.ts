import type { ModuleConnection } from '@/types/graph'

/** Suffix for fan-out / fan-in ports: `return_approved__s0`, `login__s1`, … */
const HANDLE_SLOT_SUFFIX = /__s\d+$/

export function stripHandleSlotSuffix(pointName: string): string {
  return pointName.replace(HANDLE_SLOT_SUFFIX, '')
}

/**
 * When several edges share the same logical exit or entry on a module, assign distinct
 * port ids (`name__s0`, `name__s1`, …) so React Flow renders one handle per edge.
 * Single-edge groups keep the unsuffixed name.
 */
export function expandConnectionHandlePoints(connections: ModuleConnection[]): {
  sourcePointByConnectionId: Map<string, string>
  targetPointByConnectionId: Map<string, string>
} {
  const sourceGroups = new Map<string, ModuleConnection[]>()
  const targetGroups = new Map<string, ModuleConnection[]>()

  for (const c of connections) {
    const sKey = `${c.source_module_id}::${c.source_exit_point}`
    const tKey = `${c.target_module_id}::${c.target_entry_point}`
    const sList = sourceGroups.get(sKey) ?? []
    sList.push(c)
    sourceGroups.set(sKey, sList)
    const tList = targetGroups.get(tKey) ?? []
    tList.push(c)
    targetGroups.set(tKey, tList)
  }

  const sourcePointByConnectionId = new Map<string, string>()
  for (const list of sourceGroups.values()) {
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id))
    if (sorted.length === 1) {
      sourcePointByConnectionId.set(sorted[0].id, sorted[0].source_exit_point)
    } else {
      sorted.forEach((c, i) => {
        sourcePointByConnectionId.set(c.id, `${c.source_exit_point}__s${i}`)
      })
    }
  }

  const targetPointByConnectionId = new Map<string, string>()
  for (const list of targetGroups.values()) {
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id))
    if (sorted.length === 1) {
      targetPointByConnectionId.set(sorted[0].id, sorted[0].target_entry_point)
    } else {
      sorted.forEach((c, i) => {
        targetPointByConnectionId.set(c.id, `${c.target_entry_point}__s${i}`)
      })
    }
  }

  return { sourcePointByConnectionId, targetPointByConnectionId }
}
