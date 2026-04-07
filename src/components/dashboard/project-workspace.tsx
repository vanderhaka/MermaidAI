'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { LogoutButton } from '@/components/auth/logout-button'
import CanvasContainer from '@/components/canvas/CanvasContainer'
import ChatInput from '@/components/chat/ChatInput'
import ChatMessageList from '@/components/chat/ChatMessageList'
import { createModule } from '@/lib/services/module-service'
import { updateProject, deleteProject } from '@/lib/services/project-service'
import { TOOL_EVENT_DELIMITER } from '@/lib/services/llm-client'
import { ModuleHierarchyIndicator } from '@/components/dashboard/ModuleHierarchyIndicator'
import { groupModulesByDomain } from '@/lib/module-hierarchy'
import { useGraphStore } from '@/store/graph-store'
import type { ChatMessage } from '@/types/chat'
import type { FlowEdge, FlowNode, Module, ModuleConnection, Project } from '@/types/graph'

function truncateDescription(desc: string | null | undefined): string {
  const text = desc?.trim()
  if (!text) return 'No description yet'
  // Take only the first sentence
  const firstSentence = text.split(/[.\n]/)[0]
  if (firstSentence.length > 80) return firstSentence.slice(0, 77) + '...'
  return firstSentence + (firstSentence.length < text.length ? '.' : '')
}

type ProjectWorkspaceProps = {
  project: Pick<Project, 'id' | 'name' | 'description'>
  initialModules: Module[]
  initialNodes: FlowNode[]
  initialEdges: FlowEdge[]
  initialConnections: ModuleConnection[]
  initialMessages: ChatMessage[]
}

