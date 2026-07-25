export type Position = {
  x: number
  y: number
}

export type ProjectMode = 'scope' | 'architecture' | 'flowchart' | 'brainstorm'

export type Project = {
  id: string
  user_id: string
  name: string
  description: string | null
  mode: ProjectMode
  created_at: string
  updated_at: string
}

export type CreateProjectInput = Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export type Module = {
  id: string
  project_id: string
  /** L1 domain / capability area (e.g. Payments). Null → General in UI. */
  domain: string | null
  name: string
  description: string | null
  /** AI-authored PRD markdown for this module, written progressively via write_prd tool. */
  prd_content: string
  position: Position
  color: string
  entry_points: string[]
  exit_points: string[]
  created_at: string
  updated_at: string
}

export type CreateModuleInput = Omit<
  Module,
  'id' | 'created_at' | 'updated_at' | 'domain' | 'prd_content'
> & {
  domain?: string | null
}

export type FlowNodeType = 'decision' | 'process' | 'entry' | 'exit' | 'start' | 'end' | 'question'

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

export type FlowEdge = {
  id: string
  module_id: string
  source_node_id: string
  target_node_id: string
  label: string | null
  condition: string | null
  created_at: string
}

export type CreateFlowEdgeInput = Pick<
  FlowEdge,
  'module_id' | 'source_node_id' | 'target_node_id'
> & {
  label?: string
  condition?: string
}

export type OpenQuestionStatus = 'open' | 'resolved'

export type OpenQuestion = {
  id: string
  project_id: string
  /** Module the question belongs to. Survives deletion of the canvas marker. */
  module_id: string | null
  /** Canvas marker node. Null once the marker is removed on resolve. */
  node_id: string | null
  section: string
  question: string
  status: OpenQuestionStatus
  resolution: string | null
  coverage_area: string | null
  created_at: string
  resolved_at: string | null
}

/** One addressable section of a module's PRD. Re-writing a section replaces it. */
export type ModulePrdSection = {
  id: string
  module_id: string
  section: string
  content: string
  position: number
  created_at: string
  updated_at: string
}

export type RequirementKind = 'functional' | 'rule' | 'constraint' | 'non_functional'

export type RequirementStatus = 'proposed' | 'agreed' | 'disputed' | 'out_of_scope'

/**
 * A single statement of what the product must do. First-class so the canvas can draw
 * requirements and their relationships, rather than burying them in module prose.
 */
export type Requirement = {
  id: string
  project_id: string
  module_id: string | null
  statement: string
  kind: RequirementKind
  status: RequirementStatus
  coverage_area: string | null
  /** Set when this requirement was promoted from a resolved open question. */
  source_question_id: string | null
  created_at: string
  updated_at: string
}

export type CreateRequirementInput = Pick<Requirement, 'project_id' | 'statement'> &
  Partial<
    Pick<Requirement, 'module_id' | 'kind' | 'status' | 'coverage_area' | 'source_question_id'>
  >
