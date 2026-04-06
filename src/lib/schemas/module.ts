import { z } from 'zod'

export const createModuleSchema = z.object({
  project_id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  position: z.object({ x: z.number(), y: z.number() }),
  color: z.string(),
  entry_points: z.array(z.string()).default([]),
  exit_points: z.array(z.string()).default([]),
})
