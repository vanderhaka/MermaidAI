'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import CanvasContainer from '@/components/canvas/CanvasContainer'
import FloatingChat from '@/components/chat/FloatingChat'
import type { ChangeSetUndoResult } from '@/components/planning/change-receipt'
import { ArchitectureReadinessPanel } from '@/components/dashboard/architecture-readiness-panel'
import { InlineProjectName } from '@/components/dashboard/InlineProjectName'
import {
  PlanningDecisionsPanel,
  type PlanningDecisionAction,
  type PlanningDecisionActionResult,
} from '@/components/dashboard/planning-decisions-panel'
import { PlanningStageNav } from '@/components/dashboard/planning-stage-nav'
import PrdPreviewPanel from '@/components/dashboard/PrdPreviewPanel'
import { SavedIndicator } from '@/components/dashboard/SavedIndicator'
import { applyProjectToolEvent } from '@/components/dashboard/tool-event-applier'
import { useChatStream } from '@/hooks/useChatStream'
import {
  commitManualArchitectureModule,
  commitPlanningAutoDecidePreference,
  commitPlanningDecisionAction,
} from '@/lib/actions/architecture-review-actions'
import { signOut } from '@/lib/services/auth-service'
import { createModule } from '@/lib/services/module-service'
import { updateProject, deleteProject } from '@/lib/services/project-service'
import { groupModulesByDomain } from '@/lib/module-hierarchy'
import { SCOPE_HANDOFF_PROMPT, takeScopeHandoff } from '@/lib/scope-handoff'
import {
  mergeArchitectureChangeSummaries,
  readArchitectureChangeSummary,
} from '@/lib/planning/architecture-change-summary'
import { useGraphStore } from '@/store/graph-store'
import type { ArchitectureChangeSummary, ChatMessage, ChatPlanningLink } from '@/types/chat'
import type {
  FlowEdge,
  FlowNode,
  Module,
  ModuleConnection,
  OpenQuestion,
  Project,
} from '@/types/graph'
import type { ArchitecturePlanningView, PlanningStageAvailability } from '@/types/planning-ui'

/**
 * Stable identity: this feeds the store-sync effect's dependency array, and a
 * fresh `[]` per render would reset the canvas on every keystroke of a stream.
 */
const NO_OPEN_QUESTIONS: OpenQuestion[] = []

function truncateDescription(desc: string | null | undefined): string {
  const text = desc?.trim()
  if (!text) return 'No description yet'
  // Take only the first sentence
  const firstSentence = text.split(/[.\n]/)[0]
  if (firstSentence.length > 80) return firstSentence.slice(0, 77) + '...'
  return firstSentence + (firstSentence.length < text.length ? '.' : '')
}

type ProjectWorkspaceProps = {
  project: Pick<Project, 'id' | 'name' | 'description' | 'mode'>
  initialModules: Module[]
  initialNodes: FlowNode[]
  initialEdges: FlowEdge[]
  initialConnections: ModuleConnection[]
  initialMessages: ChatMessage[]
  initialOpenQuestions?: OpenQuestion[]
  planningLink?: ChatPlanningLink
  architecturePlanning?: ArchitecturePlanningView
  planningStages?: PlanningStageAvailability
}

type ProjectSendOptions = {
  scopeHandoff?: boolean
}

type ArchitectureUndoAttempt = {
  targetChangeSetId: string
  undoChangeSetId: string
}

type ArchitectureUndoResponse = {
  error?: string
  receipt?: { committedRevision?: number }
}

