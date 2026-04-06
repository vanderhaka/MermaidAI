import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().nullable().optional(),
})

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().nullable().optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: 'At least one field must be provided',
  })
