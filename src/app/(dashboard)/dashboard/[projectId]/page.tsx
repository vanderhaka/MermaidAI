import { notFound } from 'next/navigation'

import { ExecutionHandoffWorkspace } from '@/components/dashboard/execution-handoff-workspace'
import { ProjectWorkspace } from '@/components/dashboard/project-workspace'
import { ScopeWorkspace } from '@/components/dashboard/scope-workspace'
import { WorkPlanWorkspace } from '@/components/dashboard/work-plan-workspace'
import { isStagedPlanningRolloutEnabled } from '@/lib/planning-feature'
import { compareArchitectureSources } from '@/lib/planning/source-comparison'
import {
  evaluateArchitectureReadiness,
  getLatestArchitectureReadinessReport,
  persistArchitectureReadinessReport,
  type ArchitectureReadinessReport,
} from '@/lib/services/architecture-readiness'
import { recoverAbandonedChatChangeSets } from '@/lib/services/change-set-service'
import { listChatMessages } from '@/lib/services/chat-message-service'
import { ensureDefaultModuleGraph } from '@/lib/services/graph-service'
import { listConnectionsByProject } from '@/lib/services/module-connection-service'
import { listModulesByProject } from '@/lib/services/module-service'
import { listOpenQuestions } from '@/lib/services/open-question-service'
import {
  getActivePlanningArtifactVersion,
  getPlanningArtifactVersion,
  getPlanningArtifactStaleness,
  type CompletePlanningArtifactVersion,
} from '@/lib/services/planning-artifact-service'
import { listPlanningDecisions } from '@/lib/services/planning-decision-service'
import {
  getOrInitializePlanningState,
  getPlanningState,
  type PlanningState,
} from '@/lib/services/planning-state-service'
import { getProjectById } from '@/lib/services/project-service'
import { isSingleCanvasMode } from '@/lib/project-modes'
import type { ChatMessage, ChatPlanningLink } from '@/types/chat'
import type { Tables } from '@/types/database'
import type { FlowEdge, FlowNode, Module, ModuleConnection, OpenQuestion } from '@/types/graph'
import type {
  ArchitecturePlanningView,
  ExecutionHandoffPlanningView,
  PlanningStageAvailability,
  PlanningStageSlug,
  WorkPlanPlanningView,
} from '@/types/planning-ui'

type ProjectPageProps = {
  params: Promise<{
    projectId: string
  }>
  searchParams?: Promise<{
    stage?: string | string[]
    generate?: string | string[]
  }>
}

