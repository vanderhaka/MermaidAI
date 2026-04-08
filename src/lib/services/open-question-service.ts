'use server'

import 'server-only'

import { createOpenQuestionSchema, resolveOpenQuestionSchema } from '@/lib/schemas/open-question'
import { createClient } from '@/lib/supabase/server'
import type { OpenQuestion } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export async function createOpenQuestion(input: {
  project_id: string
  node_id: string
  section: string
  question: string
}): Promise<ServiceResult<OpenQuestion>> {
  const parsed = createOpenQuestionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('open_questions')
    .insert(parsed.data)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as OpenQuestion }
}

export async function resolveOpenQuestion(
  id: string,
  resolution: string,
): Promise<ServiceResult<OpenQuestion>> {
  const parsed = resolveOpenQuestionSchema.safeParse({ resolution })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('open_questions')
    .update({
      status: 'resolved',
      resolution: parsed.data.resolution,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as OpenQuestion }
}

export async function listOpenQuestions(projectId: string): Promise<ServiceResult<OpenQuestion[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('open_questions')
    .select()
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as OpenQuestion[] }
}

export async function listOpenOpenQuestions(
  projectId: string,
): Promise<ServiceResult<OpenQuestion[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('open_questions')
    .select()
    .eq('project_id', projectId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as OpenQuestion[] }
}
