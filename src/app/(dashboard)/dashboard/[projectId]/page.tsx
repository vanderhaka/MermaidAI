import { notFound } from 'next/navigation'

import { ProjectWorkspace } from '@/components/dashboard/project-workspace'
import { listChatMessages } from '@/lib/services/chat-message-service'
import { getGraphForModule } from '@/lib/services/graph-service'
import { listConnectionsByProject } from '@/lib/services/module-connection-service'
import { listModulesByProject } from '@/lib/services/module-service'
import { getProjectById } from '@/lib/services/project-service'
import type { ChatMessage } from '@/types/chat'
import type { FlowEdge, FlowNode, ModuleConnection } from '@/types/graph'

type ProjectPageProps = {
  params: Promise<{
    projectId: string
  }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params

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

  const graphResults = await Promise.all(modules.map((module) => getGraphForModule(module.id)))
  const initialNodes: FlowNode[] = []
  const initialEdges: FlowEdge[] = []

  for (const graphResult of graphResults) {
    if (!graphResult.success) {
      continue
    }

    initialNodes.push(...graphResult.data.nodes)
    initialEdges.push(...graphResult.data.edges)
  }

  return (
    <ProjectWorkspace
      project={projectResult.data}
      initialModules={modules}
      initialNodes={initialNodes}
      initialEdges={initialEdges}
      initialConnections={connections}
      initialMessages={messages}
    />
  )
}
