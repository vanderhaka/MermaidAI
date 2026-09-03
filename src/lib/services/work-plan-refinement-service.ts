import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import { workPlanEditBatchSchema, applyWorkPlanEdits } from '@/lib/services/planning-tools'
import { buildWorkPlanRefinementPrompt } from '@/lib/services/prompt-builder-work-plan'
import { callLLMWithTools, resolveAIProvider, sanitizeError } from '@/lib/services/llm-client'
import { validatePlanCoverage } from '@/lib/services/work-plan-generator'
import type { ArchitectureReadinessDecision } from '@/lib/services/architecture-readiness'
import type { CompletePlanningArtifactVersion } from '@/lib/services/planning-artifact-service'
import type { WorkPlanContent } from '@/types/planning'

type RefinementMessage = {
  role: 'user' | 'assistant'
  content: string
}

type RefineWorkPlanInput = {
  projectName: string
  architectureVersion: CompletePlanningArtifactVersion<'architecture'>
  workPlanVersion: CompletePlanningArtifactVersion<'work_plan'>
  decisions: ArchitectureReadinessDecision[]
  history: RefinementMessage[]
  message: string
  signal?: AbortSignal
}

export type WorkPlanRefinementResult =
  | {
      success: true
      data: {
        content: WorkPlanContent
        summary: string
        commandCount: number
        commands: z.infer<typeof workPlanEditBatchSchema>['commands']
      }
    }
  | { success: false; error: string; code: 'invalid_output' | 'generation_failed' }

const workPlanEditTool: Anthropic.Tool = {
  name: 'submit_work_plan_edits',
  description:
    'Submit one bounded batch of finite edits to the current Work Plan. Allowed commands are update_summary, add_phase, update_phase, remove_phase, add_slice, update_slice, remove_slice, move_slice, and replace_planning_notes. Phase slice_ids are derived automatically and must never be submitted. The complete result is validated atomically before it can be committed.',
  input_schema: z.toJSONSchema(workPlanEditBatchSchema) as Anthropic.Tool.InputSchema,
}

const MAX_REFINEMENT_ATTEMPTS = 2

async function drain(stream: ReadableStream<string>): Promise<void> {
  const reader = stream.getReader()
  try {
    while (!(await reader.read()).done) {
      // The validated edit batch is captured while the provider stream is consumed.
    }
  } finally {
    reader.releaseLock()
  }
}

export async function refineWorkPlan(
  input: RefineWorkPlanInput,
): Promise<WorkPlanRefinementResult> {
  let accepted: Extract<WorkPlanRefinementResult, { success: true }>['data'] | null = null
  let lastValidationError = 'The model did not submit a Work Plan edit batch.'

  const prompt = buildWorkPlanRefinementPrompt({
    projectName: input.projectName,
    architectureVersion: input.architectureVersion,
    workPlan: input.workPlanVersion.content,
    decisions: input.decisions,
  })
  const baseMessages = [
    ...input.history.slice(-30),
    { role: 'user' as const, content: input.message },
  ] as Anthropic.MessageParam[]

  try {
    for (let attempt = 0; attempt < MAX_REFINEMENT_ATTEMPTS && !accepted; attempt += 1) {
      const messages =
        attempt === 0
          ? baseMessages
          : [
              ...baseMessages,
              {
                role: 'user' as const,
                content: `Your previous edit batch was rejected: ${lastValidationError} Submit one corrected submit_work_plan_edits call using only the declared command fields.`,
              },
            ]
      const stream = await callLLMWithTools(
        prompt,
        messages,
        [workPlanEditTool],
        async (name, toolInput) => {
          if (name !== 'submit_work_plan_edits') {
            return { content: 'This stage only accepts submit_work_plan_edits.', isError: true }
          }
          if (accepted) {
            return { content: 'A Work Plan edit batch has already been accepted.', isError: true }
          }

          const batch = workPlanEditBatchSchema.safeParse(toolInput)
          if (!batch.success) {
            lastValidationError = `Invalid Work Plan edits: ${batch.error.issues[0]?.message ?? 'unknown shape'}`
            return { content: lastValidationError, isError: true }
          }

          const edited = applyWorkPlanEdits(input.workPlanVersion.content, batch.data)
          if (!edited.success) {
            lastValidationError = edited.error
            return { content: edited.error, isError: true }
          }
          const coverageError = validatePlanCoverage(edited.data, input.architectureVersion)
          if (coverageError) {
            lastValidationError = coverageError
            return { content: coverageError, isError: true }
          }

          accepted = {
            content: edited.data,
            summary: batch.data.summary,
            commandCount: batch.data.commands.length,
            commands: batch.data.commands,
          }
          return {
            content: `Accepted ${batch.data.commands.length} validated Work Plan edits.`,
            isError: false,
            terminalText: batch.data.summary,
          }
        },
        {
          provider: resolveAIProvider(),
          requiredToolName: 'submit_work_plan_edits',
          reasoningEffort: 'low',
          continuationReasoningEffort: 'low',
          sessionKey: input.workPlanVersion.project_id,
          signal: input.signal,
        },
      )
      await drain(stream)
    }
  } catch (error) {
    return { success: false, error: sanitizeError(error), code: 'generation_failed' }
  }

  if (!accepted) {
    return { success: false, error: lastValidationError, code: 'invalid_output' }
  }
  return { success: true, data: accepted }
}
