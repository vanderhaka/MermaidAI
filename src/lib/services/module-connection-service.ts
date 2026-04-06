'use server'

import 'server-only'

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

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('module_connections')
    .insert(parsed.data)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as ModuleConnection }
}

export async function disconnectModules(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('module_connections').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
