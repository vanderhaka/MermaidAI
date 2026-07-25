'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import CanvasContainer from '@/components/canvas/CanvasContainer'
import FloatingChat from '@/components/chat/FloatingChat'
import OpenQuestionsPanel from '@/components/canvas/OpenQuestionsPanel'
import { InlineProjectName } from '@/components/dashboard/InlineProjectName'
import PrdPreviewPanel from '@/components/dashboard/PrdPreviewPanel'
import { SavedIndicator } from '@/components/dashboard/SavedIndicator'
import { applyScopeToolEvent } from '@/components/dashboard/tool-event-applier'
import { getProjectModeConfig } from '@/lib/project-modes'
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
  Requirement,
  RequirementLink,
  RequirementNode as RequirementNodeLink,
} from '@/types/graph'

const TOOL_LABELS: Record<string, string> = {
  create_node: 'Creating node',
  update_node: 'Updating node',
  delete_node: 'Removing node',
  create_edge: 'Connecting nodes',
  delete_edge: 'Removing connection',
  insert_node_between: 'Inserting step',
  create_module: 'Creating module',
  update_module: 'Updating module',
  delete_module: 'Removing module',
  connect_modules: 'Connecting modules',
  add_open_questions: 'Flagging questions',
  resolve_open_question: 'Resolving question',
  lookup_docs: 'Looking up docs',
  write_prd: 'Writing PRD',
  promote_project: 'Switching to Full Design',
}

const GRAPH_MUTATION_TOOLS = new Set([
  'create_node',
  'update_node',
  'delete_node',
  'create_edge',
  'delete_edge',
  'insert_node_between',
  'add_open_questions',
  'resolve_open_question',
  'create_module',
  'update_module',
  'delete_module',
  'connect_modules',
])

type SendOptions = {
  resolvingOpenQuestion?: Pick<OpenQuestion, 'id' | 'section' | 'question'>
}

function normalizeResolvePromptText(value: string): string {
  return value.toLowerCase().replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim()
}

function isOpenQuestionSelectionPrompt(
  message: string,
  question: Pick<OpenQuestion, 'section' | 'question'>,
): boolean {
  return (
    normalizeResolvePromptText(message) ===
    normalizeResolvePromptText(
      `Resolve this open question from ${question.section}: "${question.question}"`,
    )
  )
}

function formatToolName(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ')
}

const NO_REQUIREMENTS: Requirement[] = []
const NO_REQUIREMENT_LINKS: RequirementLink[] = []
const NO_REQUIREMENT_NODES: RequirementNodeLink[] = []

type ScopeWorkspaceProps = {
  project: Pick<Project, 'id' | 'name' | 'description' | 'mode'>
  initialModules: Module[]
  initialNodes: FlowNode[]
  initialEdges: FlowEdge[]
  initialConnections: ModuleConnection[]
  initialMessages: ChatMessage[]
  initialOpenQuestions: OpenQuestion[]
  initialRequirements?: Requirement[]
  initialRequirementLinks?: RequirementLink[]
  initialRequirementNodes?: RequirementNodeLink[]
}

