import type { Module, OpenQuestion } from '@/types/graph'
import { renderModulePrd } from '@/lib/services/prd-renderers'

type PrdFile = {
  filename: string
  content: string
}

export type PrdInput = {
  projectName: string
  projectDescription: string | null
  modules: Module[]
  nodes: import('@/types/graph').FlowNode[]
  edges: import('@/types/graph').FlowEdge[]
  connections: import('@/types/graph').ModuleConnection[]
  openQuestions: OpenQuestion[]
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function generateOverview(input: PrdInput): string {
  const { projectName, projectDescription, modules, connections, openQuestions } = input
  const lines: string[] = []
  const date = new Date().toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  lines.push(`# ${projectName} — Product Requirements`, '', `*Generated ${date}*`, '')

  if (projectDescription) {
    lines.push('## Overview', '', projectDescription, '')
  }

  lines.push('## Modules', '')

  const domainMap = new Map<string, Module[]>()
  for (const mod of modules) {
    const domain = mod.domain ?? 'General'
    const group = domainMap.get(domain) ?? []
    group.push(mod)
    domainMap.set(domain, group)
  }

  for (const [domain, group] of domainMap) {
    lines.push(`### ${domain}`, '')
    for (const mod of group) {
      const slug = slugify(mod.name)
      const desc = mod.description ? ` — ${mod.description.split(/[.\n]/)[0]}` : ''
      lines.push(`- [${mod.name}](modules/${slug}.md)${desc}`)
    }
    lines.push('')
  }

  if (connections.length > 0) {
    lines.push('## System Connections', '')
    lines.push('| From | Exit Point | To | Entry Point |')
    lines.push('|------|------------|-----|-------------|')
    for (const conn of connections) {
      const src = modules.find((m) => m.id === conn.source_module_id)
      const tgt = modules.find((m) => m.id === conn.target_module_id)
      lines.push(
        `| ${src?.name ?? '?'} | ${conn.source_exit_point} | ${tgt?.name ?? '?'} | ${conn.target_entry_point} |`,
      )
    }
    lines.push('')
  }

  const allOpen = openQuestions.filter((q) => q.status === 'open')
  if (allOpen.length > 0) {
    lines.push('## Unresolved Questions', '')
    for (const q of allOpen) {
      lines.push(`- [ ] **${q.section}**: ${q.question}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/** Generate all PRD files for a project. Returns one overview + one file per module. */
export function generatePrdFiles(input: PrdInput): PrdFile[] {
  const files: PrdFile[] = []

  files.push({ filename: 'README.md', content: generateOverview(input) })

  for (const mod of input.modules) {
    const slug = slugify(mod.name)
    files.push({
      filename: `modules/${slug}.md`,
      content: renderModulePrd(
        mod,
        input.nodes,
        input.edges,
        input.connections,
        input.openQuestions,
        input.modules,
      ),
    })
  }

  return files
}

/** Generate a single combined PRD markdown (for single-module / scope mode). */
export function generateSinglePrd(input: PrdInput): string {
  if (input.modules.length <= 1) {
    const mod = input.modules[0]
    if (!mod) return `# ${input.projectName}\n\nNo modules captured yet.\n`

    const date = new Date().toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    let header = `# ${input.projectName} — Product Requirements\n\n*Generated ${date}*\n\n`
    if (input.projectDescription) {
      header += `${input.projectDescription}\n\n---\n\n`
    }

    return (
      header +
      renderModulePrd(
        mod,
        input.nodes,
        input.edges,
        input.connections,
        input.openQuestions,
        input.modules,
        { skipHeader: true },
      )
    )
  }

  const overview = generateOverview(input)
  const moduleSections = input.modules.map((mod) =>
    renderModulePrd(
      mod,
      input.nodes,
      input.edges,
      input.connections,
      input.openQuestions,
      input.modules,
    ),
  )

  return [overview, '---', ...moduleSections].join('\n\n')
}
