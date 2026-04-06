'use server'

import 'server-only'

import { getAuthUserId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { CreateChatMessageInput } from '@/types/chat'

type ChatMessageRow = {
  id: string
  project_id: string
  role: string
  content: string
  created_at: string
}

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export async function addChatMessage(
  input: CreateChatMessageInput,
): Promise<ServiceResult<ChatMessageRow>> {
  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data, error } = await supabase
    .from('chat_messages')
    .insert(input)
    .select('id, project_id, role, content, created_at')
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as ChatMessageRow }
}

export async function listChatMessages(
  projectId: string,
): Promise<ServiceResult<ChatMessageRow[]>> {
  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, project_id, role, content, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as ChatMessageRow[] }
}
