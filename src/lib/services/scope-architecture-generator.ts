import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import {
  captureArchitectureMapInputSchema,
  type CaptureArchitectureMapInput,
} from '@/lib/services/architecture-service'
import { callLLMWithTools, resolveAIProvider, sanitizeError } from '@/lib/services/llm-client'

const boundedText = z.string().max(16_000)

export const scopeHandoffSnapshotSchema = z
  .object({
    project: z
      .object({
        name: z.string().trim().min(1).max(200),
        description: z.string().nullable(),
      })
      .strict(),
    modules: z.array(
      z
        .object({
          id: z.uuid(),
          name: z.string(),
          description: z.string().nullable(),
          domain: z.string().nullable(),
          prdContent: z.string(),
          entryPoints: z.array(z.string()),
          exitPoints: z.array(z.string()),
        })
        .strict(),
    ),
    nodes: z.array(
      z
        .object({
          id: z.uuid(),
          moduleId: z.uuid(),
          nodeType: z.string(),
          label: z.string(),
          pseudocode: z.string(),
        })
        .strict(),
    ),
    edges: z.array(
      z
        .object({
          id: z.uuid(),
          moduleId: z.uuid(),
          sourceNodeId: z.uuid(),
          targetNodeId: z.uuid(),
          label: z.string().nullable(),
          condition: z.string().nullable(),
        })
        .strict(),
    ),
    connections: z.array(
      z
        .object({
          id: z.uuid(),
          sourceModuleId: z.uuid(),
          targetModuleId: z.uuid(),
          sourceExitPoint: z.string(),
          targetEntryPoint: z.string(),
        })
        .strict(),
    ),
    openQuestions: z.array(
      z
        .object({
          id: z.uuid(),
          section: z.string(),
          question: z.string(),
          status: z.enum(['open', 'resolved']),
          resolution: z.string().nullable(),
        })
        .strict(),
    ),
    messages: z.array(
      z
        .object({
          role: z.enum(['user', 'assistant', 'system']),
          content: boundedText,
        })
        .strict(),
    ),
  })
  .strict()

export type ScopeHandoffSnapshot = z.infer<typeof scopeHandoffSnapshotSchema>

export type ScopeArchitectureGenerationResult =
  | { success: true; data: CaptureArchitectureMapInput }
  | { success: false; error: string; code: 'invalid_output' | 'generation_failed' }

const submitArchitectureTool: Anthropic.Tool = {
  name: 'submit_architecture_capture',
  description:
    'Submit the complete high-level Architecture derived from the frozen Quick Capture snapshot.',
  input_schema: z.toJSONSchema(captureArchitectureMapInputSchema) as Anthropic.Tool.InputSchema,
}

async function drain(stream: ReadableStream<string>): Promise<void> {
  const reader = stream.getReader()
  try {
    while (!(await reader.read()).done) {
      // The structured tool result is accepted while the provider stream is consumed.
    }
  } finally {
    reader.releaseLock()
  }
}

export async function generateArchitectureFromScope(input: {
  projectId: string
  snapshot: unknown
  signal?: AbortSignal
}): Promise<ScopeArchitectureGenerationResult> {
  const snapshot = scopeHandoffSnapshotSchema.safeParse(input.snapshot)
  if (!snapshot.success) {
    return {
      success: false,
      error: `Invalid Quick Capture snapshot: ${snapshot.error.issues[0]?.message ?? 'unknown shape'}`,
      code: 'invalid_output',
    }
  }

  let capture: CaptureArchitectureMapInput | null = null
  let validationError = 'The model did not submit an Architecture.'
  const prompt = `You are converting a frozen Quick Capture into the first high-level Architecture for ${snapshot.data.project.name}.

Build the architecture immediately from facts already captured. Do not interview the user and do not repeat a question already answered in the snapshot.

Architecture is intentionally high level:
- identify actors, outcomes, ownership capabilities, boundaries, handoffs, and important end-to-end flows;
- do not turn every flowchart step into a capability;
- do not invent file names, frameworks, database tables, tickets, or implementation tasks;
- preserve every captured decision and resolved answer;
- carry only genuinely material unanswered points as questions, classifying lower-level detail as deferred;
- keep uncertainty in assumptions, questions, and blockers only; write the objective, outcomes, capability purposes, responsibilities, boundaries, connections, and important flows as a coherent current view without open-question, unanswered-scope, unresolved-decision, to-be-confirmed, or TBD placeholders;
- keep the result connected unless an isolated capability has an explicit business reason.

The existing Quick Capture module is an intake canvas, not necessarily a final Architecture capability. Infer the smallest clear set of business capabilities from its nodes, edges, questions, and conversation.

Frozen Quick Capture snapshot:
${JSON.stringify(snapshot.data, null, 2)}

Call submit_architecture_capture exactly once with the complete result.`

  try {
    const stream = await callLLMWithTools(
      prompt,
      [
        {
          role: 'user',
          content:
            'Create the high-level Architecture now and submit it in one structured tool call.',
        },
      ],
      [submitArchitectureTool],
      async (name, toolInput) => {
        if (name !== 'submit_architecture_capture') {
          return { content: 'Only submit_architecture_capture is available.', isError: true }
        }
        if (capture) {
          return { content: 'The Architecture was already accepted.', isError: true }
        }
        const parsed = captureArchitectureMapInputSchema.safeParse(toolInput)
        if (!parsed.success) {
          validationError = `Invalid Architecture: ${parsed.error.issues[0]?.message ?? 'unknown shape'}`
          return { content: validationError, isError: true }
        }
        capture = parsed.data
        return {
          content: `Accepted ${parsed.data.modules.length} connected capabilities.`,
          isError: false,
          terminalText: `Architecture ready · ${parsed.data.modules.length} capabilities`,
        }
      },
      {
        provider: resolveAIProvider(),
        reasoningEffort: 'low',
        continuationReasoningEffort: 'low',
        sessionKey: input.projectId,
        signal: input.signal,
      },
    )
    await drain(stream)
  } catch (error) {
    return { success: false, error: sanitizeError(error), code: 'generation_failed' }
  }

  return capture
    ? { success: true, data: capture }
    : { success: false, error: validationError, code: 'invalid_output' }
}
