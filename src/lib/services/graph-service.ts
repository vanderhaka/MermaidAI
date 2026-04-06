'use server'

import 'server-only'

import { createFlowNodeSchema } from '@/lib/schemas/flow-node'
import { createClient } from '@/lib/supabase/server'
import type { FlowEdge, FlowNode } from '@/types/graph'

type ServiceResult<T> = { success: true; data: T } | { success: false; error: string }

export type ModuleGraph = {
  nodes: FlowNode[]
  edges: FlowEdge[]
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
      nodes: nodes as FlowNode[],
      edges: edges as FlowEdge[],
    },
  }
}

export async function addNode(input: Record<string, unknown>): Promise<ServiceResult<FlowNode>> {
  const parsed = createFlowNodeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: `Validation failed: ${parsed.error.issues[0].message}` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from('flow_nodes').insert(parsed.data).select().single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: data as FlowNode }
}
