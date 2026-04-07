import type Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { chatRateLimiter } from '@/lib/rate-limiter'
import { buildSystemPrompt } from '@/lib/services/prompt-builder'
import type { PromptContext, PromptMode } from '@/lib/services/prompt-builder'
import { callLLMWithTools, sanitizeError, TOOL_EVENT_DELIMITER } from '@/lib/services/llm-client'
import { getToolsForMode, createToolExecutor } from '@/lib/services/llm-tools'
import { addChatMessage } from '@/lib/services/chat-message-service'
import { listModulesByProject, getModuleById } from '@/lib/services/module-service'
import { listConnectionsByProject } from '@/lib/services/module-connection-service'
import { getGraphForModule } from '@/lib/services/graph-service'
import { loadModuleNotesForChat } from '@/lib/module-notes/load-for-prompt'

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
  } = await supabase.auth.getUser()

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
    // Build full prompt context with live data from the database
    const promptContext: PromptContext = { projectName: context.projectName }

    const [modulesResult, connectionsResult] = await Promise.all([
      listModulesByProject(projectId),
      listConnectionsByProject(projectId),
    ])
    if (modulesResult.success) {
      promptContext.modules = modulesResult.data
    }
    if (connectionsResult.success) {
      promptContext.connections = connectionsResult.data
    }

    if (context.activeModuleId) {
      const moduleResult = await getModuleById(context.activeModuleId)
      if (moduleResult.success) {
        promptContext.currentModule = moduleResult.data
        const loaded = await loadModuleNotesForChat(moduleResult.data.name)
        promptContext.moduleNotes =
          loaded.source === 'none'
            ? { source: 'none', markdown: null }
            : { source: loaded.source, markdown: loaded.markdown }
      }

      const graphResult = await getGraphForModule(context.activeModuleId)
      if (graphResult.success) {
        promptContext.nodes = graphResult.data.nodes
        promptContext.edges = graphResult.data.edges
      }
    }

    const systemPrompt = buildSystemPrompt(mode as PromptMode, promptContext)

    const messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user' as const, content: message },
    ]
    const tools = getToolsForMode(mode as PromptMode)
    const executeTool = createToolExecutor(projectId)

    llmStream = await callLLMWithTools(systemPrompt, messages, tools, executeTool)
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 })
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

          // Pass everything to the client (including tool events)
          controller.enqueue(encoder.encode(value))

          // Only accumulate display text for persistence (strip tool events)
          if (!value.startsWith(TOOL_EVENT_DELIMITER)) {
            fullText += value
          }
        }
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
