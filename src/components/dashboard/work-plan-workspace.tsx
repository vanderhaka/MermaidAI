'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import FloatingChat from '@/components/chat/FloatingChat'
import { PlanningWorkspaceHeader } from '@/components/dashboard/planning-workspace-header'
import { readWorkPlanReceipt, type ChangeSetUndoResult } from '@/components/planning/change-receipt'
import { usePlanningHandoff } from '@/hooks/usePlanningHandoff'
import { WORK_PLAN_EVIDENCE_NOTICE } from '@/lib/planning/evidence-boundary'
import type { ChatMessage } from '@/types/chat'
import type { Project } from '@/types/graph'
import type { WorkPlanContent } from '@/types/planning'
import type {
  PlanningStageAvailability,
  WorkPlanPlanningView,
  WorkPlanVersionView,
} from '@/types/planning-ui'

type WorkPlanWorkspaceProps = {
  project: Pick<Project, 'id' | 'name'>
  planning: WorkPlanPlanningView
  availability: PlanningStageAvailability
  startImmediately?: boolean
}

const GENERATION_STEPS = [
  'Freezing the Architecture source',
  'Ordering vertical slices',
  'Writing acceptance checks',
] as const

type RefinementAttempt = {
  message: string
  turnId: string
  changeSetId: string
  userMessageKey: string
  assistantMessageKey: string
}

type RefinementResponse = {
  error?: string
  artifact?: WorkPlanRefinementArtifact
  assistantMessage?: ChatMessage
}

type UndoAttempt = {
  targetChangeSetId: string
  undoChangeSetId: string
}

type UndoResponse = {
  error?: string
  artifact?: WorkPlanRefinementArtifact
  assistantMessage?: ChatMessage
}

type WorkPlanRefinementArtifact = {
  id: string
  artifact_id: string
  version: number
  content_hash: string
  source_version_id: string | null
  secondary_source_version_id: string | null
  rendered_markdown: string | null
  content: WorkPlanContent
}

function toVersionView(version: WorkPlanRefinementArtifact): WorkPlanVersionView {
  return {
    id: version.id,
    artifactId: version.artifact_id,
    artifactKind: 'work_plan',
    version: version.version,
    contentHash: version.content_hash,
    sourceVersionId: version.source_version_id,
    secondarySourceVersionId: version.secondary_source_version_id,
    renderedMarkdown: version.rendered_markdown,
    content: version.content,
  }
}

function appendMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  if (
    messages.some(
      (candidate) =>
        candidate.id === message.id ||
        (message.messageKey !== null &&
          message.messageKey !== undefined &&
          candidate.messageKey === message.messageKey),
    )
  ) {
    return messages
  }
  return [...messages, message]
}

function GenerationActivityText() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setStep((current) => Math.min(current + 1, GENERATION_STEPS.length - 1)),
      900,
    )
    return () => window.clearInterval(intervalId)
  }, [])

  return <>{GENERATION_STEPS[step]}</>
}

