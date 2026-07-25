'use server'

import 'server-only'

import { createRequirementSchema, updateRequirementSchema } from '@/lib/schemas/requirement'
import { createClient } from '@/lib/supabase/server'
import type { CreateRequirementInput, Requirement } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export async function createRequirement(
  input: CreateRequirementInput,
): Promise<ServiceResult<Requirement>> {
  const parsed = createRequirementSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from('requirements').insert(parsed.data).select().single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as Requirement }
}

export async function updateRequirement(
  id: string,
  input: Partial<
    Pick<Requirement, 'statement' | 'kind' | 'status' | 'coverage_area' | 'module_id'>
  >,
): Promise<ServiceResult<Requirement>> {
  const parsed = updateRequirementSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('requirements')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as Requirement }
}

export async function listRequirements(projectId: string): Promise<ServiceResult<Requirement[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('requirements')
    .select()
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as Requirement[] }
}

export async function deleteRequirement(id: string): Promise<ServiceResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.from('requirements').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: null }
}
