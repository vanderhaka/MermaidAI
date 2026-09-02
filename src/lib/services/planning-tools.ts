import { z } from 'zod'

import {
  planningAssumptionSchema,
  planningBlockerSchema,
  workPlanContentSchema,
  workPlanSliceSchema,
} from '@/lib/schemas/planning'
import type { WorkPlanContent, WorkPlanPhase, WorkPlanSlice } from '@/types/planning'

const identifierSchema = z.string().trim().min(1).max(120)
const textSchema = z.string().trim().min(1).max(4_000)

const updateSummaryCommandSchema = z
  .object({
    type: z.literal('update_summary'),
    objective: textSchema.optional(),
    non_goals: z.array(textSchema).max(100).optional(),
  })
  .strict()
  .refine((command) => command.objective !== undefined || command.non_goals !== undefined, {
    message: 'update_summary must change the objective or non-goals.',
  })

const addPhaseCommandSchema = z
  .object({
    type: z.literal('add_phase'),
    phase: z.object({ id: identifierSchema, title: textSchema, objective: textSchema }).strict(),
    after_phase_id: identifierSchema.nullable(),
  })
  .strict()

const updatePhaseCommandSchema = z
  .object({
    type: z.literal('update_phase'),
    phase_id: identifierSchema,
    title: textSchema.optional(),
    objective: textSchema.optional(),
  })
  .strict()
  .refine((command) => command.title !== undefined || command.objective !== undefined, {
    message: 'update_phase must change the title or objective.',
  })

const removePhaseCommandSchema = z
  .object({ type: z.literal('remove_phase'), phase_id: identifierSchema })
  .strict()

const addSliceCommandSchema = z
  .object({
    type: z.literal('add_slice'),
    phase_id: identifierSchema,
    after_slice_id: identifierSchema.nullable(),
    slice: workPlanSliceSchema,
  })
  .strict()

const updateSliceCommandSchema = z
  .object({
    type: z.literal('update_slice'),
    slice_id: identifierSchema,
    slice: workPlanSliceSchema,
  })
  .strict()

const removeSliceCommandSchema = z
  .object({ type: z.literal('remove_slice'), slice_id: identifierSchema })
  .strict()

const moveSliceCommandSchema = z
  .object({
    type: z.literal('move_slice'),
    slice_id: identifierSchema,
    phase_id: identifierSchema,
    after_slice_id: identifierSchema.nullable(),
  })
  .strict()

const replacePlanningNotesCommandSchema = z
  .object({
    type: z.literal('replace_planning_notes'),
    assumptions: z.array(planningAssumptionSchema).max(100),
    unresolved_blockers: z.array(planningBlockerSchema).max(100),
  })
  .strict()

export const workPlanEditCommandSchema = z.discriminatedUnion('type', [
  updateSummaryCommandSchema,
  addPhaseCommandSchema,
  updatePhaseCommandSchema,
  removePhaseCommandSchema,
  addSliceCommandSchema,
  updateSliceCommandSchema,
  removeSliceCommandSchema,
  moveSliceCommandSchema,
  replacePlanningNotesCommandSchema,
])

export const workPlanEditBatchSchema = z
  .object({
    summary: z.string().trim().min(1).max(500),
    commands: z.array(workPlanEditCommandSchema).min(1).max(32),
  })
  .strict()

export type WorkPlanEditBatch = z.infer<typeof workPlanEditBatchSchema>

export type ApplyWorkPlanEditsResult =
  | { success: true; data: WorkPlanContent }
  | { success: false; error: string }

function insertAfter<T extends { id: string }>(
  items: T[],
  item: T,
  afterId: string | null,
  label: string,
): T[] {
  if (afterId === null) return [item, ...items]
  const index = items.findIndex((candidate) => candidate.id === afterId)
  if (index === -1) throw new Error(`${label} ${afterId} was not found.`)
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)]
}

function insertSliceId(sliceIds: string[], sliceId: string, afterSliceId: string | null): string[] {
  if (afterSliceId === null) return [sliceId, ...sliceIds]
  const index = sliceIds.indexOf(afterSliceId)
  if (index === -1) throw new Error(`Slice ${afterSliceId} is not in the target phase.`)
  return [...sliceIds.slice(0, index + 1), sliceId, ...sliceIds.slice(index + 1)]
}

