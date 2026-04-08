'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import CanvasContainer from '@/components/canvas/CanvasContainer'
import FloatingChat from '@/components/chat/FloatingChat'
import OpenQuestionsPanel from '@/components/canvas/OpenQuestionsPanel'
import { updateProject } from '@/lib/services/project-service'
import { createStreamParser } from '@/lib/stream-parser'
import { useGraphStore } from '@/store/graph-store'
import type { ChatMessage } from '@/types/chat'
import type {
  FlowEdge,
  FlowNode,
  Module,
  ModuleConnection,
  OpenQuestion,
  Project,
} from '@/types/graph'

const TOOL_LABELS: Record<string, string> = {
  create_node: 'Creating node',
  update_node: 'Updating node',
  delete_node: 'Removing node',
  create_edge: 'Connecting nodes',
  delete_edge: 'Removing connection',
  create_module: 'Creating module',
  update_module: 'Updating module',
  delete_module: 'Removing module',
  connect_modules: 'Connecting modules',
  add_open_questions: 'Flagging questions',
  resolve_open_question: 'Resolving question',
  lookup_docs: 'Looking up docs',
}

function formatToolName(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ')
}

type ScopeWorkspaceProps = {
  project: Pick<Project, 'id' | 'name' | 'description' | 'mode'>
  initialModules: Module[]
  initialNodes: FlowNode[]
  initialEdges: FlowEdge[]
  initialConnections: ModuleConnection[]
  initialMessages: ChatMessage[]
  initialOpenQuestions: OpenQuestion[]
}

