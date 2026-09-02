import { getGraphForModule } from '@/lib/services/graph-service'
import { listConnectionsByProject } from '@/lib/services/module-connection-service'
import { getModuleById, listModulesByProject } from '@/lib/services/module-service'
import { loadModuleNotesForChat } from '@/lib/module-notes/load-for-prompt'
import { listOpenOpenQuestions } from '@/lib/services/open-question-service'
import { getLatestArchitectureReadinessReport } from '@/lib/services/architecture-readiness'
import { getActivePlanningArtifactVersion } from '@/lib/services/planning-artifact-service'
import { listPlanningDecisions } from '@/lib/services/planning-decision-service'
import { getPlanningState } from '@/lib/services/planning-state-service'
import type { PromptContext, PromptMode } from '@/lib/services/prompt-builder'
import { buildPlanningTruthSection } from '@/lib/services/prompt-sections'
import type { SelectedOpenQuestion } from '@/lib/services/selected-open-question'

export type DurableChatPromptContext = PromptContext & {
  planningTruthSection?: string
}

export type ChatPromptContextInput = {
  projectId: string
  projectName: string
  mode: PromptMode
  activeModuleId: string | null
  resolvingOpenQuestion?: SelectedOpenQuestion
}

export async function loadChatPromptContext({
  projectId,
  projectName,
  mode,
  activeModuleId,
  resolvingOpenQuestion,
}: ChatPromptContextInput): Promise<DurableChatPromptContext> {
  const promptContext: DurableChatPromptContext = { projectName }
  if (resolvingOpenQuestion) {
    promptContext.resolvingOpenQuestion = resolvingOpenQuestion
  }

  const [
    modulesResult,
    connectionsResult,
    openQuestionsResult,
    planningStateResult,
    architectureVersionResult,
    decisionsResult,
  ] = await Promise.all([
    listModulesByProject(projectId),
    listConnectionsByProject(projectId),
    listOpenOpenQuestions(projectId),
    getPlanningState(projectId),
    getActivePlanningArtifactVersion(projectId, 'architecture'),
    listPlanningDecisions(projectId),
  ])
  if (modulesResult.success) {
    promptContext.modules = modulesResult.data
  }
  if (connectionsResult.success) {
    promptContext.connections = connectionsResult.data
  }

  if (openQuestionsResult.success) {
    promptContext.openQuestions = openQuestionsResult.data
  }

  if (planningStateResult.success && planningStateResult.data !== null) {
    promptContext.helperMode = planningStateResult.data.auto_decide_enabled
  }

  const completeArchitectureVersion =
    architectureVersionResult.success &&
    architectureVersionResult.data?.content_state === 'complete'
      ? architectureVersionResult.data
      : null
  const readinessResult = completeArchitectureVersion
    ? await getLatestArchitectureReadinessReport(projectId, completeArchitectureVersion.id)
    : { success: true as const, data: null }

  if (
    planningStateResult.success &&
    planningStateResult.data !== null &&
    architectureVersionResult.success &&
    decisionsResult.success &&
    openQuestionsResult.success &&
    readinessResult.success
  ) {
    promptContext.planningTruthSection = buildPlanningTruthSection({
      planningState: planningStateResult.data,
      architectureVersion: completeArchitectureVersion,
      decisions: decisionsResult.data,
      openQuestions: openQuestionsResult.data,
      readinessReport: readinessResult.data,
    })
  }

  if (mode === 'module_map' && !activeModuleId) {
    const modules = promptContext.modules ?? []
    const scopeModule = modules.find(
      (module) => module.name.toLowerCase() === 'scope' || modules.length === 1,
    )
    if (scopeModule) {
      const graphResult = await getGraphForModule(scopeModule.id)
      if (graphResult.success && graphResult.data.nodes.length > 0) {
        promptContext.scopeNodes = graphResult.data.nodes
        promptContext.scopeEdges = graphResult.data.edges
      }
    }
  }

  if (activeModuleId) {
    const [moduleResult, graphResult] = await Promise.all([
      getModuleById(activeModuleId),
      getGraphForModule(activeModuleId),
    ])

    if (moduleResult.success) {
      promptContext.currentModule = moduleResult.data
      const loaded = await loadModuleNotesForChat(moduleResult.data.name)
      promptContext.moduleNotes =
        loaded.source === 'none'
          ? { source: 'none', markdown: null }
          : { source: loaded.source, markdown: loaded.markdown }
    }

    if (graphResult.success) {
      promptContext.nodes = graphResult.data.nodes
      promptContext.edges = graphResult.data.edges
    }
  }

  return promptContext
}
