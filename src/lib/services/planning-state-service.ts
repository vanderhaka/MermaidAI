'use server'

import 'server-only'

import { z } from 'zod'

import { planningArtifactKindSchema, planningReadinessStateSchema } from '@/lib/schemas/planning'
import { createClient } from '@/lib/supabase/server'

const projectIdSchema = z.uuid()
const architectureViewportSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().positive().max(10),
  })
  .strict()

const planningStateSchema = z
  .object({
    project_id: projectIdSchema,
    stage: planningArtifactKindSchema,
    readiness_state: planningReadinessStateSchema,
    auto_decide_enabled: z.boolean(),
    staged_workflow_enabled: z.boolean(),
    write_safety_revision: z.number().int().nonnegative(),
    active_architecture_artifact_id: z.uuid().nullable(),
    active_work_plan_artifact_id: z.uuid().nullable(),
    active_execution_handoff_artifact_id: z.uuid().nullable(),
    architecture_viewport: architectureViewportSchema,
    created_at: z.string().min(1),
    updated_at: z.string().min(1),
  })
  .strict()

export type PlanningState = z.infer<typeof planningStateSchema>

export type PlanningStateServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

function parsePlanningState(input: unknown): PlanningStateServiceResult<PlanningState> {
  const parsed = planningStateSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid planning state: ${parsed.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }

  return { success: true, data: parsed.data }
}

export async function getPlanningState(
  projectId: string,
): Promise<PlanningStateServiceResult<PlanningState | null>> {
  if (!projectIdSchema.safeParse(projectId).success) {
    return { success: false, error: 'Invalid project ID' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('planning_states')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    return { success: false, error: error.message }
  }
  if (data === null) {
    return { success: true, data: null }
  }

  return parsePlanningState(data)
}

export async function getOrInitializePlanningState(
  projectId: string,
): Promise<PlanningStateServiceResult<PlanningState>> {
  if (!projectIdSchema.safeParse(projectId).success) {
    return { success: false, error: 'Invalid project ID' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('initialize_architecture_planning_state', {
    p_project_id: projectId,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return parsePlanningState(data)
}

export async function setPlanningAutoDecide(input: {
  projectId: string
  enabled: boolean
  expectedRevision: number
}): Promise<PlanningStateServiceResult<PlanningState>> {
  if (!projectIdSchema.safeParse(input.projectId).success) {
    return { success: false, error: 'Invalid project ID' }
  }
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
    return { success: false, error: 'Invalid planning revision' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_planning_auto_decide', {
    p_project_id: input.projectId,
    p_enabled: input.enabled,
    p_expected_revision: input.expectedRevision,
  })

  if (error) return { success: false, error: error.message }
  return parsePlanningState(data)
}