type CanvasData = {
  modules: Module[]
  messages: ChatMessage[]
  connections: ModuleConnection[]
  initialNodes: FlowNode[]
  initialEdges: FlowEdge[]
  openQuestions: OpenQuestion[]
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function selectedStage(value: string | string[] | undefined): PlanningStageSlug {
  if (value === 'work-plan' || value === 'handoff') return value
  return 'architecture'
}

function mapChatMessage(message: Tables<'chat_messages'>): ChatMessage {
  return {
    id: message.id,
    role: message.role as ChatMessage['role'],
    content: message.content,
    operations: [],
    createdAt: message.created_at,
    turnId: message.turn_id,
    messageKey: message.message_key,
    planningStage: message.planning_stage as ChatMessage['planningStage'],
    artifactId: message.artifact_id,
    artifactVersionId: message.artifact_version_id,
    changeSetId: message.change_set_id,
    metadata: message.metadata as ChatMessage['metadata'],
  }
}

async function loadCanvasData(projectId: string): Promise<CanvasData> {
  const [modulesResult, messagesResult, connectionsResult, questionsResult] = await Promise.all([
    listModulesByProject(projectId),
    listChatMessages(projectId),
    listConnectionsByProject(projectId),
    listOpenQuestions(projectId),
  ])
  const modules = modulesResult.success ? modulesResult.data : []
  const graphResults = await Promise.all(modules.map((module) => ensureDefaultModuleGraph(module)))
  const initialNodes: FlowNode[] = []
  const initialEdges: FlowEdge[] = []

  for (const graphResult of graphResults) {
    if (!graphResult.success) continue
    initialNodes.push(...graphResult.data.nodes)
    initialEdges.push(...graphResult.data.edges)
  }

  return {
    modules,
    messages: messagesResult.success ? messagesResult.data.map(mapChatMessage) : [],
    connections: connectionsResult.success ? connectionsResult.data : [],
    initialNodes,
    initialEdges,
    openQuestions: questionsResult.success ? questionsResult.data : [],
  }
}

async function loadPlanningState(projectId: string): Promise<PlanningState | null> {
  const existingResult = await getPlanningState(projectId)
  const existingState = existingResult.success ? existingResult.data : null

  if (existingState?.staged_workflow_enabled) return existingState
  if (!isStagedPlanningRolloutEnabled()) return existingState

  const initializedResult = await getOrInitializePlanningState(projectId)
  return initializedResult.success ? initializedResult.data : existingState
}

function toWorkPlanView(
  version: CompletePlanningArtifactVersion<'work_plan'> | null,
): WorkPlanPlanningView['version'] {
  if (!version) return null
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

function toExecutionHandoffView(
  version: CompletePlanningArtifactVersion<'execution_handoff'> | null,
): ExecutionHandoffPlanningView['version'] {
  if (!version) return null
  return {
    id: version.id,
    artifactId: version.artifact_id,
    artifactKind: 'execution_handoff',
    version: version.version,
    contentHash: version.content_hash,
    sourceVersionId: version.source_version_id,
    secondarySourceVersionId: version.secondary_source_version_id,
    renderedMarkdown: version.rendered_markdown,
    content: version.content,
  }
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { projectId } = await params
  const query: { stage?: string | string[]; generate?: string | string[] } = searchParams
    ? await searchParams
    : {}

  if (!UUID_REGEX.test(projectId)) notFound()

  const projectResult = await getProjectById(projectId)
  if (!projectResult.success) notFound()
  const project = projectResult.data

  if (isSingleCanvasMode(project.mode)) {
    const canvas = await loadCanvasData(projectId)
    if (canvas.modules.length === 0) notFound()

    return (
      <ScopeWorkspace
        project={project}
        initialModules={canvas.modules}
        initialNodes={canvas.initialNodes}
        initialEdges={canvas.initialEdges}
        initialConnections={canvas.connections}
        initialMessages={canvas.messages}
        initialOpenQuestions={canvas.openQuestions}
      />
    )
  }

  const planningState = await loadPlanningState(projectId)
  const stagedWorkflowEnabled = planningState?.staged_workflow_enabled === true

  if (!stagedWorkflowEnabled) {
    const canvas = await loadCanvasData(projectId)
    return (
      <ProjectWorkspace
        project={project}
        initialModules={canvas.modules}
        initialNodes={canvas.initialNodes}
        initialEdges={canvas.initialEdges}
        initialConnections={canvas.connections}
        initialMessages={canvas.messages}
        initialOpenQuestions={canvas.openQuestions}
      />
    )
  }

  const recoveryResult = await recoverAbandonedChatChangeSets(projectId)
  const [architectureResult, workPlanResult, handoffResult, decisionsResult, questionsResult] =
    await Promise.all([
      getActivePlanningArtifactVersion(projectId, 'architecture'),
      getActivePlanningArtifactVersion(projectId, 'work_plan'),
      getActivePlanningArtifactVersion(projectId, 'execution_handoff'),
      listPlanningDecisions(projectId),
      listOpenQuestions(projectId),
    ])

  const architectureVersion = architectureResult.success ? architectureResult.data : null
  const completeArchitecture =
    architectureVersion?.content_state === 'complete' ? architectureVersion : null
  const workPlanVersion =
    workPlanResult.success && workPlanResult.data?.content_state === 'complete'
      ? workPlanResult.data
      : null
  const handoffVersion =
    handoffResult.success && handoffResult.data?.content_state === 'complete'
      ? handoffResult.data
      : null
  const openQuestions = questionsResult.success ? questionsResult.data : []
  const decisions = decisionsResult.success
    ? decisionsResult.data.filter(
        (decision) => decision.artifact_version_id === architectureVersion?.id,
      )
    : []

  let readinessReport: ArchitectureReadinessReport | null = null
  let readinessVerifiedForHandoff = false
  if (completeArchitecture) {
    const latestResult = await getLatestArchitectureReadinessReport(
      projectId,
      completeArchitecture.id,
    )
    const latest = latestResult.success ? (latestResult.data?.report ?? null) : null
    const latestIsCurrent =
      latest !== null &&
      latest.architectureVersionId === completeArchitecture.id &&
      latest.architectureContentHash === completeArchitecture.content_hash &&
      latest.evaluatedRevision === planningState.write_safety_revision &&
      latest.freshness === 'current'

    if (latestIsCurrent) {
      readinessReport = latest
      readinessVerifiedForHandoff = true
    } else {
      const evaluated = evaluateArchitectureReadiness({
        projectId,
        architectureVersion: {
          id: completeArchitecture.id,
          version: completeArchitecture.version,
          contentHash: completeArchitecture.content_hash,
        },
        activeArchitectureVersionId: completeArchitecture.id,
        evaluatedRevision: planningState.write_safety_revision,
        architecture: completeArchitecture.content,
        decisions,
        openQuestions: openQuestions.map((question) => ({
          id: question.id,
          artifact_version_id: question.artifact_version_id ?? null,
          question: question.question,
          status: question.status,
          readiness_impact: question.readiness_impact ?? null,
        })),
      })
      const persisted = await persistArchitectureReadinessReport({ projectId, report: evaluated })
      readinessReport = persisted.success ? persisted.data.report : evaluated
      readinessVerifiedForHandoff = persisted.success
    }
  }

  const [workPlanStalenessResult, handoffStalenessResult] = await Promise.all([
    workPlanVersion
      ? getPlanningArtifactStaleness(projectId, 'work_plan', workPlanVersion.id)
      : Promise.resolve(null),
    handoffVersion
      ? getPlanningArtifactStaleness(projectId, 'execution_handoff', handoffVersion.id)
      : Promise.resolve(null),
  ])
  const workPlanIsStale = workPlanVersion
    ? workPlanStalenessResult === null ||
      !workPlanStalenessResult.success ||
      workPlanStalenessResult.data.isStale
    : false
  const handoffIsStale = handoffVersion
    ? handoffStalenessResult === null ||
      !handoffStalenessResult.success ||
      handoffStalenessResult.data.isStale
    : false
  const canGenerateWorkPlan =
    completeArchitecture !== null &&
    readinessVerifiedForHandoff &&
    readinessReport?.handoffEligible === true
  const canGenerateHandoff =
    workPlanVersion !== null &&
    !workPlanIsStale &&
    workPlanVersion.content.unresolved_blockers.length === 0

  const availability: PlanningStageAvailability = {
    architecture: { state: 'current' },
    workPlan: {
      state: workPlanVersion
        ? workPlanIsStale
          ? 'stale'
          : 'current'
        : canGenerateWorkPlan
          ? 'ready'
          : 'locked',
      version: workPlanVersion?.version ?? null,
    },
    handoff: {
      state: handoffVersion
        ? handoffIsStale
          ? 'stale'
          : 'current'
        : canGenerateHandoff
          ? 'ready'
          : 'locked',
      version: handoffVersion?.version ?? null,
    },
  }
  const activeStage = selectedStage(query.stage)
  const startImmediately = query.generate === '1'

  if (activeStage === 'work-plan') {
    const [messagesResult, previousArchitectureResult] = await Promise.all([
      listChatMessages(projectId),
      workPlanIsStale && workPlanVersion?.source_version_id
        ? getPlanningArtifactVersion(projectId, 'architecture', workPlanVersion.source_version_id)
        : Promise.resolve(null),
    ])
    const workPlanMessages = messagesResult.success
      ? messagesResult.data
          .filter(
            (message) =>
              message.planning_stage === 'work_plan' &&
              (message.artifact_id === null ||
                message.artifact_id === workPlanVersion?.artifact_id),
          )
          .map(mapChatMessage)
      : []
    const previousArchitecture =
      previousArchitectureResult?.success &&
      previousArchitectureResult.data?.content_state === 'complete'
        ? previousArchitectureResult.data
        : null
    const sourceComparison =
      previousArchitecture && completeArchitecture
        ? compareArchitectureSources({
            fromVersion: previousArchitecture.version,
            toVersion: completeArchitecture.version,
            before: previousArchitecture.content,
            after: completeArchitecture.content,
          })
        : null

    return (
      <WorkPlanWorkspace
        project={project}
        planning={{
          sourceArchitectureVersion: completeArchitecture
            ? { id: completeArchitecture.id, version: completeArchitecture.version }
            : null,
          version: toWorkPlanView(workPlanVersion),
          messages: workPlanMessages,
          isStale: workPlanIsStale,
          canGenerate: canGenerateWorkPlan,
          sourceComparison,
        }}
        availability={availability}
        startImmediately={startImmediately}
      />
    )
  }

  if (activeStage === 'handoff') {
    return (
      <ExecutionHandoffWorkspace
        project={project}
        planning={{
          sourceWorkPlanVersion: workPlanVersion
            ? { id: workPlanVersion.id, version: workPlanVersion.version }
            : null,
          version: toExecutionHandoffView(handoffVersion),
          isStale: handoffIsStale,
          canGenerate: canGenerateHandoff,
        }}
        availability={availability}
        startImmediately={startImmediately}
      />
    )
  }

  const canvas = await loadCanvasData(projectId)
  let planningLink: ChatPlanningLink | undefined
  if (
    recoveryResult.success &&
    architectureVersion &&
    planningState.active_architecture_artifact_id === architectureVersion.artifact_id
  ) {
    planningLink = {
      stage: 'architecture',
      artifactId: architectureVersion.artifact_id,
      artifactVersionId: architectureVersion.id,
      expectedRevision: planningState.write_safety_revision,
    }
  }

  const architecturePlanning: ArchitecturePlanningView = {
    expectedRevision: planningState.write_safety_revision,
    autoDecideEnabled: planningState.auto_decide_enabled,
    version: architectureVersion
      ? ({
          id: architectureVersion.id,
          artifactId: architectureVersion.artifact_id,
          version: architectureVersion.version,
          contentHash: architectureVersion.content_hash,
          contentState: architectureVersion.content_state,
          content: architectureVersion.content,
        } as ArchitecturePlanningView['version'])
      : null,
    readinessReport,
    decisions,
  }

  return (
    <ProjectWorkspace
      project={project}
      initialModules={canvas.modules}
      initialNodes={canvas.initialNodes}
      initialEdges={canvas.initialEdges}
      initialConnections={canvas.connections}
      initialMessages={canvas.messages}
      initialOpenQuestions={canvas.openQuestions}
      planningLink={planningLink}
      architecturePlanning={architecturePlanning}
      planningStages={availability}
    />
  )
}
