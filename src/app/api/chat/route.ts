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
import { addChatMessage } from '@/lib/services/chat-message-service'
import { loadChatPromptContext } from '@/lib/services/chat-context-loader'
import {
  buildSelectedOpenQuestionHelpResponse,
  isClickOnlySelectedQuestionPrompt,
} from '@/lib/services/selected-open-question'
import { AI_PROVIDERS, CHAT_MODES } from '@/types/chat'
import type { AIProvider } from '@/types/chat'

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

const chatRequestSchema = z.object({
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
async function persistChatMessage(
  projectId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  try {
    await addChatMessage({ project_id: projectId, role, content })
  } catch (persistErr) {
    console.error('Failed to persist chat message', {
      projectId,
      role,
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    })
  }
}

/** Tool-only turns produce no text — those are not worth a row. */
async function persistAssistantText(projectId: string, text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  await persistChatMessage(projectId, 'assistant', trimmed)
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

  const { projectId, message, mode, helperMode, context, history } = parsed.data
  const provider = parsed.data.provider ?? defaultProvider()

  let llmStream: ReadableStream<string>
  try {
    const promptContext = await loadChatPromptContext({
      projectId,
      projectName: context.projectName,
      mode: mode as PromptMode,
      activeModuleId: context.activeModuleId,
      resolvingOpenQuestion: context.resolvingOpenQuestion,
    })
    // A per-request preference, not persisted project state — the loader stays
    // concerned with what the database knows.
    promptContext.helperMode = helperMode

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
      const tools = getToolsForMode(mode as PromptMode)
      const executeTool = context.resolvingOpenQuestion
        ? createToolExecutor(projectId, {
            latestUserMessage: message,
            resolvingOpenQuestion: context.resolvingOpenQuestion,
          })
        : createToolExecutor(projectId)

      llmStream = await callLLMWithTools(systemPrompt, messages, tools, executeTool, {
        provider,
        sessionKey: projectId,
        ...(mode === 'scope_build'
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
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
  }

  let fullText = ''
  const parser = createStreamParser()

  const transformedStream = new ReadableStream({
    async start(controller) {
      const reader = llmStream.getReader()
      const encoder = new TextEncoder()

      // Start the user turn as soon as the stream opens so a mid-stream failure
      // cannot lose it. Not awaited here — the first token should not wait on a
      // database round trip — but awaited before the assistant row so the two
      // land in order.
      const userPersisted = persistChatMessage(projectId, 'user', message)

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          // Pass everything to the client (including tool events)
          controller.enqueue(encoder.encode(value))

          // Accumulate only display text for persistence (strip tool events)
          const { text } = parser.push(value)
          fullText += text
        }
      } catch (err) {
        // Keep the partial turn: whatever the model explained before the failure
        // is still the record of what happened on the canvas.
        fullText += parser.flush().text
        await userPersisted
        await persistAssistantText(projectId, fullText)
        controller.error(err)
        return
      }

      // Flush any buffered text from the parser
      fullText += parser.flush().text

      try {
        controller.close()
      } catch {
        // A stopped turn ends here with the client already gone and this
        // stream cancelled — there is nothing left to close, but the turn
        // still has to be persisted below.
      }

      await userPersisted
      await persistAssistantText(projectId, fullText)
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