function EmptyWorkPlan({
  canGenerate,
  isRunning,
  error,
  onGenerate,
}: {
  canGenerate: boolean
  isRunning: boolean
  error: string | null
  onGenerate: () => void
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-h-[420px] place-items-center p-6 text-center">
        <div className="max-w-lg">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
              <path d="M7 6h10M7 12h10M7 18h6" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="m4 6 .5.5L6 5m-2 7 .5.5L6 11m-2 7 .5.5L6 17"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          </div>
          <h2 className="mt-5 text-xl font-semibold text-slate-950">
            {canGenerate ? 'Turn the architecture into buildable slices' : 'Work Plan is locked'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {canGenerate
              ? 'MermaidAI will bind the plan to this exact Architecture version, order the dependencies, and add a proof check to every slice.'
              : 'Finish the Architecture readiness checks first. This keeps unresolved product decisions from quietly becoming implementation guesses.'}
          </p>

          {isRunning ? (
            <div
              className="mx-auto mt-6 max-w-sm rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-left"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-blue-950">
                    <GenerationActivityText />
                  </p>
                  <p className="mt-0.5 text-xs text-blue-700">
                    Safe to leave. The job will resume.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            canGenerate && (
              <button
                type="button"
                onClick={onGenerate}
                className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Create Work Plan
              </button>
            )
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left">
              <p role="alert" className="text-sm text-red-800">
                {error}
              </p>
              <button
                type="button"
                onClick={onGenerate}
                className="mt-2 text-sm font-semibold text-red-900 underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function WorkPlanWorkspace({
  project,
  planning,
  availability,
  startImmediately = false,
}: WorkPlanWorkspaceProps) {
  const router = useRouter()
  const [activeVersion, setActiveVersion] = useState(planning.version)
  const [messages, setMessages] = useState(planning.messages)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [refinementError, setRefinementError] = useState<string | null>(null)
  const [composerResetSignal, setComposerResetSignal] = useState(0)
  const [composerResetValue, setComposerResetValue] = useState<string | undefined>()
  const lastAttemptRef = useRef<RefinementAttempt | null>(null)
  const undoAttemptRef = useRef<UndoAttempt | null>(null)

  useEffect(() => {
    setActiveVersion(planning.version)
  }, [planning.version])

  useEffect(() => {
    setMessages(planning.messages)
  }, [planning.messages])

  const handleComplete = useCallback(() => {
    router.replace(`/dashboard/${project.id}?stage=work-plan`)
    router.refresh()
  }, [project.id, router])
  const handoff = usePlanningHandoff({
    projectId: project.id,
    sourceVersionId: planning.sourceArchitectureVersion?.id ?? null,
    targetKind: 'work_plan',
    startImmediately: startImmediately && planning.canGenerate,
    onComplete: handleComplete,
  })
  const runRefinement = useCallback(
    async (
      attempt: RefinementAttempt,
      addOptimisticMessage: boolean,
      clearRestoredDraftOnSuccess = false,
    ): Promise<boolean> => {
      if (!activeVersion) {
        setRefinementError('Create the Work Plan before refining it.')
        return false
      }
      if (planning.isStale) {
        setRefinementError('Refresh this plan from the current Architecture before refining it.')
        return false
      }
      if (isRefining) return false

      lastAttemptRef.current = attempt
      setRefinementError(null)
      setIsRefining(true)

      if (addOptimisticMessage) {
        const optimisticMessage: ChatMessage = {
          id: attempt.userMessageKey,
          role: 'user',
          content: attempt.message,
          operations: [],
          createdAt: new Date().toISOString(),
          turnId: attempt.turnId,
          messageKey: attempt.userMessageKey,
          planningStage: 'work_plan',
          artifactId: activeVersion.artifactId,
          artifactVersionId: activeVersion.id,
          changeSetId: attempt.changeSetId,
          metadata: { delivery_status: 'submitting' },
        }
        setMessages((current) => appendMessage(current, optimisticMessage))
      }

      try {
        const response = await fetch('/api/planning/work-plan/refine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            workPlanVersionId: activeVersion.id,
            ...attempt,
          }),
        })
        const payload = (await response.json().catch(() => ({}))) as RefinementResponse
        if (!response.ok || !payload.artifact || !payload.assistantMessage) {
          throw new Error(payload.error ?? 'The plan could not be updated. Try again.')
        }

        const assistantMessage = payload.assistantMessage
        setActiveVersion(toVersionView(payload.artifact))
        setMessages((current) => appendMessage(current, assistantMessage))
        if (clearRestoredDraftOnSuccess) {
          setComposerResetValue(attempt.message)
          setComposerResetSignal((current) => current + 1)
        }
        lastAttemptRef.current = null
        router.refresh()
        return true
      } catch (error) {
        setRefinementError(
          error instanceof Error ? error.message : 'The plan could not be updated. Try again.',
        )
        return false
      } finally {
        setIsRefining(false)
      }
    },
    [activeVersion, isRefining, planning.isStale, project.id, router],
  )

  const handleSend = useCallback(
    (message: string) =>
      runRefinement(
        {
          message,
          turnId: crypto.randomUUID(),
          changeSetId: crypto.randomUUID(),
          userMessageKey: crypto.randomUUID(),
          assistantMessageKey: crypto.randomUUID(),
        },
        true,
      ),
    [runRefinement],
  )

  const handleRetry = useCallback(() => {
    const attempt = lastAttemptRef.current
    if (attempt) void runRefinement(attempt, false, true)
  }, [runRefinement])

  const undoableChangeSetId = useMemo(() => {
    if (!activeVersion) return null
    return (
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.changeSetId &&
            message.artifactVersionId === activeVersion.id &&
            readWorkPlanReceipt(message) !== null,
        )?.changeSetId ?? null
    )
  }, [activeVersion, messages])

  const handleUndoChangeSet = useCallback(
    async (targetChangeSetId: string): Promise<ChangeSetUndoResult> => {
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
          body: JSON.stringify({ projectId: project.id, stage: 'work_plan', ...attempt }),
        })
        const payload = (await response.json().catch(() => ({}))) as UndoResponse
        if (!response.ok || !payload.artifact || !payload.assistantMessage) {
          throw new Error(payload.error ?? 'This plan change could not be undone.')
        }

        setActiveVersion(toVersionView(payload.artifact))
        setMessages((current) => appendMessage(current, payload.assistantMessage!))
        undoAttemptRef.current = null
        lastAttemptRef.current = null
        router.refresh()
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'This plan change could not be undone',
        }
      }
    },
    [project.id, router],
  )

  const content = activeVersion?.content ?? null
  const slicesById = useMemo(
    () => new Map(content?.slices.map((slice) => [slice.id, slice]) ?? []),
    [content],
  )

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-4 sm:px-6" data-testid="work-plan-workspace">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <PlanningWorkspaceHeader
          project={project}
          activeStage="work-plan"
          availability={availability}
          eyebrow="Stage 2 of 3"
          title="Work Plan"
          description="Detailed, dependency-ordered delivery slices bound to one exact Architecture version."
          actions={
            activeVersion ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsChatOpen(true)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:text-blue-700"
                >
                  Refine with AI
                </button>
                {planning.canGenerate && planning.isStale && (
                  <button
                    type="button"
                    onClick={() => void handoff.run()}
                    disabled={handoff.isRunning}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    {handoff.isRunning ? 'Refreshing…' : 'Refresh from Architecture'}
                  </button>
                )}
              </div>
            ) : null
          }
        />

        {planning.version && planning.isStale && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-950 sm:px-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold">
                  Architecture changed after Work Plan v{planning.version.version}
                </p>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-900">
                  This version is preserved for review and cannot create a new handoff. Refreshing
                  creates a new immutable Work Plan; this one remains in history.
                </p>
                {planning.sourceComparison && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
                      Architecture v{planning.sourceComparison.fromVersion} → v
                      {planning.sourceComparison.toVersion}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                      <span className="rounded-full border border-amber-200 bg-white/70 px-2.5 py-1">
                        Capabilities +{planning.sourceComparison.capabilitiesAdded} / −
                        {planning.sourceComparison.capabilitiesRemoved} / ~
                        {planning.sourceComparison.capabilitiesChanged}
                      </span>
                      <span className="rounded-full border border-amber-200 bg-white/70 px-2.5 py-1">
                        Connections +{planning.sourceComparison.connectionsAdded} / −
                        {planning.sourceComparison.connectionsRemoved} / ~
                        {planning.sourceComparison.connectionsChanged}
                      </span>
                      <span className="rounded-full border border-amber-200 bg-white/70 px-2.5 py-1">
                        Assumptions or blockers changed {planning.sourceComparison.decisionsChanged}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              {handoff.isRunning && (
                <span className="shrink-0 text-sm font-semibold" role="status">
                  <GenerationActivityText />
                </span>
              )}
            </div>
          </section>
        )}

        {handoff.error && planning.version && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {handoff.error}
          </p>
        )}

        {!content ? (
          <EmptyWorkPlan
            canGenerate={planning.canGenerate}
            isRunning={handoff.isRunning}
            error={handoff.error}
            onGenerate={() => void handoff.run()}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Source
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                Architecture v{content.source_architecture_version.version}
              </p>
              <div className="mt-5 border-t border-slate-100 pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Plan shape
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-slate-500">Phases</dt>
                    <dd className="text-lg font-semibold text-slate-950">
                      {content.phases.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Slices</dt>
                    <dd className="text-lg font-semibold text-slate-950">
                      {content.slices.length}
                    </dd>
                  </div>
                </dl>
              </div>
              {content.unresolved_blockers.length > 0 && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">
                    {content.unresolved_blockers.length} unresolved blocker
                    {content.unresolved_blockers.length === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Resolve these before creating the handoff.
                  </p>
                </div>
              )}
              <button
                type="button"
                disabled={
                  planning.isStale || content.unresolved_blockers.length > 0 || handoff.isRunning
                }
                onClick={() => router.push(`/dashboard/${project.id}?stage=handoff&generate=1`)}
                className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                Create Handoff
              </button>
              <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">
                Preview and export only. Nothing starts building.
              </p>
            </aside>

            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                    Work Plan v{activeVersion?.version}
                  </p>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Bound to source
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-slate-950">{content.objective}</h2>
                {content.non_goals.length > 0 && (
                  <div className="mt-5 rounded-xl bg-slate-50 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Not in this plan
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {content.non_goals.map((nonGoal) => (
                        <li key={nonGoal}>• {nonGoal}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <div className="flex gap-3">
                    <span
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800"
                      aria-hidden="true"
                    >
                      i
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-sky-950">
                        Repository evidence boundary
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-sky-900">
                        {WORK_PLAN_EVIDENCE_NOTICE}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {content.phases.map((phase, phaseIndex) => (
                <section
                  key={phase.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white">
                      {phaseIndex + 1}
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">{phase.title}</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{phase.objective}</p>
                    </div>
                  </div>

                  <ol className="mt-5 space-y-4">
                    {phase.slice_ids.map((sliceId, sliceIndex) => {
                      const slice = slicesById.get(sliceId)
                      if (!slice) return null
                      return (
                        <li
                          key={slice.id}
                          className="rounded-xl border border-slate-200 p-4 sm:p-5"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold text-slate-500">
                                Slice {phaseIndex + 1}.{sliceIndex + 1}
                              </p>
                              <h3 className="mt-1 font-semibold text-slate-950">{slice.title}</h3>
                            </div>
                            {slice.dependencies.length > 0 && (
                              <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                                After {slice.dependencies.join(', ')}
                              </span>
                            )}
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-3">
                            {[
                              ['Trigger', slice.actor_or_trigger],
                              ['Visible outcome', slice.observable_outcome],
                              ['Protect', slice.protected_invariant],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-lg bg-slate-50 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  {label}
                                </p>
                                <p className="mt-1 text-sm leading-5 text-slate-700">{value}</p>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Done when
                              </h4>
                              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                                {slice.acceptance_criteria.map((criterion) => (
                                  <li key={criterion} className="flex gap-2">
                                    <span className="text-emerald-600">✓</span>
                                    <span>{criterion}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Suggested proof
                              </h4>
                              <ul className="mt-2 space-y-2">
                                {slice.verification.map((verification) => (
                                  <li key={verification.command}>
                                    <code className="block overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-100">
                                      {verification.command}
                                    </code>
                                    {verification.purpose && (
                                      <p className="mt-1 text-xs text-slate-500">
                                        {verification.purpose}
                                      </p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              ))}
            </section>
          </div>
        )}
      </div>
      {content && (
        <FloatingChat
          messages={messages}
          isLoading={isRefining}
          streamingContent=""
          toolActivity={isRefining ? 'Applying bounded Work Plan edits' : null}
          onSend={handleSend}
          error={refinementError}
          onRetry={lastAttemptRef.current ? handleRetry : undefined}
          onDismissError={() => setRefinementError(null)}
          isOpen={isChatOpen}
          onToggle={() => setIsChatOpen((open) => !open)}
          subtitle="Refine this Work Plan. Each accepted turn creates a new immutable version."
          examplePrompts={[
            'Split the riskiest slice into two smaller vertical slices',
            'Add stronger verification for failure and retry paths',
            'Reorder the plan so the first usable outcome ships sooner',
          ]}
          draftStorageKey={`mermaidai.planningDraft.${project.id}.work-plan`}
          composerResetSignal={composerResetSignal}
          composerResetValue={composerResetValue}
          undoableChangeSetId={undoableChangeSetId}
          onUndoChangeSet={handleUndoChangeSet}
        />
      )}
    </main>
  )
}