export function applyWorkPlanEdits(
  current: WorkPlanContent,
  batch: WorkPlanEditBatch,
): ApplyWorkPlanEditsResult {
  let next: WorkPlanContent = structuredClone(current)

  try {
    for (const command of batch.commands) {
      switch (command.type) {
        case 'update_summary':
          next = {
            ...next,
            objective: command.objective ?? next.objective,
            non_goals: command.non_goals ?? next.non_goals,
          }
          break

        case 'add_phase': {
          if (next.phases.some((phase) => phase.id === command.phase.id)) {
            throw new Error(`Phase ${command.phase.id} already exists.`)
          }
          const phase: WorkPlanPhase = { ...command.phase, slice_ids: [] }
          next = {
            ...next,
            phases: insertAfter(next.phases, phase, command.after_phase_id, 'Phase'),
          }
          break
        }

        case 'update_phase': {
          if (!next.phases.some((phase) => phase.id === command.phase_id)) {
            throw new Error(`Phase ${command.phase_id} was not found.`)
          }
          next = {
            ...next,
            phases: next.phases.map((phase) =>
              phase.id === command.phase_id
                ? {
                    ...phase,
                    title: command.title ?? phase.title,
                    objective: command.objective ?? phase.objective,
                  }
                : phase,
            ),
          }
          break
        }

        case 'remove_phase': {
          const phase = next.phases.find((candidate) => candidate.id === command.phase_id)
          if (!phase) throw new Error(`Phase ${command.phase_id} was not found.`)
          if (phase.slice_ids.length > 0) {
            throw new Error(`Phase ${command.phase_id} must be empty before it can be removed.`)
          }
          next = { ...next, phases: next.phases.filter((item) => item.id !== command.phase_id) }
          break
        }

        case 'add_slice': {
          if (next.slices.some((slice) => slice.id === command.slice.id)) {
            throw new Error(`Slice ${command.slice.id} already exists.`)
          }
          if (!next.phases.some((phase) => phase.id === command.phase_id)) {
            throw new Error(`Phase ${command.phase_id} was not found.`)
          }
          next = {
            ...next,
            slices: [...next.slices, command.slice],
            phases: next.phases.map((phase) =>
              phase.id === command.phase_id
                ? {
                    ...phase,
                    slice_ids: insertSliceId(
                      phase.slice_ids,
                      command.slice.id,
                      command.after_slice_id,
                    ),
                  }
                : phase,
            ),
          }
          break
        }

        case 'update_slice': {
          if (command.slice.id !== command.slice_id) {
            throw new Error('An updated slice cannot change its ID.')
          }
          if (!next.slices.some((slice) => slice.id === command.slice_id)) {
            throw new Error(`Slice ${command.slice_id} was not found.`)
          }
          next = {
            ...next,
            slices: next.slices.map((slice) =>
              slice.id === command.slice_id ? command.slice : slice,
            ),
          }
          break
        }

        case 'remove_slice': {
          if (!next.slices.some((slice) => slice.id === command.slice_id)) {
            throw new Error(`Slice ${command.slice_id} was not found.`)
          }
          const dependent = next.slices.find((slice) =>
            slice.dependencies.includes(command.slice_id),
          )
          if (dependent) {
            throw new Error(
              `Slice ${command.slice_id} is still required by ${dependent.id}. Update dependencies first.`,
            )
          }
          next = {
            ...next,
            slices: next.slices.filter((slice) => slice.id !== command.slice_id),
            phases: next.phases.map((phase) => ({
              ...phase,
              slice_ids: phase.slice_ids.filter((sliceId) => sliceId !== command.slice_id),
            })),
          }
          break
        }

        case 'move_slice': {
          const sourceSlice = next.slices.find((slice) => slice.id === command.slice_id)
          if (!sourceSlice) throw new Error(`Slice ${command.slice_id} was not found.`)
          if (!next.phases.some((phase) => phase.id === command.phase_id)) {
            throw new Error(`Phase ${command.phase_id} was not found.`)
          }
          const phasesWithoutSlice = next.phases.map((phase) => ({
            ...phase,
            slice_ids: phase.slice_ids.filter((sliceId) => sliceId !== command.slice_id),
          }))
          next = {
            ...next,
            phases: phasesWithoutSlice.map((phase) =>
              phase.id === command.phase_id
                ? {
                    ...phase,
                    slice_ids: insertSliceId(
                      phase.slice_ids,
                      command.slice_id,
                      command.after_slice_id,
                    ),
                  }
                : phase,
            ),
          }
          break
        }

        case 'replace_planning_notes':
          next = {
            ...next,
            assumptions: command.assumptions,
            unresolved_blockers: command.unresolved_blockers,
          }
          break
      }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Invalid plan edit.' }
  }

  const parsed = workPlanContentSchema.safeParse(next)
  if (!parsed.success) {
    return {
      success: false,
      error: `The edited Work Plan is invalid: ${parsed.error.issues[0]?.message ?? 'unknown shape'}`,
    }
  }
  return { success: true, data: parsed.data }
}
