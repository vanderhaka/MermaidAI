'use server'

import 'server-only'

import { getAuthUserId } from '@/lib/auth'
import { createFlowEdgeSchema } from '@/lib/schemas/flow-edge'
import { createFlowNodeSchema } from '@/lib/schemas/flow-node'
import { createClient } from '@/lib/supabase/server'
import type { FlowEdge, FlowNode } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export type ModuleGraph = {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export async function getGraphForModule(moduleId: string): Promise<ServiceResult<ModuleGraph>> {
  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data: nodes, error: nodesError } = await supabase
    .from('flow_nodes')
    .select(
      'id, module_id, label, node_type, position_x, position_y, pseudocode, color, created_at, updated_at',
    )
    .eq('module_id', moduleId)

  if (nodesError) {
    return { success: false, error: nodesError.message }
  }

  const { data: edges, error: edgesError } = await supabase
    .from('flow_edges')
    .select('id, module_id, source_node_id, target_node_id, label, condition, created_at')
    .eq('module_id', moduleId)

  if (edgesError) {
    return { success: false, error: edgesError.message }
  }

  return {
    success: true,
    data: {
      nodes: nodes as unknown as FlowNode[],
      edges: edges as FlowEdge[],
    },
  }
}

export async function addNode(input: Record<string, unknown>): Promise<ServiceResult<FlowNode>> {
  const parsed = createFlowNodeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: `Validation failed: ${parsed.error.issues[0].message}` }
  }

  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data, error } = await supabase
    .from('flow_nodes')
    .insert(parsed.data)
    .select(
      'id, module_id, label, node_type, position_x, position_y, pseudocode, color, created_at, updated_at',
    )
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as unknown as FlowNode }
}

export async function updateNode(
  id: string,
  data: Partial<Pick<FlowNode, 'label' | 'pseudocode' | 'position' | 'color' | 'node_type'>>,
): Promise<ServiceResult<FlowNode>> {
  const { position, ...rest } = data

  const dbFields: Record<string, unknown> = { ...rest }
  if (position) {
    dbFields.position_x = position.x
    dbFields.position_y = position.y
  }

  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data: updated, error } = await supabase
    .from('flow_nodes')
    .update(dbFields)
    .eq('id', id)
    .select(
      'id, module_id, label, node_type, position_x, position_y, pseudocode, color, created_at, updated_at',
    )
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: updated as unknown as FlowNode }
}

export async function removeNode(id: string): Promise<ServiceResult<null>> {
  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { error } = await supabase.from('flow_nodes').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: null }
}

export async function addEdge(input: Record<string, unknown>): Promise<ServiceResult<FlowEdge>> {
  const parsed = createFlowEdgeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: `Validation failed: ${parsed.error.issues[0].message}` }
  }

  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { data, error } = await supabase
    .from('flow_edges')
    .insert(parsed.data)
    .select('id, module_id, source_node_id, target_node_id, label, condition, created_at')
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as FlowEdge }
}

export async function removeEdge(id: string): Promise<ServiceResult<null>> {
  const userId = await getAuthUserId()
  if (!userId) return { success: false, error: 'Not authenticated' }

  const supabase = createClient()

  const { error } = await supabase.from('flow_edges').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: null }
}