export function ProjectWorkspace({
  project,
  initialModules,
  initialNodes,
  initialEdges,
  initialConnections,
  initialMessages,
}: ProjectWorkspaceProps) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
  const [isCreatingModule, setIsCreatingModule] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  const [currentToolCalls, setCurrentToolCalls] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState(initialMessages)
  const [showSettings, setShowSettings] = useState(false)
  const [projectName, setProjectName] = useState(project.name)
  const [projectDescription, setProjectDescription] = useState(project.description ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [moduleSidebarCollapsed, setModuleSidebarCollapsed] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  const modules = useGraphStore((state) => state.modules)
  const activeModuleId = useGraphStore((state) => state.activeModuleId)
  const setModules = useGraphStore((state) => state.setModules)
  const setNodes = useGraphStore((state) => state.setNodes)
  const setEdges = useGraphStore((state) => state.setEdges)
  const setConnections = useGraphStore((state) => state.setConnections)
  const addModuleToStore = useGraphStore((state) => state.addModule)
  const addConnectionToStore = useGraphStore((state) => state.addConnection)
  const updateModuleInStore = useGraphStore((state) => state.updateModule)
  const setActiveModuleId = useGraphStore((state) => state.setActiveModuleId)

  useEffect(() => {
    setModules(initialModules)
    setNodes(initialNodes)
    setEdges(initialEdges)
    setConnections(initialConnections)
  }, [
    initialConnections,
    initialEdges,
    initialModules,
    initialNodes,
    setConnections,
    setEdges,
    setModules,
    setNodes,
  ])

  useEffect(() => {
    setMessages(initialMessages)
  }, [initialMessages])

  async function handleSaveSettings() {
    setIsSaving(true)
    setError(null)
    const result = await updateProject(project.id, {
      name: projectName.trim() || project.name,
      description: projectDescription.trim() || null,
    })
    setIsSaving(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setShowSettings(false)
    startRefresh(() => router.refresh())
  }

  async function handleDeleteProject() {
    setIsDeleting(true)
    const result = await deleteProject(project.id)
    if (result.success) {
      router.push('/dashboard')
      return
    }
    setError(result.error)
    setIsDeleting(false)
    setConfirmingDelete(false)
  }

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

  function addToolCall(label: string) {
    setToolActivity(label)
    setCurrentToolCalls((prev) => [...prev, label])
  }

  function handleToolEvent(tool: string, data: Record<string, unknown>) {
    switch (tool) {
      case 'create_module': {
        const mod = data.module as Module
        if (mod) {
          addToolCall(`Created ${mod.name} module`)
          addModuleToStore(mod)
        }
        break
      }
      case 'update_module': {
        const mod = data.module as Module
        if (mod) {
          addToolCall(`Updated ${mod.name}`)
          updateModuleInStore(mod.id, mod)
        }
        break
      }
      case 'delete_module': {
        addToolCall('Removed module')
        break
      }
      case 'connect_modules': {
        const conn = data.connection as ModuleConnection
        if (conn) addConnectionToStore(conn)
        const srcMod = data.sourceModule as Module | undefined
        if (srcMod) updateModuleInStore(srcMod.id, srcMod)
        const tgtMod = data.targetModule as Module | undefined
        if (tgtMod) updateModuleInStore(tgtMod.id, tgtMod)
        addToolCall(
          srcMod && tgtMod ? `Connected ${srcMod.name} → ${tgtMod.name}` : 'Connected modules',
        )
        break
      }
      case 'lookup_docs': {
        const lookup = data.lookup as { library: string; topic: string } | undefined
        if (lookup) {
          addToolCall(`Looked up ${lookup.library} docs`)
        }
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

        const chunk = decoder.decode(value, { stream: true })

        // Parse tool events and update store in real-time
        const lines = chunk.split(TOOL_EVENT_DELIMITER)
        // First segment is always display text
        assistantText += lines[0]
        setStreamingContent(assistantText)

        // Remaining segments are tool event JSON payloads
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          try {
            const event = JSON.parse(line) as {
              tool: string
              data: Record<string, unknown>
            }
            handleToolEvent(event.tool, event.data)
          } catch {
            // Not valid JSON — treat as text
            assistantText += lines[i]
            setStreamingContent(assistantText)
          }
        }
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
    <main className="min-h-screen bg-gray-50 px-4 py-4 sm:px-6" data-testid="project-workspace">
      <div className="flex flex-col gap-4">
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
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              aria-label="Project settings"
              className="rounded-lg border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path
                  fillRule="evenodd"
                  d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <LogoutButton />
          </div>
        </header>

        {showSettings && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
              <div className="flex-1 space-y-3">
                <div>
                  <label
                    htmlFor="project-name"
                    className="block text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    Project name
                  </label>
                  <input
                    id="project-name"
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="project-description"
                    className="block text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    Description
                  </label>
                  <input
                    id="project-description"
                    type="text"
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                    placeholder="Optional description"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>

                {confirmingDelete ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteProject}
                      disabled={isDeleting}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {isDeleting ? 'Deleting...' : 'Confirm delete'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Delete project
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div
          className={`grid h-[calc(100vh-10rem)] gap-4 transition-[grid-template-columns] duration-200 ease-out ${
            moduleSidebarCollapsed
              ? 'lg:grid-cols-[3rem_minmax(0,1fr)]'
              : 'lg:grid-cols-[240px_minmax(0,1fr)]'
          }`}
        >
          <aside
            className={`flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm ${
              moduleSidebarCollapsed ? 'p-2 lg:items-center lg:overflow-hidden' : 'p-4'
            }`}
            data-testid="module-sidebar"
            data-collapsed={moduleSidebarCollapsed ? 'true' : 'false'}
          >
            <div
              className={`mb-4 flex shrink-0 items-center gap-2 ${
                moduleSidebarCollapsed
                  ? 'flex-col lg:mb-0 lg:flex-1 lg:justify-start'
                  : 'justify-between'
              }`}
            >
              {!moduleSidebarCollapsed && (
                <>
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
                </>
              )}
              <button
                type="button"
                onClick={() => setModuleSidebarCollapsed((open) => !open)}
                aria-expanded={!moduleSidebarCollapsed}
                aria-controls="module-sidebar-list"
                title={moduleSidebarCollapsed ? 'Expand modules' : 'Collapse modules'}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 ${
                  moduleSidebarCollapsed ? 'lg:mt-0' : ''
                }`}
              >
                {moduleSidebarCollapsed ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                <span className="sr-only">
                  {moduleSidebarCollapsed ? 'Expand modules sidebar' : 'Collapse modules sidebar'}
                </span>
              </button>
            </div>

            {!moduleSidebarCollapsed && (
              <div className="mb-3 shrink-0">
                <ModuleHierarchyIndicator
                  projectName={projectName}
                  modules={modules}
                  activeModuleId={activeModuleId}
                />
              </div>
            )}

            <div
              id="module-sidebar-list"
              className={`min-h-0 flex-1 overflow-y-auto ${moduleSidebarCollapsed ? 'hidden' : ''}`}
            >
              {modules.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Add your first module to start shaping the project.
                </p>
              ) : (
                <ul className="space-y-4">
                  {groupModulesByDomain(modules).map(({ domain, modules: group }) => (
                    <li key={domain}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {domain}
                      </h3>
                      <ul className="space-y-2">
                        {group.map((module) => {
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
                                  className={`mt-1 line-clamp-2 text-xs ${isActive ? 'text-gray-200' : 'text-gray-500'}`}
                                >
                                  {truncateDescription(module.description)}
                                </p>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <section
            className="rounded-2xl border border-gray-200 bg-white shadow-sm"
            data-testid="canvas-panel"
          >
            <div className="h-full min-h-0">
              <CanvasContainer />
            </div>
          </section>
        </div>

        <div className="fixed bottom-4 left-4 right-4 z-[100] flex flex-col gap-3 sm:left-auto sm:right-6 sm:w-[min(400px,calc(100vw-3rem))]">
          {assistantOpen && (
            <section
              id="assistant-chat-panel"
              className="flex max-h-[min(70vh,560px)] min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5"
              data-testid="chat-panel"
              role="dialog"
              aria-label="Assistant"
              aria-modal="false"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Assistant
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Ask MermaidAI to sketch modules or refine the active module flow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAssistantOpen(false)}
                  className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                  aria-label="Minimize assistant"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              <ChatMessageList
                messages={messages}
                isLoading={isSending || isRefreshing}
                streamingContent={streamingContent}
                toolActivity={toolActivity}
                toolCalls={currentToolCalls}
              />

              <div className="shrink-0 border-t border-gray-200 p-4">
                <ChatInput onSend={handleSend} isLoading={isSending} />
              </div>
            </section>
          )}

          <button
            type="button"
            onClick={() => setAssistantOpen((o) => !o)}
            aria-expanded={assistantOpen}
            aria-controls={assistantOpen ? 'assistant-chat-panel' : undefined}
            className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-lg transition hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
            title={assistantOpen ? 'Hide assistant' : 'Open assistant'}
          >
            {assistantOpen ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-7 w-7"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-7 w-7"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span className="sr-only">{assistantOpen ? 'Hide assistant' : 'Open assistant'}</span>
          </button>
        </div>
      </div>
    </main>
  )
}
