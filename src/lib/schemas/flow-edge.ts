import { z } from 'zod'

export const createFlowEdgeSchema = z.object({
  module_id: z.uuid(),
  source_node_id: z.uuid(),
  target_node_id: z.uuid(),
  label: z.string().optional(),
  condition: z.string().optional(),
})
