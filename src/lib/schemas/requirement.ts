import { z } from 'zod'

export const REQUIREMENT_KINDS = ['functional', 'rule', 'constraint', 'non_functional'] as const

export const REQUIREMENT_STATUSES = ['proposed', 'agreed', 'disputed', 'out_of_scope'] as const

export const createRequirementSchema = z.object({
  project_id: z.uuid(),
  module_id: z.uuid().nullable().default(null),
  statement: z.string().trim().min(1).max(1000),
  kind: z.enum(REQUIREMENT_KINDS).default('functional'),
  status: z.enum(REQUIREMENT_STATUSES).default('proposed'),
  coverage_area: z.string().trim().max(100).nullable().default(null),
  source_question_id: z.uuid().nullable().default(null),
})

export const updateRequirementSchema = z.object({
  statement: z.string().trim().min(1).max(1000).optional(),
  kind: z.enum(REQUIREMENT_KINDS).optional(),
  status: z.enum(REQUIREMENT_STATUSES).optional(),
  coverage_area: z.string().trim().max(100).nullable().optional(),
  module_id: z.uuid().nullable().optional(),
})
