'use server'

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { ModulePrdSection } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

/** Rebuild the flat markdown blob from ordered sections, for readers that expect prd_content. */
export async function composePrdContent(sections: ModulePrdSection[]): Promise<string> {
  return sections
    .slice()
    .sort((a, b) => a.position - b.position || a.section.localeCompare(b.section))
    .filter((s) => s.content.trim())
    .map((s) => `## ${s.section}\n\n${s.content.trim()}`)
    .join('\n\n')
}

export async function listPrdSections(
  moduleId: string,
): Promise<ServiceResult<ModulePrdSection[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('module_prd_sections')
    .select()
    .eq('module_id', moduleId)
    .order('position', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as ModulePrdSection[] }
}

/**
 * Write one addressable section. `replace` overwrites it (the default — a revised requirement
 * supersedes the old one); `append` adds to it, for genuinely cumulative notes.
 */
export async function writePrdSection(input: {
  moduleId: string
  section: string
  markdown: string
  mode?: 'append' | 'replace'
}): Promise<ServiceResult<ModulePrdSection[]>> {
  const section = input.section.trim()
  if (!section) {
    return { success: false, error: 'section is required' }
  }

  const supabase = await createClient()

  const existingResult = await listPrdSections(input.moduleId)
  if (!existingResult.success) return existingResult

  const existing = existingResult.data.find((s) => s.section === section)
  const mode = input.mode ?? 'replace'

  const content =
    mode === 'append' && existing?.content.trim()
      ? `${existing.content}\n\n${input.markdown}`
      : input.markdown

  const position = existing?.position ?? existingResult.data.length

  const { error } = await supabase.from('module_prd_sections').upsert(
    {
      module_id: input.moduleId,
      section,
      content,
      position,
    },
    { onConflict: 'module_id,section' },
  )

  if (error) {
    return { success: false, error: error.message }
  }

  return listPrdSections(input.moduleId)
}
