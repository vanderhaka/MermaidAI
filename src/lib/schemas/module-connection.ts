import { z } from 'zod'

export const createModuleConnectionSchema = z
  .object({
    project_id: z.uuid(),
    source_module_id: z.uuid(),
    target_module_id: z.uuid(),
    source_exit_point: z.string().min(1),
    target_entry_point: z.string().min(1),
  })
  .refine((data) => data.source_module_id !== data.target_module_id, {
    message: 'Source and target modules must be different',
    path: ['target_module_id'],
  })
