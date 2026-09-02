'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import CanvasContainer from '@/components/canvas/CanvasContainer'
import FloatingChat from '@/components/chat/FloatingChat'
import OpenQuestionsPanel from '@/components/canvas/OpenQuestionsPanel'
import { InlineProjectName } from '@/components/dashboard/InlineProjectName'
import PrdPreviewPanel from '@/components/dashboard/PrdPreviewPanel'
import { SavedIndicator } from '@/components/dashboard/SavedIndicator'
import { applyScopeToolEvent } from '@/components/dashboard/tool-event-applier'
import { useChatStream } from '@/hooks/useChatStream'
import { useScopeArchitectureHandoff } from '@/hooks/useScopeArchitectureHandoff'
import { getProjectModeConfig } from '@/lib/project-modes'
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

type ResolvingQuestion = Pick<OpenQuestion, 'id' | 'section' | 'question'>

type SendOptions = {
  resolvingOpenQuestion?: ResolvingQuestion
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
  const modeConfig = getProjectModeConfig(project.mode)
  const router = useRouter()
  const [confirmingPromote, setConfirmingPromote] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(initialMessages.length === 0)
  const [isPeeking, setIsPeeking] = useState(false)
  const [prdOpen, setPrdOpen] = useState(false)
  const [pendingRefresh, setPendingRefresh] = useState(false)
  const [saveCounter, setSaveCounter] = useState(0)
  const [activeResolutionQuestion, setActiveResolutionQuestion] =
    useState<ResolvingQuestion | null>(null)

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
  const refreshAfterHandoff = useCallback(() => router.refresh(), [router])
  const architectureHandoff = useScopeArchitectureHandoff({
    projectId: project.id,
    onComplete: refreshAfterHandoff,
  })
  const isPromoting = architectureHandoff.isRunning

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

  /** The question this turn is answering, whether picked now or still active. */
  function resolveQuestion(options: SendOptions | undefined): ResolvingQuestion | undefined {
    return options?.resolvingOpenQuestion ?? activeResolutionQuestion ?? undefined
  }

  const chat = useChatStream<SendOptions>({
    projectId: project.id,
    initialMessages,
    emptyStateMessages: () => [
      {
        id: 'welcome',
        role: 'assistant' as const,
        content: modeConfig.welcomeMessage ?? '',
        operations: [],
        createdAt: new Date().toISOString(),
      },
    ],
    // The welcome line is ours, not something the model ever said.
    isLocalOnlyMessage: (entry) => entry.id === 'welcome',
    fallbackErrorMessage: 'Something went wrong',
    buildTurnRequest: (message, options) => {
      const chatMode = modeConfig.chatMode ?? 'scope_build'
      const resolvingOpenQuestion = resolveQuestion(options)

      return {
        mode: chatMode,
        context: {
          projectId: project.id,
          projectName: project.name,
          activeModuleId: modules[0]?.id ?? null,
          mode: chatMode,
          modules: modules.map((m) => ({ id: m.id, name: m.name })),
          ...(resolvingOpenQuestion ? { resolvingOpenQuestion } : {}),
        },
      }
    },
    applyToolEvent: (tool, data, recordToolCall) => {
      applyScopeToolEvent(tool, data, {
        activeResolutionQuestionId: activeResolutionQuestion?.id,
        clearActiveResolutionQuestion: () => setActiveResolutionQuestion(null),
        markPendingRefresh: () => setPendingRefresh(true),
        recordToolCall,
      })
    },
    onTurnEnd: ({ message, extra, completedSuccessfully, graphChanged, appliedTools }) => {
      if (completedSuccessfully) {
        setSaveCounter((n) => n + 1)
        const resolvingOpenQuestion = resolveQuestion(extra)
        // Picking the question is not answering it — keep it active for the reply.
        if (
          resolvingOpenQuestion &&
          !isOpenQuestionSelectionPrompt(message, resolvingOpenQuestion)
        ) {
          setActiveResolutionQuestion(null)
        }
      }
      if (
        pendingRefresh ||
        appliedTools.includes('promote_project') ||
        (graphChanged && !completedSuccessfully)
      ) {
        setPendingRefresh(false)
        router.refresh()
      }
    },
  })

  async function handleAttachFile(file: File, note: string): Promise<boolean> {
    chat.setSending(true)
    chat.setChatError(null)

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

      return await chat.sendMessage(fullContent)
    } catch (err) {
      // Nothing was sent, so there is no message worth retrying.
      chat.clearRetry()
      chat.setChatError(err instanceof Error ? err.message : 'Something went wrong')
      chat.setSending(false)
      return false
    }
  }

  function handlePromoteClick() {
    if (confirmingPromote) {
      void architectureHandoff.run()
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
                <p className="font-medium text-slate-700">
                  Turn this capture into a high-level Architecture?
                </p>
                <p className="text-slate-500">
                  We&apos;ll preserve your flowchart,{' '}
                  {unresolvedCount > 0
                    ? `${unresolvedCount} open question${unresolvedCount === 1 ? '' : 's'}, `
                    : ''}
                  and chat history. Nothing switches until the Architecture is safely saved.
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
                disabled={isPromoting || architectureHandoff.isChecking}
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isPromoting ? 'Building Architecture…' : 'Build Architecture'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePromoteClick}
              disabled={architectureHandoff.isChecking}
              title="Turn this capture into a high-level Architecture. Your source stays intact until the Architecture is safely saved."
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
            >
              {architectureHandoff.isChecking ? 'Checking handoff…' : 'Build Architecture'}
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
            isBusy={chat.isSending || isPromoting}
            onResolve={(question) => {
              if (chat.isSending || isPromoting) return
              const selectedQuestion = {
                id: question.id,
                section: question.section,
                question: question.question,
              }
              setActiveResolutionQuestion(selectedQuestion)
              setAssistantOpen(true)
              void chat.sendMessage(
                `Resolve this open question from ${question.section}: "${question.question}"`,
                {
                  resolvingOpenQuestion: selectedQuestion,
                },
              )
            }}
          />
        </div>
      </div>

      {isPromoting && (
        <div
          role="status"
          className="flex items-center gap-2 border-t border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" aria-hidden />
          <span>
            {architectureHandoff.status === 'starting'
              ? 'Freezing this Quick Capture…'
              : 'Building and validating the Architecture… You can safely reload this page.'}
          </span>
        </div>
      )}

      {architectureHandoff.error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          <span>{architectureHandoff.error} Your Quick Capture is still intact.</span>
          <span className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={architectureHandoff.dismissError}
              className="rounded-md px-2 py-1 font-medium hover:bg-red-100"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={architectureHandoff.retry}
              className="rounded-md bg-red-700 px-2.5 py-1 font-medium text-white hover:bg-red-800"
            >
              Retry safely
            </button>
          </span>
        </div>
      )}

      <FloatingChat
        messages={chat.messages}
        isLoading={chat.isSending}
        streamingContent={chat.streamingContent}
        toolActivity={chat.toolActivity}
        toolCalls={chat.toolCalls}
        onSend={chat.sendMessage}
        onAttachFile={handleAttachFile}
        onStop={chat.stop}
        error={chat.chatError}
        onRetry={chat.retry}
        onDismissError={() => chat.setChatError(null)}
        isOpen={assistantOpen}
        onToggle={() => setAssistantOpen((prev) => !prev)}
        helperMode={chat.helperMode}
        onToggleHelperMode={chat.toggleHelperMode}
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
