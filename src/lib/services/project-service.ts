'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'

import { getAuthUserId } from '@/lib/auth'
import { createProjectSchema, updateProjectSchema } from '@/lib/schemas/project'
import { createClient } from '@/lib/supabase/server'
import type { Project } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

type DeleteResult = { success: true } | { success: false; error: string }

type ProjectSummary = Pick<Project, 'id' | 'name' | 'description' | 'created_at' | 'updated_at'>

export async function createProject(input: {
  name: string
  description?: string | null
}): Promise<ServiceResult<Project>> {
  const parsed = createProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data, error } = await supabase
    .from('projects')
    .insert({ ...parsed.data, user_id: userId })
    .select('id, user_id, name, description, created_at, updated_at')
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard')
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

  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data, error } = await supabase
    .from('projects')
    .update(parsed.data)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, user_id, name, description, created_at, updated_at')
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true, data: data as Project }
}

export async function listProjectsByUser(): Promise<ServiceResult<ProjectSummary[]>> {
  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as ProjectSummary[] }
}

export async function getProjectById(id: string): Promise<ServiceResult<Project>> {
  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, name, description, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as Project }
}

export async function deleteProject(id: string): Promise<DeleteResult> {
  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', userId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}