export function ProjectWorkspace({
  project,
  initialModules,
  initialNodes,
  initialEdges,
  initialConnections,
  initialMessages,
  initialOpenQuestions = NO_OPEN_QUESTIONS,
  planningLink,
  architecturePlanning,
  planningStages,
}: ProjectWorkspaceProps) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()
  const [isCreatingModule, setIsCreatingModule] = useState(false)
  // Page-level failures (settings, modules) stay in page flow; chat failures
  // belong inside the panel, which is fixed and can cover anything under it.
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [projectName, setProjectName] = useState(project.name)
  const [projectDescription, setProjectDescription] = useState(project.description ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [moduleSidebarCollapsed, setModuleSidebarCollapsed] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [prdOpen, setPrdOpen] = useState(false)
  const [saveCounter, setSaveCounter] = useState(0)
  const [architectureTurnActive, setArchitectureTurnActive] = useState(false)
  const [planningRevision, setPlanningRevision] = useState(
    architecturePlanning?.expectedRevision ?? planningLink?.expectedRevision ?? 0,
  )
  const undoAttemptRef = useRef<ArchitectureUndoAttempt | null>(null)
  const architectureTurnSummaryRef = useRef<ArchitectureChangeSummary | null>(null)
  const isStagedArchitecture = architecturePlanning !== undefined

  const hasScopeModule = initialModules.some((m) => m.name === 'Scope')
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (!hasScopeModule) return false
    if (typeof window === 'undefined') return false
    return !localStorage.getItem(`architecture-onboarded-${project.id}`)
  })

  function dismissOnboarding() {
    localStorage.setItem(`architecture-onboarded-${project.id}`, '1')
    setShowOnboarding(false)
  }

  const modules = useGraphStore((state) => state.modules)
  const activeModuleId = useGraphStore((state) => state.activeModuleId)
  const setModules = useGraphStore((state) => state.setModules)
  const setNodes = useGraphStore((state) => state.setNodes)
  const setEdges = useGraphStore((state) => state.setEdges)
  const setConnections = useGraphStore((state) => state.setConnections)
  const addModuleToStore = useGraphStore((state) => state.addModule)
  const setActiveModuleId = useGraphStore((state) => state.setActiveModuleId)

  const setOpenQuestions = useGraphStore((state) => state.setOpenQuestions)

  useEffect(() => {
    setModules(initialModules)
    setNodes(initialNodes)
    setEdges(initialEdges)
    setConnections(initialConnections)
    setOpenQuestions(initialOpenQuestions)
    if (
      activeModuleId !== null &&
      !initialModules.some((candidate) => candidate.id === activeModuleId)
    ) {
      setActiveModuleId(null)
    }
  }, [
    activeModuleId,
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
    const timeout = window.setTimeout(() => {
      setPlanningRevision(
        architecturePlanning?.expectedRevision ?? planningLink?.expectedRevision ?? 0,
      )
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [architecturePlanning?.expectedRevision, planningLink?.expectedRevision])

  async function persistAutoDecide(input: { enabled: boolean; expectedRevision: number }) {
    const result = await commitPlanningAutoDecidePreference({
      projectId: project.id,
      ...input,
    })
    if (result.success) {
      setPlanningRevision(result.expectedRevision)
      setSaveCounter((count) => count + 1)
      startRefresh(() => router.refresh())
    }
    return result
  }

  const chat = useChatStream<ProjectSendOptions>({
    projectId: project.id,
    initialMessages,
    planningLink,
    initialHelperMode: architecturePlanning?.autoDecideEnabled,
    persistHelperMode: isStagedArchitecture ? persistAutoDecide : undefined,
    fallbackErrorMessage: 'Failed to send chat message',
    buildTurnRequest: (_message, options) => {
      architectureTurnSummaryRef.current = null
      const requestActiveModuleId = options?.scopeHandoff ? null : activeModuleId
      const mode = options?.scopeHandoff
        ? 'module_map'
        : requestActiveModuleId
          ? 'module_detail'
          : 'module_map'

      setArchitectureTurnActive(
        project.mode === 'architecture' && modules.length === 0 && mode === 'module_map',
      )

      return {
        mode,
        context: {
          projectId: project.id,
          projectName: project.name,
          activeModuleId: requestActiveModuleId,
          mode,
          modules: modules.map((module) => ({
            id: module.id,
            name: module.name,
          })),
        },
      }
    },
    applyToolEvent: (tool, data, recordToolCall) =>
      applyProjectToolEvent(tool, data, { recordToolCall }),
    getToolActivityLabel: (tool, phase) => {
      if (tool !== 'capture_architecture_map') return undefined
      return phase === 'start' ? 'Mapping capabilities' : 'Applying committed connections'
    },
    getCommittedMessageMetadata: (_tool, data) => {
      architectureTurnSummaryRef.current = mergeArchitectureChangeSummaries(
        architectureTurnSummaryRef.current,
        readArchitectureChangeSummary(data),
      )
      return architectureTurnSummaryRef.current
        ? { change_summary: architectureTurnSummaryRef.current }
        : null
    },
    onTurnEnd: ({ completedSuccessfully, graphChanged }) => {
      setArchitectureTurnActive(false)
      if (completedSuccessfully) setSaveCounter((n) => n + 1)
      // On failure the canvas already shows tool results only the server can confirm.
      if (completedSuccessfully || graphChanged) startRefresh(() => router.refresh())
    },
  })

  const handoffProjectRef = useRef<string | null>(null)

  const pendingArchitectureActivity =
    architectureTurnActive && chat.isSending
      ? (chat.toolActivity ?? 'Reading your brief and finding actors')
      : null

  const undoableArchitectureChangeSetId = useMemo(() => {
    const activeVersionId = architecturePlanning?.version?.id
    if (!activeVersionId) return null
    return (
      [...chat.messages]
        .reverse()
        .find(
          (message) =>
            message.changeSetId &&
            message.artifactVersionId === activeVersionId &&
            readArchitectureChangeSummary(message.metadata) !== null,
        )?.changeSetId ?? null
    )
  }, [architecturePlanning?.version?.id, chat.messages])

  async function handleUndoArchitectureChangeSet(
    targetChangeSetId: string,
  ): Promise<ChangeSetUndoResult> {
    const previousAttempt = undoAttemptRef.current
    const attempt =
      previousAttempt?.targetChangeSetId === targetChangeSetId
        ? previousAttempt
        : { targetChangeSetId, undoChangeSetId: crypto.randomUUID() }
    undoAttemptRef.current = attempt

    try {
      const response = await fetch('/api/planning/change-sets/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, stage: 'architecture', ...attempt }),
      })
      const payload = (await response.json().catch(() => ({}))) as ArchitectureUndoResponse
      if (!response.ok || typeof payload.receipt?.committedRevision !== 'number') {
        throw new Error(payload.error ?? 'This Architecture change could not be undone.')
      }

      undoAttemptRef.current = null
      setPlanningRevision(payload.receipt.committedRevision)
      setSaveCounter((count) => count + 1)
      startRefresh(() => router.refresh())
      return { success: true }
    } catch (undoError) {
      startRefresh(() => router.refresh())
      return {
        success: false,
        error:
          undoError instanceof Error
            ? undoError.message
            : 'This Architecture change could not be undone',
      }
    }
  }

  useEffect(() => {
    if (handoffProjectRef.current === project.id) return
    handoffProjectRef.current = project.id
    if (!takeScopeHandoff(project.id)) return

    queueMicrotask(() => {
      setAssistantOpen(true)
      void chat.sendMessage(SCOPE_HANDOFF_PROMPT, { scopeHandoff: true })
    })
  }, [chat, project.id])

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
    setSaveCounter((n) => n + 1)
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

    const moduleName = isStagedArchitecture
      ? `Capability ${modules.length + 1}`
      : `Module ${modules.length + 1}`
    if (project.mode === 'architecture' && planningLink) {
      const result = await commitManualArchitectureModule({
        projectId: project.id,
        architectureVersionId: planningLink.artifactVersionId,
        expectedRevision: planningRevision,
        requestId: crypto.randomUUID(),
        name: moduleName,
      })

      setIsCreatingModule(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      setPlanningRevision(result.receipt.committedRevision)
      setSaveCounter((n) => n + 1)
      startRefresh(() => router.refresh())
      return
    }

    const result = await createModule({
      project_id: project.id,
      name: moduleName,
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
    setSaveCounter((n) => n + 1)
  }

  async function handlePlanningDecision(
    action: PlanningDecisionAction,
  ): Promise<PlanningDecisionActionResult> {
    if (!planningLink || !architecturePlanning?.version) {
      return { success: false, error: 'The current Architecture version is unavailable.' }
    }

    const result = await commitPlanningDecisionAction({
      projectId: project.id,
      architectureVersionId: architecturePlanning.version.id,
      expectedRevision: planningRevision,
      requestId: crypto.randomUUID(),
      action: action.type,
      decisionId: action.decisionId,
      reason: action.reason,
      ...(action.statement === undefined ? {} : { statement: action.statement }),
    })
    if (result.success) {
      setPlanningRevision(result.receipt.committedRevision)
      setSaveCounter((count) => count + 1)
      startRefresh(() => router.refresh())
    }
    return result
  }

  const activeModuleName =
    activeModuleId && modules.find((module) => module.id === activeModuleId)?.name
      ? modules.find((module) => module.id === activeModuleId)?.name
      : null

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-4 sm:px-6" data-testid="project-workspace">
      <div className="flex flex-col gap-4">
        {isStagedArchitecture && planningStages && (
          <PlanningStageNav
            projectId={project.id}
            activeStage="architecture"
            availability={planningStages}
          />
        )}
        <header className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <Link href="/dashboard" className="font-medium text-gray-700 hover:text-black">
                Back to dashboard
              </Link>
              {activeModuleName && <span>Module: {activeModuleName}</span>}
            </div>
            <div className="flex items-center gap-3">
              <InlineProjectName
                projectId={project.id}
                initialName={project.name}
                className="text-3xl font-semibold tracking-tight text-gray-900"
              />
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                {isStagedArchitecture ? 'Architecture' : 'Full Design'}
              </span>
              <SavedIndicator trigger={saveCounter} />
            </div>
            <p className="text-sm text-gray-500">
              {project.description?.trim() ||
                (isStagedArchitecture
                  ? 'Shape the high-level system, review assumptions, then move into detailed work planning.'
                  : 'Design your modules, flows, and decisions here.')}
            </p>
            {isStagedArchitecture && (
              <div className="max-w-4xl pt-2">
                <ArchitectureReadinessPanel report={architecturePlanning.readinessReport}>
                  <PlanningDecisionsPanel
                    decisions={architecturePlanning.decisions}
                    onAction={handlePlanningDecision}
                  />
                </ArchitectureReadinessPanel>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isStagedArchitecture &&
              planningStages &&
              architecturePlanning.version?.contentState === 'complete' &&
              (planningStages.workPlan.state === 'ready' ||
                planningStages.workPlan.state === 'current' ||
                planningStages.workPlan.state === 'stale') && (
                <Link
                  href={
                    planningStages.workPlan.state === 'ready'
                      ? `/dashboard/${project.id}?stage=work-plan&generate=1`
                      : `/dashboard/${project.id}?stage=work-plan`
                  }
                  prefetch
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {planningStages.workPlan.state === 'ready'
                    ? 'Create Work Plan'
                    : 'Open Work Plan'}
                </Link>
              )}
            <button
              type="button"
              onClick={() => setPrdOpen(true)}
              title={isStagedArchitecture ? 'View Architecture Brief' : 'View Product Requirements'}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z"
                  clipRule="evenodd"
                />
              </svg>
              {isStagedArchitecture ? 'Architecture Brief' : 'Requirements'}
            </button>
            <button
              type="button"
              onClick={handleAddModule}
              disabled={isCreatingModule}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingModule
                ? isStagedArchitecture
                  ? 'Adding capability...'
                  : 'Adding module...'
                : isStagedArchitecture
                  ? 'Add capability'
                  : 'Add module'}
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu((open) => !open)}
                aria-label="User menu"
                aria-expanded={showUserMenu}
                aria-haspopup="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-700 transition hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                </svg>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    aria-hidden="true"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-10 z-40 min-w-[120px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false)
                        signOut()
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
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

              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>

            <div className="mt-6 rounded-lg border border-red-200 bg-red-50/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-red-900">Danger zone</p>
                  <p className="mt-0.5 text-xs text-red-700">
                    Deleting this project is permanent. Your flowchart, modules, and chat history
                    will be lost.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {confirmingDelete ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white"
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
                      className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
                    >
                      Delete project
                    </button>
                  )}
                </div>
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

        {showOnboarding && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            role="dialog"
            aria-modal="true"
            aria-label={
              isStagedArchitecture ? 'Welcome to Architecture' : 'Welcome to Full Design mode'
            }
          >
            <div className="mx-4 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                  {isStagedArchitecture ? 'Architecture' : 'Full Design'}
                </span>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-gray-900">
                {isStagedArchitecture
                  ? 'Your first Architecture draft'
                  : 'Welcome to Full Design mode'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                {isStagedArchitecture
                  ? 'Your Quick Capture has been carried into a high-level map. Review the important boundaries here, then create a detailed Work Plan.'
                  : "Your Quick Capture session is now a module. Here's what's new:"}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-blue-500" aria-hidden="true">
                    &#9654;
                  </span>
                  <span>
                    <strong className="text-gray-900">Sidebar</strong> — organise and navigate your{' '}
                    {isStagedArchitecture ? 'capabilities' : 'modules'}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-blue-500" aria-hidden="true">
                    &#9654;
                  </span>
                  <span>
                    <strong className="text-gray-900">Chat</strong> — refine only the material gaps
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-blue-500" aria-hidden="true">
                    &#9654;
                  </span>
                  <span>
                    <strong className="text-gray-900">Readiness</strong> — see exactly what blocks
                    the next stage
                  </span>
                </li>
              </ul>
              <button
                type="button"
                onClick={dismissOnboarding}
                className="mt-5 w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                Got it
              </button>
            </div>
          </div>
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
                    {isStagedArchitecture ? 'Capabilities' : 'Modules'}
                  </h2>
                  {activeModuleId && (
                    <button
                      type="button"
                      onClick={() => setActiveModuleId(null)}
                      className="text-xs font-medium text-gray-500 hover:text-black"
                    >
                      {isStagedArchitecture ? 'Architecture map' : 'Module map'}
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

            <div
              id="module-sidebar-list"
              className={`min-h-0 flex-1 overflow-y-auto ${moduleSidebarCollapsed ? 'hidden' : ''}`}
            >
              {modules.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {isStagedArchitecture
                    ? 'Chat with the assistant to map the first capabilities, or add one manually.'
                    : 'Add your first module to start shaping the project.'}
                </p>
              ) : (
                <ul className="space-y-5">
                  {groupModulesByDomain(modules).map(({ domain, modules: group }) => (
                    <li key={domain}>
                      <section
                        className="rounded-xl border border-gray-200 bg-gray-50/90 p-3"
                        aria-label={`Domain: ${domain}`}
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-200/80 pb-2">
                          <span className="inline-flex shrink-0 items-center rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                            Domain
                          </span>
                          <h3 className="text-sm font-semibold leading-tight text-gray-900">
                            {domain}
                          </h3>
                          <span className="text-xs text-gray-500">
                            {group.length} module{group.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p className="sr-only">Modules in this domain:</p>
                        <ul className="space-y-2">
                          {group.map((module) => {
                            const isActive = module.id === activeModuleId

                            return (
                              <li key={module.id}>
                                <button
                                  type="button"
                                  onClick={() => setActiveModuleId(module.id)}
                                  className={`w-full rounded-lg border px-3 py-2.5 text-left shadow-sm transition ${
                                    isActive
                                      ? 'border-black bg-gray-900 text-white shadow-md'
                                      : 'border-gray-200 bg-white text-gray-900 hover:border-gray-400'
                                  }`}
                                >
                                  <p className="text-sm font-medium">{module.name}</p>
                                  <p
                                    className={`mt-0.5 line-clamp-2 text-xs ${isActive ? 'text-gray-300' : 'text-gray-500'}`}
                                  >
                                    {truncateDescription(module.description)}
                                  </p>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </section>
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

        <FloatingChat
          messages={chat.messages}
          isLoading={chat.isSending || isRefreshing}
          streamingContent={chat.streamingContent}
          toolActivity={chat.toolActivity}
          pendingActivity={pendingArchitectureActivity}
          toolCalls={chat.toolCalls}
          onSend={chat.sendMessage}
          onStop={chat.stop}
          error={chat.chatError}
          onRetry={chat.retry}
          onDismissError={() => chat.setChatError(null)}
          isOpen={assistantOpen}
          onToggle={() => setAssistantOpen((o) => !o)}
          helperMode={chat.helperMode}
          onToggleHelperMode={chat.toggleHelperMode}
          subtitle={
            isStagedArchitecture
              ? 'Shape the high-level system. I’ll build first and only ask about material gaps.'
              : undefined
          }
          draftStorageKey={
            isStagedArchitecture ? `mermaidai.planningDraft.${project.id}.architecture` : undefined
          }
          undoableChangeSetId={undoableArchitectureChangeSetId}
          onUndoChangeSet={handleUndoArchitectureChangeSet}
        />

        <PrdPreviewPanel
          projectName={project.name}
          projectDescription={project.description ?? null}
          isOpen={prdOpen}
          onClose={() => setPrdOpen(false)}
          architecturePlanning={architecturePlanning}
        />
      </div>
    </main>
  )
}
