import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().nullable().optional(),
})
