'use server'

import { createModuleSchema } from '@/lib/schemas/module'
import { createClient } from '@/lib/supabase/server'
import type { Module } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

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

  const row: Module = {
    id: data.id,
    project_id: data.project_id,
    name: data.name,
    description: data.description,
    position: { x: data.position_x, y: data.position_y },
    color: data.color ?? '',
    entry_points: data.entry_points,
    exit_points: data.exit_points,
    created_at: data.created_at,
    updated_at: data.updated_at,
  }

  return { success: true, data: row }
}
