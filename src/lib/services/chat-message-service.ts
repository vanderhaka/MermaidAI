'use server'

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { CreateChatMessageInput } from '@/types/chat'
import type { Database } from '@/types/database'

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row']

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export async function addChatMessage(
  input: CreateChatMessageInput,
): Promise<ServiceResult<ChatMessageRow>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .insert(input as Database['public']['Tables']['chat_messages']['Insert'])
    .select()
    .single()

  if (error) {
    if (error.code === '23505' && input.message_key) {
      const { data: existing, error: lookupError } = await supabase
        .from('chat_messages')
        .select()
        .eq('project_id', input.project_id)
        .eq('message_key', input.message_key)
        .maybeSingle()

      if (lookupError) return { success: false, error: lookupError.message }
      if (existing && matchesDurableMessage(existing, input)) {
        return { success: true, data: existing }
      }
      if (existing) {
        return {
          success: false,
          error: 'Message key is already linked to different chat content or identity.',
        }
      }
    }
    return { success: false, error: error.message }
  }

  return { success: true, data }
}

function matchesDurableMessage(existing: ChatMessageRow, input: CreateChatMessageInput): boolean {
  const sameLogicalMessage =
    existing.project_id === input.project_id &&
    existing.role === input.role &&
    existing.content === input.content &&
    existing.turn_id === (input.turn_id ?? null) &&
    existing.message_key === (input.message_key ?? null) &&
    existing.planning_stage === (input.planning_stage ?? null) &&
    existing.artifact_id === (input.artifact_id ?? null)

  if (!sameLogicalMessage) return false

  // A Retry may replay the same user turn after its first attempt persisted
  // before the command committed. The immutable user row remains linked to the
  // source version; the new assistant attempt carries the committed linkage.
  if (input.role === 'user') {
    if (existing.change_set_id === null) {
      return (
        input.change_set_id == null ||
        (input.change_set_id !== null && input.artifact_version_id != null)
      )
    }
    return (
      existing.change_set_id === (input.change_set_id ?? null) &&
      existing.artifact_version_id === (input.artifact_version_id ?? null)
    )
  }

  return (
    existing.artifact_version_id === (input.artifact_version_id ?? null) &&
    existing.change_set_id === (input.change_set_id ?? null) &&
    jsonValuesEqual(existing.metadata, input.metadata ?? null)
  )
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    )
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        jsonValuesEqual(leftRecord[key], rightRecord[key]),
    )
  )
}

export async function listChatMessages(
  projectId: string,
): Promise<ServiceResult<ChatMessageRow[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select(
      'id, project_id, role, content, created_at, turn_id, message_key, planning_stage, artifact_id, artifact_version_id, change_set_id, metadata',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data }
}
