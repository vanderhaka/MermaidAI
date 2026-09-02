import type Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getUserWithDevAuth } from '@/lib/auth/dev-auth'
import { createClient } from '@/lib/supabase/server'
import { chatRateLimiter } from '@/lib/rate-limiter'
import { buildSystemPrompt } from '@/lib/services/prompt-builder'
import type { PromptMode } from '@/lib/services/prompt-builder'
import { callLLMWithTools, sanitizeError } from '@/lib/services/llm-client'
import { createStreamParser } from '@/lib/stream-parser'
import { getToolsForMode, createToolExecutor } from '@/lib/services/llm-tools'
import { TOOL_EVENT_DELIMITER } from '@/lib/services/llm-shared'
import { addChatMessage } from '@/lib/services/chat-message-service'
import {
  finalizeChatChangeSet,
  getCommittedChatChangeSetForRetry,
  type CommittedChatChangeSet,
} from '@/lib/services/change-set-service'
import { loadChatPromptContext } from '@/lib/services/chat-context-loader'
import { getActivePlanningArtifactVersion } from '@/lib/services/planning-artifact-service'
import { getPlanningState, type PlanningState } from '@/lib/services/planning-state-service'
import {
  buildSelectedOpenQuestionHelpResponse,
  isClickOnlySelectedQuestionPrompt,
} from '@/lib/services/selected-open-question'
import { readChatToolReceipt } from '@/lib/chat-turn'
import {
  mergeArchitectureChangeSummaries,
  readArchitectureChangeSummary,
} from '@/lib/planning/architecture-change-summary'
import {
  AI_PROVIDERS,
  CHAT_MODES,
  CHAT_TOOL_RECEIPT_KEY,
  CHAT_TURN_OPERATION_LIMIT,
  type AIProvider,
  type ArchitectureChangeSummary,
  type ChatToolReceipt,
  type ChatTurnIdentity,
  type CreateChatMessageInput,
} from '@/types/chat'
import { PLANNING_ARTIFACT_KINDS, type PlanningArtifactKind } from '@/types/planning'

/**
 * The app runs on the user's Codex (ChatGPT) membership unless a request or
 * AI_PROVIDER says otherwise.
 */
function defaultProvider(): AIProvider {
  const configured = process.env.AI_PROVIDER?.trim()
  return AI_PROVIDERS.find((provider) => provider === configured) ?? 'codex'
}

const resolvingOpenQuestionSchema = z.object({
  id: z.string().min(1),
  section: z.string().min(1),
  question: z.string().min(1),
})

const uuidSchema = z.uuid()

const chatTurnIdentitySchema = z
  .object({
    turnId: uuidSchema,
    userMessageKey: uuidSchema,
    assistantMessageKey: uuidSchema,
    changeSetId: uuidSchema,
    expectedRevision: z.number().int().nonnegative(),
    operationIds: z.array(uuidSchema).min(1).max(CHAT_TURN_OPERATION_LIMIT),
    planningStage: z.enum(PLANNING_ARTIFACT_KINDS).nullable(),
    artifactId: uuidSchema.nullable(),
    artifactVersionId: uuidSchema.nullable(),
  })
  .strict()
  .superRefine((turn, ctx) => {
    if (new Set(turn.operationIds).size !== turn.operationIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['operationIds'],
        message: 'Operation IDs must be unique within a chat turn.',
      })
    }

    const planningValues = [turn.planningStage, turn.artifactId, turn.artifactVersionId]
    const hasPlanningValue = planningValues.some((value) => value !== null)
    const hasEveryPlanningValue = planningValues.every((value) => value !== null)
    if (hasPlanningValue !== hasEveryPlanningValue) {
      ctx.addIssue({
        code: 'custom',
        path: ['planningStage'],
        message: 'Planning stage, artifact, and artifact version must be supplied together.',
      })
    }
    if (!hasPlanningValue && turn.expectedRevision !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['expectedRevision'],
        message: 'A non-planning turn must use revision zero.',
      })
    }
  })

