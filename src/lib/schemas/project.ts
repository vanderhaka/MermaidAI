import { z } from 'zod'

export const PROJECT_MODES = ['scope', 'architecture'] as const

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().nullable().optional(),
  mode: z.enum(PROJECT_MODES).default('architecture'),
})

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().nullable().optional(),
    mode: z.enum(PROJECT_MODES).optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.description !== undefined || data.mode !== undefined,
    {
      message: 'At least one field must be provided',
    },
  )
