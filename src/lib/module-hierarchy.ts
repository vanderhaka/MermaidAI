import type { Module } from '@/types/graph'

/** Default L1 label when domain is unset */
export const DEFAULT_DOMAIN_LABEL = 'General'

export type DomainGroup = {
  domain: string
  modules: Module[]
}

export function displayDomain(domain: string | null | undefined): string {
  const t = domain?.trim()
  return t && t.length > 0 ? t : DEFAULT_DOMAIN_LABEL
}

export function groupModulesByDomain(modules: Module[]): DomainGroup[] {
  const map = new Map<string, Module[]>()
  for (const m of modules) {
    const key = displayDomain(m.domain)
    const list = map.get(key)
    if (list) list.push(m)
    else map.set(key, [m])
  }
  const entries = [...map.entries()].sort(([a], [b]) => {
    if (a === DEFAULT_DOMAIN_LABEL) return 1
    if (b === DEFAULT_DOMAIN_LABEL) return -1
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
  return entries.map(([domain, mods]) => ({ domain, modules: mods }))
}
