import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import type { ArchitectureReadinessDecision } from '@/lib/services/architecture-readiness'
import { callLLMWithTools, sanitizeError } from '@/lib/services/llm-client'
import type { CompletePlanningArtifactVersion } from '@/lib/services/planning-artifact-service'
import { buildWorkPlanPrompt } from '@/lib/services/prompt-builder-work-plan'
import { workPlanContentSchema } from '@/lib/schemas/planning'
import type { WorkPlanContent } from '@/types/planning'

type GenerateWorkPlanInput = {
  projectName: string
  architectureVersion: CompletePlanningArtifactVersion<'architecture'>
  decisions: ArchitectureReadinessDecision[]
  signal?: AbortSignal
}

export type WorkPlanGenerationResult =
  | { success: true; data: WorkPlanContent }
  | { success: false; error: string; code: 'invalid_output' | 'generation_failed' }

const workPlanTool: Anthropic.Tool = {
  name: 'submit_work_plan',
  description:
    'Submit the one complete, source-bound Work Plan. The plan is validated atomically; partial plans are rejected.',
  input_schema: z.toJSONSchema(workPlanContentSchema) as Anthropic.Tool.InputSchema,
}

export function validatePlanCoverage(
  plan: WorkPlanContent,
  architectureVersion: CompletePlanningArtifactVersion<'architecture'>,
): string | null {
  if (
    plan.source_architecture_version.id !== architectureVersion.id ||
    plan.source_architecture_version.version !== architectureVersion.version ||
    plan.source_architecture_version.artifact_kind !== 'architecture'
  ) {
    return 'The Work Plan source does not match the frozen Architecture version.'
  }

  const architectureCapabilityIds = new Set(
    architectureVersion.content.capabilities.map((capability) => capability.id),
  )
  const coveredCapabilityIds = new Set(plan.slices.flatMap((slice) => slice.source_capability_ids))
  const unknownCapabilityId = [...coveredCapabilityIds].find(
    (capabilityId) => !architectureCapabilityIds.has(capabilityId),
  )
  if (unknownCapabilityId) {
    return `The Work Plan references an unknown Architecture capability: ${unknownCapabilityId}`
  }
  const missingCapabilityId = [...architectureCapabilityIds].find(
    (capabilityId) => !coveredCapabilityIds.has(capabilityId),
  )
  if (missingCapabilityId) {
    return `The Work Plan does not cover Architecture capability: ${missingCapabilityId}`
  }
  return null
}

async function drain(stream: ReadableStream<string>): Promise<void> {
  const reader = stream.getReader()
  try {
    while (!(await reader.read()).done) {
      // Tool execution happens while the provider stream is consumed.
    }
  } finally {
    reader.releaseLock()
  }
}

export async function generateWorkPlan(
  input: GenerateWorkPlanInput,
): Promise<WorkPlanGenerationResult> {
  let generatedPlan: WorkPlanContent | null = null
  let lastValidationError = 'The model did not submit a Work Plan.'

  try {
    const stream = await callLLMWithTools(
      buildWorkPlanPrompt(input),
      [
        {
          role: 'user',
          content:
            'Create the detailed Work Plan now. Submit the complete structured artifact in one tool call.',
        },
      ],
      [workPlanTool],
      async (name, toolInput) => {
        if (name !== 'submit_work_plan') {
          return { content: 'This stage only accepts submit_work_plan.', isError: true }
        }
        if (generatedPlan) {
          return { content: 'A complete Work Plan has already been accepted.', isError: true }
        }

        const parsed = workPlanContentSchema.safeParse(toolInput)
        if (!parsed.success) {
          lastValidationError = `Invalid Work Plan: ${parsed.error.issues[0]?.message ?? 'unknown shape'}`
          return { content: lastValidationError, isError: true }
        }
        const coverageError = validatePlanCoverage(parsed.data, input.architectureVersion)
        if (coverageError) {
          lastValidationError = coverageError
          return { content: coverageError, isError: true }
        }

        generatedPlan = parsed.data
        return {
          content: `Accepted ${parsed.data.slices.length} source-bound delivery slices.`,
          isError: false,
          terminalText: `Work Plan ready · ${parsed.data.phases.length} phases · ${parsed.data.slices.length} slices`,
        }
      },
      {
        provider: 'codex',
        reasoningEffort: 'low',
        continuationReasoningEffort: 'low',
        sessionKey: input.architectureVersion.project_id,
        signal: input.signal,
      },
    )
    await drain(stream)
  } catch (error) {
    return { success: false, error: sanitizeError(error), code: 'generation_failed' }
  }

  if (!generatedPlan) {
    return { success: false, error: lastValidationError, code: 'invalid_output' }
  }
  return { success: true, data: generatedPlan }
}
