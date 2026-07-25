'use server'

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { RequirementLink, RequirementLinkKind, RequirementNode } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export async function listRequirementLinks(
  requirementIds: string[],
): Promise<ServiceResult<RequirementLink[]>> {
  if (requirementIds.length === 0) return { success: true, data: [] }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('requirement_links')
    .select()
    .in('source_requirement_id', requirementIds)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as RequirementLink[] }
}

export async function linkRequirements(input: {
  sourceRequirementId: string
  targetRequirementId: string
  kind?: RequirementLinkKind
}): Promise<ServiceResult<RequirementLink>> {
  if (input.sourceRequirementId === input.targetRequirementId) {
    return { success: false, error: 'A requirement cannot link to itself.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('requirement_links')
    .insert({
      source_requirement_id: input.sourceRequirementId,
      target_requirement_id: input.targetRequirementId,
      kind: input.kind ?? 'depends_on',
    })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as RequirementLink }
}

export async function listRequirementNodes(
  requirementIds: string[],
): Promise<ServiceResult<RequirementNode[]>> {
  if (requirementIds.length === 0) return { success: true, data: [] }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('requirement_nodes')
    .select()
    .in('requirement_id', requirementIds)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as RequirementNode[] }
}

/** Attach a requirement to the flow nodes it governs. Duplicate pairs are ignored. */
export async function linkRequirementToNodes(
  requirementId: string,
  nodeIds: string[],
): Promise<ServiceResult<RequirementNode[]>> {
  const unique = Array.from(new Set(nodeIds.filter(Boolean)))
  if (unique.length === 0) return { success: true, data: [] }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('requirement_nodes')
    .upsert(
      unique.map((nodeId) => ({ requirement_id: requirementId, node_id: nodeId })),
      { onConflict: 'requirement_id,node_id', ignoreDuplicates: true },
    )
    .select()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: (data ?? []) as RequirementNode[] }
}
