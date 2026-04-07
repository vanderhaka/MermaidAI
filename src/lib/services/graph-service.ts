'use server'

import 'server-only'

import { createFlowEdgeSchema } from '@/lib/schemas/flow-edge'
import { createFlowNodeSchema } from '@/lib/schemas/flow-node'
import { createClient } from '@/lib/supabase/server'
import type { FlowEdge, FlowNode } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export type ModuleGraph = {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

function mapRowToNode(row: any): FlowNode {
  return {
    id: row.id,
    module_id: row.module_id,
    node_type: row.node_type,
    label: row.label,
    pseudocode: row.pseudocode ?? '',
    position: {
      x: row.position_x ?? 0,
      y: row.position_y ?? 0,
    },
    color: row.color ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function mapRowToEdge(row: any): FlowEdge {
  return {
    id: row.id,
    module_id: row.module_id,
    source_node_id: row.source_node_id,
    target_node_id: row.target_node_id,
    label: row.label ?? null,
    condition: row.condition ?? null,
    created_at: row.created_at,
  }
}

export async function getGraphForModule(moduleId: string): Promise<ServiceResult<ModuleGraph>> {
  const supabase = await createClient()

  const { data: nodes, error: nodesError } = await supabase
    .from('flow_nodes')
    .select()
    .eq('module_id', moduleId)

  if (nodesError) {
    return { success: false, error: nodesError.message }
  }

  const { data: edges, error: edgesError } = await supabase
    .from('flow_edges')
    .select()
    .eq('module_id', moduleId)

  if (edgesError) {
    return { success: false, error: edgesError.message }
  }

  return {
    success: true,
    data: {
      nodes: nodes.map(mapRowToNode),
      edges: edges.map(mapRowToEdge),
    },
  }
}

export async function addNode(input: Record<string, unknown>): Promise<ServiceResult<FlowNode>> {
  const parsed = createFlowNodeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: `Validation failed: ${parsed.error.issues[0].message}` }
  }

  const { position, ...rest } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('flow_nodes')
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

  return { success: true, data: mapRowToNode(data) }
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

  const supabase = await createClient()

  const { data: updated, error } = await supabase
    .from('flow_nodes')
    .update(dbFields)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: mapRowToNode(updated) }
}

export async function removeNode(id: string): Promise<ServiceResult<null>> {
  const supabase = await createClient()

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

  const supabase = await createClient()
  const { data, error } = await supabase.from('flow_edges').insert(parsed.data).select().single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: mapRowToEdge(data) }
}

export async function removeEdge(id: string): Promise<ServiceResult<null>> {
  const supabase = await createClient()

  const { error } = await supabase.from('flow_edges').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: null }
}