const chatRequestSchema = z
  .object({
    projectId: z.string().min(1),
    message: z.string().trim().min(1),
    mode: z.enum(CHAT_MODES),
    helperMode: z.boolean().optional().default(false),
    provider: z.enum(AI_PROVIDERS).optional(),
    context: z.object({
      projectId: z.string(),
      projectName: z.string(),
      activeModuleId: z.string().nullable(),
      mode: z.enum(CHAT_MODES),
      modules: z.array(z.object({ id: z.string(), name: z.string() })),
      resolvingOpenQuestion: resolvingOpenQuestionSchema.optional(),
    }),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        }),
      )
      .optional()
      .default([]),
    turn: chatTurnIdentitySchema.optional(),
  })
  .superRefine((request, ctx) => {
    if (request.projectId !== request.context.projectId) {
      ctx.addIssue({
        code: 'custom',
        path: ['context', 'projectId'],
        message: 'Context project must match the request project.',
      })
    }
    if (request.mode !== request.context.mode) {
      ctx.addIssue({
        code: 'custom',
        path: ['context', 'mode'],
        message: 'Context mode must match the request mode.',
      })
    }
  })

// The canvas and open questions carry the durable project state, so old chat
// turns only add tokens, not truth — cap history sent to the LLM to the most
// recent turns.
const MAX_HISTORY_MESSAGES = 30

function makeTextStream(text: string): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(text)
      controller.close()
    },
  })
}

/** A failed insert is logged, never surfaced — persistence must not break the stream. */
async function persistChatMessage(input: CreateChatMessageInput): Promise<boolean> {
  try {
    const result = await addChatMessage(input)
    if (result.success) return true

    console.error('Failed to persist chat message', {
      projectId: input.project_id,
      role: input.role,
      error: result.error,
    })
    return false
  } catch (persistErr) {
    console.error('Failed to persist chat message', {
      projectId: input.project_id,
      role: input.role,
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    })
    return false
  }
}

function receiptBelongsToTurn(receipt: ChatToolReceipt, turn: ChatTurnIdentity): boolean {
  return (
    receipt.turnId === turn.turnId &&
    receipt.changeSetId === turn.changeSetId &&
    receipt.expectedRevision === turn.expectedRevision &&
    turn.operationIds[receipt.sequence] === receipt.operationId
  )
}

function activeArtifactIdForStage(
  state: PlanningState,
  stage: PlanningArtifactKind,
): string | null {
  switch (stage) {
    case 'architecture':
      return state.active_architecture_artifact_id
    case 'work_plan':
      return state.active_work_plan_artifact_id
    case 'execution_handoff':
      return state.active_execution_handoff_artifact_id
  }
}

type PlanningTurnValidation =
  | { status: 'current' }
  | { status: 'recovered'; changeSet: CommittedChatChangeSet }
  | { status: 'stale' }

async function validatePlanningTurn(
  projectId: string,
  turn: ChatTurnIdentity | undefined,
): Promise<PlanningTurnValidation> {
  if (!turn?.planningStage || !turn.artifactId || !turn.artifactVersionId) {
    return { status: 'current' }
  }

  const [stateResult, versionResult] = await Promise.all([
    getPlanningState(projectId),
    getActivePlanningArtifactVersion(projectId, turn.planningStage),
  ])
  const isCurrent =
    stateResult.success &&
    stateResult.data !== null &&
    versionResult.success &&
    versionResult.data !== null &&
    stateResult.data.write_safety_revision === turn.expectedRevision &&
    activeArtifactIdForStage(stateResult.data, turn.planningStage) === turn.artifactId &&
    versionResult.data.id === turn.artifactVersionId &&
    versionResult.data.artifact_id === turn.artifactId

  if (isCurrent) return { status: 'current' }

  const committedResult = await getCommittedChatChangeSetForRetry({
    projectId,
    turnId: turn.turnId,
    changeSetId: turn.changeSetId,
    expectedRevision: turn.expectedRevision,
  })
  if (
    committedResult.success &&
    committedResult.data &&
    stateResult.success &&
    stateResult.data &&
    versionResult.success &&
    versionResult.data &&
    stateResult.data.write_safety_revision === committedResult.data.committedRevision &&
    activeArtifactIdForStage(stateResult.data, turn.planningStage) === turn.artifactId &&
    versionResult.data.id === (committedResult.data.artifactVersionId ?? turn.artifactVersionId) &&
    versionResult.data.artifact_id === turn.artifactId
  ) {
    return { status: 'recovered', changeSet: committedResult.data }
  }

  return { status: 'stale' }
}

