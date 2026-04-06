'use server'

import 'server-only'

import { getAuthUserId } from '@/lib/auth'
import { createModuleConnectionSchema } from '@/lib/schemas/module-connection'
import { createClient } from '@/lib/supabase/server'
import type { ModuleConnection } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export async function connectModules(
  input: Record<string, unknown>,
): Promise<ServiceResult<ModuleConnection>> {
  const parsed = createModuleConnectionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: `Validation failed: ${parsed.error.issues[0].message}` }
  }

  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data, error } = await supabase
    .from('module_connections')
    .insert(parsed.data)
    .select(
      'id, project_id, source_module_id, target_module_id, source_exit_point, target_entry_point, created_at',
    )
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as ModuleConnection }
}

export async function disconnectModules(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { error } = await supabase.from('module_connections').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
