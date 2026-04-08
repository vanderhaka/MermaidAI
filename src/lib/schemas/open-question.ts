import { z } from 'zod'

export const OPEN_QUESTION_STATUSES = ['open', 'resolved'] as const

export const createOpenQuestionSchema = z.object({
  project_id: z.uuid(),
  node_id: z.uuid(),
  section: z.string().trim().min(1).max(100),
  question: z.string().trim().min(1).max(500),
  status: z.enum(OPEN_QUESTION_STATUSES).default('open'),
  resolution: z.string().nullable().default(null),
})

export const resolveOpenQuestionSchema = z.object({
  resolution: z.string().trim().min(1).max(1000),
})