async function setCommittedTurnState(
  projectId: string,
  turn: ChatTurnIdentity,
  state: 'completed' | 'partial',
): Promise<boolean> {
  try {
    const result = await finalizeChatChangeSet({
      projectId,
      turnId: turn.turnId,
      changeSetId: turn.changeSetId,
      state,
    })
    if (result.success) return true
    console.error('Failed to finalize chat change set', {
      projectId,
      turnId: turn.turnId,
      changeSetId: turn.changeSetId,
      state,
      error: result.error,
    })
    return false
  } catch (finalizeError) {
    console.error('Failed to finalize chat change set', {
      projectId,
      turnId: turn.turnId,
      changeSetId: turn.changeSetId,
      state,
      error: finalizeError instanceof Error ? finalizeError.message : String(finalizeError),
    })
    return false
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await getUserWithDevAuth(supabase)

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimit = chatRateLimiter.check(user.id)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      },
    )
  }

  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(', ') },
      { status: 400 },
    )
  }

  const { projectId, message, mode, helperMode, context, history, turn } = parsed.data
  const provider = parsed.data.provider ?? defaultProvider()

  const planningTurn = await validatePlanningTurn(projectId, turn)
  if (planningTurn.status === 'stale') {
    return NextResponse.json(
      { error: 'Planning state changed. Refresh and retry.' },
      { status: 409 },
    )
  }

  let llmStream: ReadableStream<string>
  let replayingCompletedAssistant = false
  try {
    if (planningTurn.status === 'recovered' && turn) {
      const receipt: ChatToolReceipt = {
        turnId: turn.turnId,
        changeSetId: turn.changeSetId,
        operationId: turn.operationIds[0],
        sequence: 0,
        status: 'committed',
        expectedRevision: turn.expectedRevision,
        committedRevision: planningTurn.changeSet.committedRevision,
        artifactVersionId: planningTurn.changeSet.artifactVersionId ?? turn.artifactVersionId,
      }
      const changeSummary = planningTurn.changeSet.changeSummary
      const completedAssistant = planningTurn.changeSet.completedAssistant
      replayingCompletedAssistant = completedAssistant !== null
      llmStream = makeTextStream(
        `${TOOL_EVENT_DELIMITER}${JSON.stringify({
          tool: 'recover_committed_change_set',
          data: {
            [CHAT_TOOL_RECEIPT_KEY]: receipt,
            ...(changeSummary ? { metadata: { change_summary: changeSummary } } : {}),
          },
        })}\n${completedAssistant?.content ?? 'Recovered the committed Architecture change from the previous attempt.'}`,
      )
    } else {
      const promptContext = await loadChatPromptContext({
        projectId,
        projectName: context.projectName,
        mode: mode as PromptMode,
        activeModuleId: context.activeModuleId,
        resolvingOpenQuestion: context.resolvingOpenQuestion,
      })
      promptContext.stagedArchitecture = turn?.planningStage === 'architecture'
      // A per-request preference, not persisted project state — the loader stays
      // concerned with what the database knows.
      if (!turn?.planningStage) promptContext.helperMode = helperMode

      const selectedOpenQuestion =
        context.resolvingOpenQuestion &&
        promptContext.openQuestions?.find(
          (question) =>
            question.id === context.resolvingOpenQuestion?.id && question.status === 'open',
        )

      if (
        context.resolvingOpenQuestion &&
        selectedOpenQuestion &&
        isClickOnlySelectedQuestionPrompt(message, context.resolvingOpenQuestion)
      ) {
        llmStream = makeTextStream(
          buildSelectedOpenQuestionHelpResponse(context.resolvingOpenQuestion),
        )
      } else {
        const systemPrompt = buildSystemPrompt(mode as PromptMode, promptContext)

        const recentHistory = history.slice(-MAX_HISTORY_MESSAGES)
        const messages: Anthropic.MessageParam[] = [
          ...recentHistory.map((h) => ({
            role: h.role as 'user' | 'assistant',
            content: h.content,
          })),
          { role: 'user' as const, content: message },
        ]
        const tools =
          turn?.planningStage === 'architecture'
            ? getToolsForMode(mode as PromptMode, { stagedArchitecture: true })
            : getToolsForMode(mode as PromptMode)
        const toolExecutorOptions = {
          mode: mode as PromptMode,
          ...(context.resolvingOpenQuestion
            ? {
                latestUserMessage: message,
                resolvingOpenQuestion: context.resolvingOpenQuestion,
              }
            : {}),
          ...(turn ? { turnIdentity: turn } : {}),
          ...(turn ? { authenticatedUserId: user.id } : {}),
        }
        const executeTool =
          context.resolvingOpenQuestion || turn
            ? createToolExecutor(projectId, toolExecutorOptions)
            : createToolExecutor(projectId)
        const isEmptyArchitectureStart =
          mode === 'module_map' && (promptContext.modules?.length ?? 0) === 0

        llmStream = await callLLMWithTools(systemPrompt, messages, tools, executeTool, {
          provider,
          sessionKey: projectId,
          ...(mode === 'scope_build' || isEmptyArchitectureStart
            ? {
                reasoningEffort: 'low' as const,
                continuationReasoningEffort: 'low' as const,
              }
            : {}),
          // Fires when the client hits Stop or disconnects. Without it the tool
          // loop keeps running rounds — and writing to the database — for a
          // turn nobody is listening to.
          signal: request.signal,
        })
      }
    }
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }

  let fullText = ''
  const parser = createStreamParser()
  const receiptBySequence = new Map<number, ChatToolReceipt>()
  let architectureChangeSummary: ArchitectureChangeSummary | null = null
  let clientCancelled = false

  function collectToolReceipts(events: ReturnType<typeof parser.push>['events']): void {
    if (!turn) return
    for (const event of events) {
      if (!event.data) continue
      const receipt = readChatToolReceipt(event.data)
      if (receipt && receiptBelongsToTurn(receipt, turn)) {
        receiptBySequence.set(receipt.sequence, receipt)
        if (receipt.status === 'committed') {
          architectureChangeSummary = mergeArchitectureChangeSummaries(
            architectureChangeSummary,
            readArchitectureChangeSummary(event.data),
          )
        }
      }
    }
  }

  async function persistTurn(streamCompleted: boolean): Promise<void> {
    if (replayingCompletedAssistant) return

    const trimmedText = fullText.trim()
    const receipts = [...receiptBySequence.values()].sort(
      (left, right) => left.sequence - right.sequence,
    )
    const committedReceipt = [...receipts]
      .reverse()
      .find((receipt) => receipt.status === 'committed')
    const durableLink = turn
      ? {
          turn_id: turn.turnId,
          planning_stage: turn.planningStage,
          artifact_id: turn.artifactId,
          change_set_id: committedReceipt ? turn.changeSetId : null,
        }
      : {}
    const sourceDurableLink = turn
      ? { ...durableLink, artifact_version_id: turn.artifactVersionId }
      : durableLink
    const resultDurableLink = turn
      ? {
          ...durableLink,
          artifact_version_id: committedReceipt?.artifactVersionId ?? turn.artifactVersionId,
        }
      : durableLink

    const userPersisted = await persistChatMessage({
      project_id: projectId,
      role: 'user',
      content: message,
      ...sourceDurableLink,
      ...(turn ? { message_key: turn.userMessageKey } : {}),
    })

    let turnCompleted = streamCompleted && userPersisted && trimmedText.length > 0
    if (turn && committedReceipt) {
      const finalized = await setCommittedTurnState(
        projectId,
        turn,
        turnCompleted ? 'completed' : 'partial',
      )
      if (!finalized) turnCompleted = false
    }

    if (!trimmedText) return

    const assistantPersisted = await persistChatMessage({
      project_id: projectId,
      role: 'assistant',
      content: trimmedText,
      ...resultDurableLink,
      ...(turn
        ? {
            message_key: turn.assistantMessageKey,
            metadata: {
              turn_status: turnCompleted ? 'completed' : 'partial',
              tool_receipts: receipts,
              ...(architectureChangeSummary ? { change_summary: architectureChangeSummary } : {}),
            },
          }
        : {}),
    })

    if (turn && committedReceipt && turnCompleted && !assistantPersisted) {
      await setCommittedTurnState(projectId, turn, 'partial')
    }
  }

  const transformedStream = new ReadableStream({
    async start(controller) {
      const reader = llmStream.getReader()
      const encoder = new TextEncoder()

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          // Pass everything to the client (including tool events)
          controller.enqueue(encoder.encode(value))

          // Accumulate only display text for persistence (strip tool events)
          const { text, events } = parser.push(value)
          fullText += text
          collectToolReceipts(events)
        }
      } catch (err) {
        // Keep the partial turn: whatever the model explained before the failure
        // is still the record of what happened on the canvas.
        const { text, events } = parser.flush()
        fullText += text
        collectToolReceipts(events)
        await persistTurn(false)
        try {
          controller.error(err)
        } catch {
          // The client already cancelled this response.
        }
        return
      }

      // Flush any buffered text from the parser
      const { text, events } = parser.flush()
      fullText += text
      collectToolReceipts(events)

      await persistTurn(!clientCancelled && !request.signal.aborted)

      try {
        controller.close()
      } catch {
        // A stopped turn ends here with the client already gone and this
        // stream cancelled — there is nothing left to close, but the turn
        // still has to be persisted below.
      }
    },
    cancel() {
      clientCancelled = true
    },
  })

  return new Response(transformedStream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