export function ScopeWorkspace({
  project,
  initialModules,
  initialNodes,
  initialEdges,
  initialConnections,
  initialMessages,
  initialOpenQuestions,
  initialRequirements = NO_REQUIREMENTS,
  initialRequirementLinks = NO_REQUIREMENT_LINKS,
  initialRequirementNodes = NO_REQUIREMENT_NODES,
}: ScopeWorkspaceProps) {
  const modeConfig = getProjectModeConfig(project.mode)
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
    return [
      {
        id: 'welcome',
        role: 'assistant' as const,
        content: modeConfig.welcomeMessage ?? '',
        operations: [],
        createdAt: new Date().toISOString(),
      },
    ]
  })
  const [assistantOpen, setAssistantOpen] = useState(initialMessages.length === 0)
  const [isPeeking, setIsPeeking] = useState(false)
  const [prdOpen, setPrdOpen] = useState(false)
  const [pendingRefresh, setPendingRefresh] = useState(false)
  const [saveCounter, setSaveCounter] = useState(0)
  const [activeResolutionQuestion, setActiveResolutionQuestion] = useState<Pick<
    OpenQuestion,
    'id' | 'section' | 'question'
  > | null>(null)

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
  const setRequirements = useGraphStore((state) => state.setRequirements)
  const setRequirementLinks = useGraphStore((state) => state.setRequirementLinks)
  const setRequirementNodes = useGraphStore((state) => state.setRequirementNodes)
  const setActiveModuleId = useGraphStore((state) => state.setActiveModuleId)

  useEffect(() => {
    setModules(initialModules)
    setNodes(initialNodes)
    setEdges(initialEdges)
    setConnections(initialConnections)
    setOpenQuestions(initialOpenQuestions)
    setRequirements(initialRequirements)
    setRequirementLinks(initialRequirementLinks)
    setRequirementNodes(initialRequirementNodes)
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
    initialRequirements,
    initialRequirementLinks,
    initialRequirementNodes,
    setConnections,
    setEdges,
    setModules,
    setNodes,
    setOpenQuestions,
    setRequirements,
    setRequirementLinks,
    setRequirementNodes,
    setActiveModuleId,
  ])

  useEffect(() => {
    if (initialMessages.length === 0) return

    const timeout = window.setTimeout(() => setMessages(initialMessages), 0)
    return () => window.clearTimeout(timeout)
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
    applyScopeToolEvent(tool, data, {
      activeResolutionQuestionId: activeResolutionQuestion?.id,
      clearActiveResolutionQuestion: () => setActiveResolutionQuestion(null),
      markPendingRefresh: () => setPendingRefresh(true),
      recordToolCall: addToolCall,
    })
  }

  async function handleSend(message: string, options: SendOptions = {}): Promise<boolean> {
    const resolvingOpenQuestion =
      options.resolvingOpenQuestion ?? activeResolutionQuestion ?? undefined
    const isOnlySelectingQuestion =
      resolvingOpenQuestion && isOpenQuestionSelectionPrompt(message, resolvingOpenQuestion)

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

    let streamStarted = false
    let completedSuccessfully = false
    let graphChangedDuringSend = false
    let refreshAfterSend = false

    try {
      const activeModuleId = modules[0]?.id ?? null

      const chatMode = modeConfig.chatMode ?? 'scope_build'

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          message,
          mode: chatMode,
          context: {
            projectId: project.id,
            projectName: project.name,
            activeModuleId,
            mode: chatMode,
            modules: modules.map((m) => ({ id: m.id, name: m.name })),
            ...(resolvingOpenQuestion ? { resolvingOpenQuestion } : {}),
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
      streamStarted = true

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
            if (GRAPH_MUTATION_TOOLS.has(event.tool)) {
              graphChangedDuringSend = true
            }
            if (event.tool === 'promote_project') {
              refreshAfterSend = true
            }
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
      setSaveCounter((n) => n + 1)
      if (resolvingOpenQuestion && !isOnlySelectingQuestion) {
        setActiveResolutionQuestion(null)
      }
      completedSuccessfully = true
      return true
    } catch (err) {
      if (!streamStarted) {
        setMessages((current) => current.filter((entry) => entry.id !== optimisticUserMessage.id))
      }
      setError(err instanceof Error ? err.message : 'Something went wrong')
      return false
    } finally {
      setIsSending(false)
      setStreamingContent('')
      setToolActivity(null)
      if (
        pendingRefresh ||
        refreshAfterSend ||
        (graphChangedDuringSend && !completedSuccessfully)
      ) {
        setPendingRefresh(false)
        router.refresh()
      }
    }
  }

  async function handleAttachFile(file: File, note: string): Promise<boolean> {
    setIsSending(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', project.id)

      const uploadResponse = await fetch('/api/scope/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        const payload = await uploadResponse.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to parse document')
      }

      const { filename, text, truncated } = (await uploadResponse.json()) as {
        filename: string
        text: string
        truncated: boolean
      }

      const noteSection = note.trim() ? `${note.trim()}\n\n` : ''
      const truncationNote = truncated
        ? '\n\n[Note: document was truncated to fit the context window.]'
        : ''

      const fullContent = `📎 ${filename}\n\n${noteSection}-----BEGIN SCOPE DOCUMENT-----\n${text}${truncationNote}\n-----END SCOPE DOCUMENT-----`

      return await handleSend(fullContent)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsSending(false)
      return false
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
          <div className="flex items-center gap-2">
            <InlineProjectName
              projectId={project.id}
              initialName={project.name}
              className="text-sm font-semibold text-slate-900"
            />
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${modeConfig.badgeClassName}`}
            >
              {modeConfig.workspaceLabel}
            </span>
            <SavedIndicator trigger={saveCounter} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPrdOpen(true)}
            title="View Product Requirements"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z"
                clipRule="evenodd"
              />
            </svg>
            Requirements
          </button>
          {confirmingPromote ? (
            <div className="flex items-center gap-3">
              <div className="space-y-0.5 text-xs">
                <p className="text-slate-500">
                  This is permanent &mdash; you can&apos;t switch back to{' '}
                  {modeConfig.workspaceLabel}.
                </p>
                <p className="text-slate-500">
                  Your flowchart,{' '}
                  {unresolvedCount > 0
                    ? `${unresolvedCount} open question${unresolvedCount === 1 ? '' : 's'}, `
                    : ''}
                  and chat history will carry over.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingPromote(false)}
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePromoteClick}
                disabled={isPromoting}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isPromoting ? 'Switching...' : 'Confirm switch'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePromoteClick}
              title="Switch to Full Design mode for module management and deeper planning. Your flowchart and questions will be preserved."
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
            >
              Switch to Full Design
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col" data-testid="canvas-panel">
          <div className="flex-1">
            <CanvasContainer showFunnelLanes={Boolean(modeConfig.showFunnelLanes)} />
          </div>
          <OpenQuestionsPanel
            questions={openQuestions}
            onResolve={(question) => {
              const selectedQuestion = {
                id: question.id,
                section: question.section,
                question: question.question,
              }
              setActiveResolutionQuestion(selectedQuestion)
              setAssistantOpen(true)
              void handleSend(
                `Resolve this open question from ${question.section}: "${question.question}"`,
                {
                  resolvingOpenQuestion: selectedQuestion,
                },
              )
            }}
          />
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
        onAttachFile={handleAttachFile}
        isOpen={assistantOpen}
        onToggle={() => setAssistantOpen((prev) => !prev)}
        subtitle={modeConfig.chatSubtitle}
        isPeeking={isPeeking}
        examplePrompts={modeConfig.examplePrompts}
      />

      <PrdPreviewPanel
        projectName={project.name}
        projectDescription={project.description ?? null}
        isOpen={prdOpen}
        onClose={() => setPrdOpen(false)}
      />
    </div>
  )
}
