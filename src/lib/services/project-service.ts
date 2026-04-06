'use server'

import { createProjectSchema, updateProjectSchema } from '@/lib/schemas/project'
import { createClient } from '@/lib/supabase/server'
import type { Project } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

type ProjectSummary = Pick<Project, 'id' | 'name' | 'description' | 'created_at' | 'updated_at'>

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

export async function updateProject(
  id: string,
  input: { name?: string; description?: string | null },
): Promise<ServiceResult<Project>> {
  const parsed = updateProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as Project }
}

export async function listProjectsByUser(): Promise<ServiceResult<ProjectSummary[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as ProjectSummary[] }
}

export async function getProjectById(id: string): Promise<ServiceResult<Project>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, name, description, created_at, updated_at')
    .eq('id', id)
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as Project }
}
