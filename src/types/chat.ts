export type ChatRole = 'user' | 'assistant' | 'system'

export type ChatMode = 'discovery' | 'module_map' | 'module_detail' | 'scope_build'

export type GraphOperationType =
  | 'create_module'
  | 'update_module'
  | 'delete_module'
  | 'create_node'
  | 'update_node'
  | 'delete_node'
  | 'create_edge'
  | 'update_edge'
  | 'delete_edge'
  | 'connect_modules'

export type CreateModuleOperation = {
  type: 'create_module'
  payload: {
    name: string
    description?: string
  }
}

export type UpdateModuleOperation = {
  type: 'update_module'
  payload: {
    moduleId: string
    name?: string
    description?: string
  }
}

export type DeleteModuleOperation = {
  type: 'delete_module'
  payload: {
    moduleId: string
  }
}

export type CreateNodeOperation = {
  type: 'create_node'
  payload: {
    moduleId: string
    label: string
    nodeType: string
    pseudocode?: string
  }
}

export type UpdateNodeOperation = {
  type: 'update_node'
  payload: {
    nodeId: string
    label?: string
    nodeType?: string
    pseudocode?: string
  }
}

export type DeleteNodeOperation = {
  type: 'delete_node'
  payload: {
    nodeId: string
  }
}

export type CreateEdgeOperation = {
  type: 'create_edge'
  payload: {
    moduleId: string
    sourceNodeId: string
    targetNodeId: string
    label?: string
    condition?: string
  }
}

export type UpdateEdgeOperation = {
  type: 'update_edge'
  payload: {
    edgeId: string
    label?: string
    condition?: string
  }
}

export type DeleteEdgeOperation = {
  type: 'delete_edge'
  payload: {
    edgeId: string
  }
}

export type ConnectModulesOperation = {
  type: 'connect_modules'
  payload: {
    sourceModuleId: string
    targetModuleId: string
    sourceExitPoint: string
    targetEntryPoint: string
  }
}

export type GraphOperation =
  | CreateModuleOperation
  | UpdateModuleOperation
  | DeleteModuleOperation
  | CreateNodeOperation
  | UpdateNodeOperation
  | DeleteNodeOperation
  | CreateEdgeOperation
  | UpdateEdgeOperation
  | DeleteEdgeOperation
  | ConnectModulesOperation

export type ModuleSummary = {
  id: string
  name: string
}

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  operations: GraphOperation[]
  createdAt: string
}

export type ChatContext = {
  projectId: string
  projectName: string
  activeModuleId: string | null
  mode: ChatMode
  modules: ModuleSummary[]
}

export type CreateChatMessageInput = {
  project_id: string
  role: ChatRole
  content: string
}
