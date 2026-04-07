/**
 * Aligns module-detail flow edges with {@link ModuleMapView} connection styling:
 * green for primary / yes paths, orange for adverse exits, “no” branches, or error-related labels.
 */
export const FLOW_EDGE_ERROR_KEYWORDS =
  /failure|fail|error|cancel|retry|return|rollback|reject|out of stock|low stock|deny|denied|invalid/i

export type ModuleFlowEdgeStyle = {
  stroke: string
  markerColor: string
  labelColor: string
  isErrorPath: boolean
}

export function getModuleFlowEdgeStyle(args: {
  label: string | null
  condition: string | null
  sourceHandle?: string | null
}): ModuleFlowEdgeStyle {
  const combined = `${args.label ?? ''} ${args.condition ?? ''} ${args.sourceHandle ?? ''}`
  if (FLOW_EDGE_ERROR_KEYWORDS.test(combined)) {
    return {
      stroke: '#f97316',
      markerColor: '#f97316',
      labelColor: '#ea580c',
      isErrorPath: true,
    }
  }
  if (args.sourceHandle === 'no') {
    return {
      stroke: '#f97316',
      markerColor: '#f97316',
      labelColor: '#ea580c',
      isErrorPath: true,
    }
  }
  return {
    stroke: '#22c55e',
    markerColor: '#22c55e',
    labelColor: '#16a34a',
    isErrorPath: false,
  }
}

/**
 * Map edge labels (and optional `condition` copy) to decision handles.
 * `condition` is used when the DB stores human-readable text in `condition` but omits literal yes/no in `label`.
 */
export function inferDecisionSourceHandle(
  label: string | null | undefined,
  condition?: string | null | undefined,
): string | undefined {
  const fromShortLabel = (text: string | null | undefined) => {
    const l = text?.toLowerCase().trim()
    if (l === 'yes' || l === 'y') return 'yes'
    if (l === 'no' || l === 'n') return 'no'
    return undefined
  }

  const fromLabel = fromShortLabel(label)
  if (fromLabel) return fromLabel

  const c = condition?.toLowerCase() ?? ''
  if (/\b(guest|anonymous)\b/.test(c)) return 'no'
  if (/\b(logged in|authenticated|signed in)\b/.test(c)) return 'yes'
  if (/\b(insufficient|oos|out of stock|low stock)\b/.test(c)) return 'no'
  if (/\b(sufficient|stock ok)\b/.test(c)) return 'yes'

  return fromShortLabel(condition)
}
