import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
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
        role: z.string(),
        content: z.string(),
      }),
    )
    .optional()
    .default([]),
})

export async function POST(request: Request) {
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

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let llmStream: ReadableStream<string>
  try {
    const systemPrompt = buildSystemPrompt(mode as PromptMode, {
      projectName: context.projectName,
    })

    const messages = [...history, { role: 'user', content: message }]

    llmStream = await callLLM(systemPrompt, messages)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }

  let fullText = ''

  const transformedStream = new ReadableStream({
    async start(controller) {
      const reader = llmStream.getReader()
      const encoder = new TextEncoder()

      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          fullText += value
          controller.enqueue(encoder.encode(value))
        }
        controller.close()
      } catch (err) {
        controller.error(err)
        return
      }

      // Post-stream processing: parse, execute ops, persist messages
      const { message: parsedMessage, operations } = parseLLMResponse(fullText)

      if (operations.length > 0) {
        await executeOperations(operations, { projectId })
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

  return new Response(transformedStream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
