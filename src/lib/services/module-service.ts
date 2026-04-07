'use server'

import { createModuleSchema, updateModuleSchema } from '@/lib/schemas/module'
import { createClient } from '@/lib/supabase/server'
import type { Module } from '@/types/graph'
import type { Tables } from '@/types/database'

type ModuleRow = Tables<'modules'>
type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

function mapRowToModule(row: ModuleRow): Module {
  return {
    id: row.id,
    project_id: row.project_id,
    domain: row.domain ?? null,
    name: row.name,
    description: row.description ?? null,
    position: { x: row.position_x ?? 0, y: row.position_y ?? 0 },
    color: row.color ?? '',
    entry_points: Array.isArray(row.entry_points) ? (row.entry_points as string[]) : [],
    exit_points: Array.isArray(row.exit_points) ? (row.exit_points as string[]) : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function createModule(input: Record<string, unknown>): Promise<ServiceResult<Module>> {
  const parsed = createModuleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: `Validation failed: ${parsed.error.issues[0].message}` }
  }

  const { position, ...rest } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('modules')
    .insert({
      ...rest,
      position_x: position.x,
      position_y: position.y,
    })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: mapRowToModule(data) }
}

export async function updateModule(
  id: string,
  input: Record<string, unknown>,
): Promise<ServiceResult<Module>> {
  const parsed = updateModuleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: `Validation failed: ${parsed.error.issues[0].message}` }
  }

  const { position, ...rest } = parsed.data

  const dbFields: Record<string, unknown> = { ...rest }
  if (position) {
    dbFields.position_x = position.x
    dbFields.position_y = position.y
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('modules')
    .update(dbFields)
    .select()
    .eq('id', id)
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: mapRowToModule(data) }
}

export async function listModulesByProject(projectId: string): Promise<ServiceResult<Module[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('modules')
    .select()
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data.map(mapRowToModule) }
}

export async function getModuleById(id: string): Promise<ServiceResult<Module>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('modules').select().eq('id', id).single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: mapRowToModule(data) }
}

export async function deleteModule(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('modules').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
