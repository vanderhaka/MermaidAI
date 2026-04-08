import { notFound } from 'next/navigation'

import { ProjectWorkspace } from '@/components/dashboard/project-workspace'
import { ScopeWorkspace } from '@/components/dashboard/scope-workspace'
import { listChatMessages } from '@/lib/services/chat-message-service'
import { ensureDefaultModuleGraph } from '@/lib/services/graph-service'
import { listConnectionsByProject } from '@/lib/services/module-connection-service'
import { listModulesByProject } from '@/lib/services/module-service'
import { listOpenQuestions } from '@/lib/services/open-question-service'
import { getProjectById } from '@/lib/services/project-service'
import type { ChatMessage } from '@/types/chat'
import type { FlowEdge, FlowNode, ModuleConnection, OpenQuestion } from '@/types/graph'

type ProjectPageProps = {
  params: Promise<{
    projectId: string
  }>
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params

  if (!UUID_REGEX.test(projectId)) {
    notFound()
  }

  const [projectResult, modulesResult, messagesResult, connectionsResult] = await Promise.all([
    getProjectById(projectId),
    listModulesByProject(projectId),
    listChatMessages(projectId),
    listConnectionsByProject(projectId),
  ])

  if (!projectResult.success) {
    notFound()
  }

  const modules = modulesResult.success ? modulesResult.data : []
  const messages: ChatMessage[] = messagesResult.success
    ? messagesResult.data.map((message) => ({
        id: message.id,
        role: message.role as ChatMessage['role'],
        content: message.content,
        operations: [],
        createdAt: message.created_at,
      }))
    : []

  const connections: ModuleConnection[] = connectionsResult.success ? connectionsResult.data : []

  const graphResults = await Promise.all(modules.map((module) => ensureDefaultModuleGraph(module)))
  const initialNodes: FlowNode[] = []
  const initialEdges: FlowEdge[] = []

  for (const graphResult of graphResults) {
    if (!graphResult.success) {
      continue
    }

    initialNodes.push(...graphResult.data.nodes)
    initialEdges.push(...graphResult.data.edges)
  }

  const isScope = projectResult.data.mode === 'scope'

  const oqResult = await listOpenQuestions(projectId)
  const initialOpenQuestions: OpenQuestion[] = oqResult.success ? oqResult.data : []

  if (isScope) {
    return (
      <ScopeWorkspace
        project={projectResult.data}
        initialModules={modules}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        initialConnections={connections}
        initialMessages={messages}
        initialOpenQuestions={initialOpenQuestions}
      />
    )
  }

  return (
    <ProjectWorkspace
      project={projectResult.data}
      initialModules={modules}
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      initialConnections={connections}
      initialMessages={messages}
      initialOpenQuestions={initialOpenQuestions}
    />
  )
}
