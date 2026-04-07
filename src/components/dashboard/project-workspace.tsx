'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import CanvasContainer from '@/components/canvas/CanvasContainer'
import ChatInput from '@/components/chat/ChatInput'
import ChatMessageList from '@/components/chat/ChatMessageList'
import { createModule } from '@/lib/services/module-service'
import { useGraphStore } from '@/store/graph-store'
import type { ChatMessage } from '@/types/chat'
import type { FlowEdge, FlowNode, Module, Project } from '@/types/graph'

type ProjectWorkspaceProps = {
  project: Pick<Project, 'id' | 'name' | 'description'>
  initialModules: Module[]
  initialNodes: FlowNode[]
  initialEdges: FlowEdge[]
  initialMessages: ChatMessage[]
}

export function ProjectWorkspace({
  project,
  initialModules,
  initialNodes,
  initialEdges,
  initialMessages,
}: ProjectWorkspaceProps) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
  const [isCreatingModule, setIsCreatingModule] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState(initialMessages)

  const modules = useGraphStore((state) => state.modules)
  const activeModuleId = useGraphStore((state) => state.activeModuleId)
  const setModules = useGraphStore((state) => state.setModules)
  const setNodes = useGraphStore((state) => state.setNodes)
  const setEdges = useGraphStore((state) => state.setEdges)
  const addModuleToStore = useGraphStore((state) => state.addModule)
  const setActiveModuleId = useGraphStore((state) => state.setActiveModuleId)

  useEffect(() => {
    setModules(initialModules)
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialEdges, initialModules, initialNodes, setEdges, setModules, setNodes])

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  async function handleAddModule() {
    setIsCreatingModule(true)
    setError(null)

    const result = await createModule({
      project_id: project.id,
      name: `Module ${modules.length + 1}`,
      description: `Part of ${project.name}`,
      position: { x: 0, y: 0 },
      color: '#111827',
      entry_points: [],
      exit_points: [],
    })

    setIsCreatingModule(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    addModuleToStore(result.data)
    setActiveModuleId(result.data.id)
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
    setError(null)

    try {
      const mode = activeModuleId
        ? 'module_detail'
        : modules.length > 0
          ? 'module_map'
          : 'discovery'

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          message,
          mode,
          context: {
            projectId: project.id,
            projectName: project.name,
            activeModuleId,
            mode,
            modules: modules.map((module) => ({
              id: module.id,
              name: module.name,
            })),
          },
          history: messages.map((entry) => ({
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
      let assistantText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }

        assistantText += decoder.decode(value, { stream: true })
        setStreamingContent(assistantText)
      }

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

      setStreamingContent('')
      startRefresh(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send chat message')
    } finally {
      setIsSending(false)
    }
  }

  const activeModuleName =
    activeModuleId && modules.find((module) => module.id === activeModuleId)?.name
      ? modules.find((module) => module.id === activeModuleId)?.name
      : null

  return (
    <main
      className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8"
      data-testid="project-workspace"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <Link href="/dashboard" className="font-medium text-gray-700 hover:text-black">
                Back to dashboard
              </Link>
              {activeModuleName && <span>Viewing {activeModuleName}</span>}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-500">
              {project.description?.trim() || 'Design your modules, flows, and decisions here.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAddModule}
              disabled={isCreatingModule}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingModule ? 'Adding module...' : 'Add module'}
            </button>
            <LogoutButton />
          </div>
        </header>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_360px]">
          <aside
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
            data-testid="module-sidebar"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Modules
              </h2>
              {activeModuleId && (
                <button
                  type="button"
                  onClick={() => setActiveModuleId(null)}
                  className="text-xs font-medium text-gray-500 hover:text-black"
                >
                  Module map
                </button>
              )}
            </div>

            {modules.length === 0 ? (
              <p className="text-sm text-gray-500">
                Add your first module to start shaping the project.
              </p>
            ) : (
              <ul className="space-y-2">
                {modules.map((module) => {
                  const isActive = module.id === activeModuleId

                  return (
                    <li key={module.id}>
                      <button
                        type="button"
                        onClick={() => setActiveModuleId(module.id)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                          isActive
                            ? 'border-black bg-gray-900 text-white'
                            : 'border-gray-200 bg-white text-gray-900 hover:border-gray-400'
                        }`}
                      >
                        <p className="text-sm font-medium">{module.name}</p>
                        <p
                          className={`mt-1 text-xs ${isActive ? 'text-gray-200' : 'text-gray-500'}`}
                        >
                          {module.description?.trim() || 'No description yet'}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>

          <section
            className="rounded-2xl border border-gray-200 bg-white shadow-sm"
            data-testid="canvas-panel"
          >
            <div className="h-[65vh] min-h-[480px]">
              <CanvasContainer />
            </div>
          </section>

          <section
            className="flex h-[65vh] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            data-testid="chat-panel"
          >
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Assistant
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Ask MermaidAI to sketch modules or refine the active module flow.
              </p>
            </div>

            <ChatMessageList
              messages={messages}
              isLoading={isSending || isRefreshing}
              streamingContent={streamingContent}
            />

            <div className="border-t border-gray-200 p-4">
              <ChatInput onSend={handleSend} isLoading={isSending || isRefreshing} />
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
