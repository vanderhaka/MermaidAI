import { z } from 'zod'

export const FLOW_NODE_TYPES = [
  'decision',
  'process',
  'entry',
  'exit',
  'start',
  'end',
  'question',
] as const

export const createFlowNodeSchema = z.object({
  module_id: z.uuid(),
  node_type: z.enum(FLOW_NODE_TYPES),
  label: z.string().trim().min(1).max(200),
  pseudocode: z.string().default(''),
  position: z.object({ x: z.number(), y: z.number() }),
  color: z.string(),
})
