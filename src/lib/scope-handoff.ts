export const SCOPE_HANDOFF_PROMPT =
  'Turn the captured Quick Capture flow into a Full Design module map now. Create and connect every module, preserve the captured decisions, and carry unresolved questions forward without blocking.'

function handoffKey(projectId: string): string {
  return `mermaid:scope-handoff:${projectId}`
}

export function queueScopeHandoff(projectId: string): void {
  try {
    window.sessionStorage.setItem(handoffKey(projectId), 'pending')
  } catch {
    // The mode switch still succeeds when browser storage is unavailable.
  }
}

export function takeScopeHandoff(projectId: string): boolean {
  try {
    const key = handoffKey(projectId)
    if (window.sessionStorage.getItem(key) !== 'pending') return false
    window.sessionStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}
