'use server'

import { createProjectSchema, updateProjectSchema } from '@/lib/schemas/project'
import { getUserWithDevAuth } from '@/lib/auth/dev-auth'
import { getSingleCanvasModuleDefaults } from '@/lib/project-modes'
import { createClient } from '@/lib/supabase/server'
import type { Project, ProjectMode } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

type DeleteResult = { success: true } | { success: false; error: string }

type ProjectSummary = Pick<
  Project,
  'id' | 'name' | 'description' | 'mode' | 'created_at' | 'updated_at'
>

export async function createProject(input: {
  name: string
  description?: string | null
  mode?: ProjectMode
}): Promise<ServiceResult<Project>> {
  const parsed = createProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await getUserWithDevAuth(supabase)
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  const project = data as Project

  // Auto-create the single canvas module used by lightweight modes.
  const moduleDefaults = getSingleCanvasModuleDefaults(project.mode)
  if (moduleDefaults) {
    const { error: moduleError } = await supabase.from('modules').insert({
      project_id: project.id,
      ...moduleDefaults,
      entry_points: [],
      exit_points: [],
      position_x: 0,
      position_y: 0,
    })

    if (moduleError) {
      await supabase.from('projects').delete().eq('id', project.id)
      return { success: false, error: moduleError.message }
    }
  }

  return { success: true, data: project }
}

export async function updateProject(
  id: string,
  input: { name?: string; description?: string | null; mode?: ProjectMode },
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
    .select('id, name, description, mode, created_at, updated_at')
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
    .select('id, user_id, name, description, mode, created_at, updated_at')
    .eq('id', id)
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as Project }
}

export async function deleteProject(id: string): Promise<DeleteResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('projects').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
