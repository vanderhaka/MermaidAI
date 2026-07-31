import { getGraphForModule } from '@/lib/services/graph-service'
import { listConnectionsByProject } from '@/lib/services/module-connection-service'
import { getModuleById, listModulesByProject } from '@/lib/services/module-service'
import { loadModuleNotesForChat } from '@/lib/module-notes/load-for-prompt'
import { listOpenOpenQuestions } from '@/lib/services/open-question-service'
import type { PromptContext, PromptMode } from '@/lib/services/prompt-builder'
import type { SelectedOpenQuestion } from '@/lib/services/selected-open-question'

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
}: ChatPromptContextInput): Promise<PromptContext> {
  const promptContext: PromptContext = { projectName }
  if (resolvingOpenQuestion) {
    promptContext.resolvingOpenQuestion = resolvingOpenQuestion
  }

  const [modulesResult, connectionsResult, openQuestionsResult] = await Promise.all([
    listModulesByProject(projectId),
    listConnectionsByProject(projectId),
    listOpenOpenQuestions(projectId),
  ])
  if (modulesResult.success) {
    promptContext.modules = modulesResult.data
  }
  if (connectionsResult.success) {
    promptContext.connections = connectionsResult.data
  }

  if (openQuestionsResult.success) {
    promptContext.openQuestions = openQuestionsResult.data.map((question) => ({
      id: question.id,
      section: question.section,
      question: question.question,
      status: question.status,
      resolution: question.resolution,
    }))
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