export function ScopeWorkspace({
  project,
  initialModules,
  initialNodes,
  initialEdges,
  initialConnections,
  initialMessages,
  initialOpenQuestions,
}: ScopeWorkspaceProps) {
  const router = useRouter()
  const [isPromoting, startPromote] = useTransition()
  const [confirmingPromote, setConfirmingPromote] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  const [currentToolCalls, setCurrentToolCalls] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialMessages.length > 0) return initialMessages
    // Inject a welcome message on fresh scope projects
    return [
      {
        id: 'welcome',
        role: 'assistant' as const,
        content:
          'Welcome to Quick Capture! Describe what your client needs and I\'ll build a flowchart on the canvas in real-time.\n\nAs I work, hold **⌥ Option** to peek at your flowchart behind this chat.\n\nTry something like: *"The client needs a checkout flow with guest checkout and payment options."*',
        operations: [],
        createdAt: new Date().toISOString(),
      },
    ]
  })
  const [assistantOpen, setAssistantOpen] = useState(initialMessages.length === 0)
  const [isPeeking, setIsPeeking] = useState(false)

  const modules = useGraphStore((state) => state.modules)
  const openQuestions = useGraphStore((state) => state.openQuestions)
  const unresolvedCount = useMemo(
    () => openQuestions.filter((q) => q.status === 'open').length,
    [openQuestions],
  )
  const setModules = useGraphStore((state) => state.setModules)
  const setNodes = useGraphStore((state) => state.setNodes)
  const setEdges = useGraphStore((state) => state.setEdges)
  const setConnections = useGraphStore((state) => state.setConnections)
  const setOpenQuestions = useGraphStore((state) => state.setOpenQuestions)
  const setActiveModuleId = useGraphStore((state) => state.setActiveModuleId)

  useEffect(() => {
    setModules(initialModules)
    setNodes(initialNodes)
    setEdges(initialEdges)
    setConnections(initialConnections)
    setOpenQuestions(initialOpenQuestions)
    // Auto-set active module to the scope module
    if (initialModules.length > 0) {
      setActiveModuleId(initialModules[0].id)
    }
  }, [
    initialConnections,
    initialEdges,
    initialModules,
    initialNodes,
    initialOpenQuestions,
    setConnections,
    setEdges,
    setModules,
    setNodes,
    setOpenQuestions,
    setActiveModuleId,
  ])

  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages)
    }
  }, [initialMessages])

  // Hold Option/Alt to temporarily peek at the canvas behind the chat
  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Alt' || !assistantOpen || isPeeking) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      setIsPeeking(true)
    }
    function handleKeyUp(e: globalThis.KeyboardEvent) {
      if (e.key === 'Alt') setIsPeeking(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [assistantOpen, isPeeking])

  function addToolCall(label: string) {
    setToolActivity(label)
    setCurrentToolCalls((prev) => [...prev, label])
  }

  function handleToolEvent(tool: string, data: Record<string, unknown>) {
    switch (tool) {
      case 'create_node': {
        const node = data.node as FlowNode | undefined
        if (node) {
          useGraphStore.getState().addNode(node)
          addToolCall(`Created node`)
        }
        break
      }
      case 'update_node': {
        const node = data.node as FlowNode | undefined
        if (node) {
          useGraphStore.getState().updateNode(node.id, node)
          addToolCall(`Updated node`)
        }
        break
      }
      case 'delete_node': {
        const deletedNodeId = data.deletedNodeId as string | undefined
        if (deletedNodeId) {
          useGraphStore.getState().removeNode(deletedNodeId)
          addToolCall(`Deleted node`)
        }
        break
      }
      case 'create_edge': {
        const edge = data.edge as FlowEdge | undefined
        if (edge) {
          useGraphStore.getState().addEdge(edge)
          addToolCall(`Created edge`)
        }
        break
      }
      case 'delete_edge': {
        const deletedEdgeId = data.deletedEdgeId as string | undefined
        if (deletedEdgeId) {
          useGraphStore.getState().removeEdge(deletedEdgeId)
          addToolCall(`Deleted edge`)
        }
        break
      }
      case 'add_open_questions': {
        const nodes = data.nodes as FlowNode[] | undefined
        const questions = data.questions as OpenQuestion[] | undefined
        const edges = data.edges as FlowEdge[] | undefined
        if (nodes) {
          for (const node of nodes) useGraphStore.getState().addNode(node)
        }
        if (questions) {
          for (const q of questions) useGraphStore.getState().addOpenQuestion(q)
        }
        if (edges) {
          for (const edge of edges) useGraphStore.getState().addEdge(edge)
        }
        const count = questions?.length ?? 0
        addToolCall(count === 1 ? 'Flagged 1 question' : `Flagged ${count} questions`)
        break
      }
      case 'resolve_open_question': {
        const question = data.question as OpenQuestion | undefined
        if (question) {
          useGraphStore.getState().removeNode(question.node_id)
          useGraphStore.getState().resolveOpenQuestion(question.id, question.resolution ?? '')
        }
        addToolCall('Resolved question')
        break
      }
    }
  }

  async function handleSend(message: string) {
    const optimisticUserMessage: ChatMessage = {
      id: `local-user-${crypto.randomUUID()}`,
      role: 'user',
      content: message,
      operations: [],
      createdAt: new Date().toISOString(),
    }

    setMessages((current) => [...current, optimisticUserMessage])
    setIsSending(true)
    setStreamingContent('')
    setToolActivity(null)
    setCurrentToolCalls([])
    setError(null)

    try {
      const activeModuleId = modules[0]?.id ?? null

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          message,
          mode: 'scope_build',
          context: {
            projectId: project.id,
            projectName: project.name,
            activeModuleId,
            mode: 'scope_build',
            modules: modules.map((m) => ({ id: m.id, name: m.name })),
          },
          history: messages
            .filter((entry) => entry.id !== 'welcome')
            .map((entry) => ({
              role: entry.role,
              content: entry.content,
            })),
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to send chat message')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Assistant response stream was unavailable')
      }

      const decoder = new TextDecoder()
      const parser = createStreamParser()
      let assistantText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const { text, events } = parser.push(chunk)

        assistantText += text
        setStreamingContent(assistantText)

        for (const event of events) {
          if (event.status === 'start') {
            setToolActivity(formatToolName(event.tool))
          } else if (event.data) {
            handleToolEvent(event.tool, event.data)
          }
        }
      }

      // Flush remaining
      const { text: remaining } = parser.flush()
      assistantText += remaining
      setStreamingContent(assistantText)

      if (assistantText.trim()) {
        setMessages((current) => [
          ...current,
          {
            id: `local-assistant-${crypto.randomUUID()}`,
            role: 'assistant',
            content: assistantText.trim(),
            operations: [],
            createdAt: new Date().toISOString(),
          },
        ])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSending(false)
      setStreamingContent('')
      setToolActivity(null)
    }
  }

  function handlePromoteClick() {
    if (confirmingPromote) {
      startPromote(async () => {
        const result = await updateProject(project.id, { mode: 'architecture' })
        if (result.success) {
          router.refresh()
        } else {
          setConfirmingPromote(false)
          setError(result.error)
        }
      })
    } else {
      setConfirmingPromote(true)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">{project.name}</h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Quick Capture
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {confirmingPromote ? (
            <>
              {unresolvedCount > 0 && (
                <span className="text-xs text-amber-600">
                  {unresolvedCount} open question{unresolvedCount === 1 ? '' : 's'} remaining
                </span>
              )}
              <button
                type="button"
                onClick={() => setConfirmingPromote(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePromoteClick}
                disabled={isPromoting}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isPromoting ? 'Promoting...' : 'Confirm promote'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handlePromoteClick}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
            >
              Promote to Architecture
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col" data-testid="canvas-panel">
          <div className="flex-1">
            <CanvasContainer />
          </div>
          <OpenQuestionsPanel questions={openQuestions} />
        </div>
      </div>

      {error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <FloatingChat
        messages={messages}
        isLoading={isSending}
        streamingContent={streamingContent}
        toolActivity={toolActivity}
        toolCalls={currentToolCalls}
        onSend={handleSend}
        isOpen={assistantOpen}
        onToggle={() => setAssistantOpen((prev) => !prev)}
        subtitle="Describe what the client needs — I'll build the flowchart."
        isPeeking={isPeeking}
        examplePrompts={[
          'Client needs an invoicing system with approvals',
          'Map out a returns and refunds process',
          'Capture requirements for an event booking flow',
        ]}
      />
    </div>
  )
}
