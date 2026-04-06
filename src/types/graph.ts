export type Position = {
  x: number
  y: number
}

export type Project = {
  id: string
  user_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export type CreateProjectInput = Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export type Module = {
  id: string
  project_id: string
  name: string
  description: string | null
  position: Position
  color: string
  entry_points: string[]
  exit_points: string[]
  created_at: string
  updated_at: string
}

export type CreateModuleInput = Omit<Module, 'id' | 'created_at' | 'updated_at'>

export type FlowNodeType = 'decision' | 'process' | 'entry' | 'exit' | 'start' | 'end'

export type FlowNode = {
  id: string
  module_id: string
  node_type: FlowNodeType
  label: string
  pseudocode: string
  position: Position
  color: string
  created_at: string
  updated_at: string
}

export type CreateFlowNodeInput = Pick<FlowNode, 'module_id' | 'node_type' | 'label'>

export type ModuleConnection = {
  id: string
  project_id: string
  source_module_id: string
  target_module_id: string
  source_exit_point: string
  target_entry_point: string
  created_at: string
}

export type CreateModuleConnectionInput = Omit<ModuleConnection, 'id' | 'created_at'>
