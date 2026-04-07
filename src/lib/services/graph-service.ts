'use server'

import 'server-only'

import { createFlowEdgeSchema } from '@/lib/schemas/flow-edge'
import { createFlowNodeSchema } from '@/lib/schemas/flow-node'
import { buildCartFlowRows, isCartModuleName } from '@/lib/module-templates'
import { createClient } from '@/lib/supabase/server'
import type { FlowEdge, FlowNode, FlowNodeType, Module } from '@/types/graph'
import type { Tables } from '@/types/database'

type FlowNodeRow = Tables<'flow_nodes'>
type FlowEdgeRow = Tables<'flow_edges'>
type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export type ModuleGraph = {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

function mapRowToNode(row: FlowNodeRow): FlowNode {
  return {
    id: row.id,
    module_id: row.module_id,
    node_type: row.node_type as FlowNodeType,
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

function mapRowToEdge(row: FlowEdgeRow): FlowEdge {
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

/**
 * When a module has no flow yet, seed a default graph for known module names (e.g. Cart).
 * Safe to call on every project load: no-ops if nodes already exist or no template matches.
 */
export async function ensureDefaultModuleGraph(
  module: Module,
): Promise<ServiceResult<ModuleGraph>> {
  const existing = await getGraphForModule(module.id)
  if (!existing.success) {
    return existing
  }
  if (existing.data.nodes.length > 0) {
    return existing
  }

  if (!isCartModuleName(module.name)) {
    return existing
  }

  const { nodes: nodeRows, edges: edgeRows } = buildCartFlowRows(module.id)
  const supabase = await createClient()

  const { error: nodesError } = await supabase
    .from('flow_nodes')
    .upsert(nodeRows, { onConflict: 'id', ignoreDuplicates: true })
  if (nodesError) {
    return { success: false, error: nodesError.message }
  }

  const { error: edgesError } = await supabase
    .from('flow_edges')
    .upsert(edgeRows, { onConflict: 'id', ignoreDuplicates: true })
  if (edgesError) {
    return { success: false, error: edgesError.message }
  }

  return getGraphForModule(module.id)
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
