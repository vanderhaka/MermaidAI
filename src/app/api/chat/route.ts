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
import { CHAT_MODES } from '@/types/chat'

const resolvingOpenQuestionSchema = z.object({
  id: z.string().min(1),
  section: z.string().min(1),
  question: z.string().min(1),
})

const chatRequestSchema = z.object({
  projectId: z.string().min(1),
  message: z.string().trim().min(1),
  mode: z.enum(CHAT_MODES),
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

function makeTextStream(text: string): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(text)
      controller.close()
    },
  })
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

  const { projectId, message, mode, context, history } = parsed.data

  let llmStream: ReadableStream<string>
  try {
    const promptContext = await loadChatPromptContext({
      projectId,
      projectName: context.projectName,
      mode: mode as PromptMode,
      activeModuleId: context.activeModuleId,
      resolvingOpenQuestion: context.resolvingOpenQuestion,
    })

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

      const messages: Anthropic.MessageParam[] = [
        ...history.map((h) => ({
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

      llmStream = await callLLMWithTools(systemPrompt, messages, tools, executeTool)
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
        // Flush any buffered text from the parser
        const { text: remaining } = parser.flush()
        fullText += remaining

        controller.close()
      } catch (err) {
        controller.error(err)
        return
      }

      // Persist messages after stream completes
      try {
        await addChatMessage({
          project_id: projectId,
          role: 'user',
          content: message,
        })

        if (fullText.trim()) {
          await addChatMessage({
            project_id: projectId,
            role: 'assistant',
            content: fullText.trim(),
          })
        }
      } catch (persistErr) {
        console.error('Failed to persist chat messages', {
          projectId,
          error: persistErr instanceof Error ? persistErr.message : String(persistErr),
        })
      }
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
