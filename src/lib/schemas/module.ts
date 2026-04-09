import { z } from 'zod'

export const createModuleSchema = z.object({
  project_id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  domain: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((s) => (s === undefined || s.length === 0 ? undefined : s)),
  description: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  color: z.string(),
  entry_points: z.array(z.string()).default([]),
  exit_points: z.array(z.string()).default([]),
})

export const updateModuleSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    domain: z.union([z.string().trim().max(80), z.null()]),
    description: z.string(),
    prd_content: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    color: z.string(),
    entry_points: z.array(z.string()),
    exit_points: z.array(z.string()),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })
