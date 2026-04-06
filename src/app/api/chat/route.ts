import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import type Anthropic from '@anthropic-ai/sdk'

import { buildSystemPrompt } from '@/lib/services/prompt-builder'
import { callLLM } from '@/lib/services/llm-client'
import { parseLLMResponse } from '@/lib/services/llm-response-parser'
import { executeOperations } from '@/lib/services/graph-operation-executor'
import { addChatMessage } from '@/lib/services/chat-message-service'
import type { PromptMode } from '@/lib/services/prompt-builder'

const chatRequestSchema = z.object({
  projectId: z.string().min(1),
  message: z.string().trim().min(1),
  mode: z.enum(['discovery', 'module_map', 'module_detail']),
  context: z.object({
    projectId: z.string(),
    projectName: z.string(),
    activeModuleId: z.string().nullable(),
    mode: z.enum(['discovery', 'module_map', 'module_detail']),
    modules: z.array(z.object({ id: z.string(), name: z.string() })),
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

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
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
    const systemPrompt = buildSystemPrompt(mode as PromptMode, {
      projectName: context.projectName,
    })

    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user' as const, content: message },
    ]

    llmStream = await callLLM(systemPrompt, messages)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }

  let fullText = ''
  const encoder = new TextEncoder()

  const transform = new TransformStream<string, Uint8Array>({
    transform(chunk, controller) {
      fullText += chunk
      controller.enqueue(encoder.encode(chunk))
    },
    async flush() {
      const { message: parsedMessage, operations } = parseLLMResponse(fullText)

      if (operations.length > 0) {
        await executeOperations(operations)
      }

      await addChatMessage({
        project_id: projectId,
        role: 'user',
        content: message,
      })

      await addChatMessage({
        project_id: projectId,
        role: 'assistant',
        content: parsedMessage,
      })
    },
  })

  llmStream.pipeThrough(transform)

  return new Response(transform.readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}
