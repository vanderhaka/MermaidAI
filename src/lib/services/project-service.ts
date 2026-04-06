'use server'

import { createProjectSchema } from '@/lib/schemas/project'
import { createClient } from '@/lib/supabase/server'
import type { Project } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export async function createProject(input: {
  name: string
  description?: string | null
}): Promise<ServiceResult<Project>> {
  const parsed = createProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from('projects').insert(parsed.data).select().single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as Project }
}
