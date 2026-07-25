import { z } from 'zod'

export const OPEN_QUESTION_STATUSES = ['open', 'resolved'] as const

export const createOpenQuestionSchema = z.object({
  project_id: z.uuid(),
  /** Survives deletion of the canvas marker, so a resolved question keeps its module. */
  module_id: z.uuid().nullable().default(null),
  node_id: z.uuid().nullable().default(null),
  section: z.string().trim().min(1).max(100),
  question: z.string().trim().min(1).max(500),
  status: z.enum(OPEN_QUESTION_STATUSES).default('open'),
  resolution: z.string().nullable().default(null),
  coverage_area: z.string().trim().max(100).nullable().default(null),
})

export const resolveOpenQuestionSchema = z.object({
  resolution: z.string().trim().min(1).max(1000),
})
