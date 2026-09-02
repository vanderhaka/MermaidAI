export const PLANNING_ARTIFACT_KINDS = ['architecture', 'work_plan', 'execution_handoff'] as const

export const PLANNING_READINESS_STATES = [
  'draft',
  'needs_input',
  'ready_with_assumptions',
  'ready',
] as const

export const PLANNING_HANDOFF_STATES = ['pending', 'running', 'complete', 'failed'] as const

export const PLANNING_DECISION_STATES = ['proposed', 'accepted', 'rejected', 'superseded'] as const

export const PLANNING_CHANGE_SET_STATES = ['completed', 'partial', 'failed', 'undone'] as const

export const EXECUTION_HANDOFF_CAPABILITIES = ['preview', 'copy', 'download'] as const

export type PlanningArtifactKind = (typeof PLANNING_ARTIFACT_KINDS)[number]
export type PlanningReadinessState = (typeof PLANNING_READINESS_STATES)[number]
export type PlanningHandoffState = (typeof PLANNING_HANDOFF_STATES)[number]
export type PlanningDecisionState = (typeof PLANNING_DECISION_STATES)[number]
export type PlanningChangeSetState = (typeof PLANNING_CHANGE_SET_STATES)[number]
export type ExecutionHandoffCapability = (typeof EXECUTION_HANDOFF_CAPABILITIES)[number]

export type PlanningArtifactVersionReference = {
  id: string
  artifact_kind: PlanningArtifactKind
  version: number
}

export type PlanningAssumption = {
  id: string
  statement: string
}

export type PlanningBlocker = {
  id: string
  statement: string
}

export type ArchitectureCapability = {
  id: string
  name: string
  purpose: string
  responsibilities: string[]
  boundaries: string[]
}

export type ArchitectureConnection = {
  from_capability_id: string
  to_capability_id: string
  description: string
}

export type ArchitectureFlow = {
  id: string
  actor: string
  outcome: string
  capability_ids: string[]
}

export type ArchitectureSnapshotContent = {
  objective: string
  outcomes: string[]
  actors: string[]
  capabilities: ArchitectureCapability[]
  connections: ArchitectureConnection[]
  important_flows: ArchitectureFlow[]
  assumptions: PlanningAssumption[]
  blockers: PlanningBlocker[]
}

export type WorkPlanVerification = {
  command: string
  purpose?: string
}

export type WorkPlanTargets = {
  files: string[]
  api: string[]
  data: string[]
}

export type WorkPlanSlice = {
  id: string
  title: string
  actor_or_trigger: string
  observable_outcome: string
  protected_invariant: string
  dependencies: string[]
  source_capability_ids: string[]
  acceptance_criteria: string[]
  verification: WorkPlanVerification[]
  likely_targets: WorkPlanTargets
  risks: string[]
  rollback_notes: string[]
  assumption_ids: string[]
  unresolved_blocker_ids: string[]
}

export type WorkPlanPhase = {
  id: string
  title: string
  objective: string
  slice_ids: string[]
}

export type WorkPlanContent = {
  source_architecture_version: PlanningArtifactVersionReference
  objective: string
  non_goals: string[]
  phases: WorkPlanPhase[]
  slices: WorkPlanSlice[]
  assumptions: PlanningAssumption[]
  unresolved_blockers: PlanningBlocker[]
}

export type ExecutionHandoffSlice = Pick<
  WorkPlanSlice,
  | 'id'
  | 'title'
  | 'dependencies'
  | 'acceptance_criteria'
  | 'verification'
  | 'risks'
  | 'rollback_notes'
>

export type ExecutionHandoffContent = {
  source_architecture_version: PlanningArtifactVersionReference
  source_work_plan_version: PlanningArtifactVersionReference
  objective: string
  non_goals: string[]
  dependency_order: string[]
  slices: ExecutionHandoffSlice[]
  assumptions: PlanningAssumption[]
  unresolved_blockers: PlanningBlocker[]
  out_of_scope: string[]
  authorization_notice: 'This packet is for review, copy, or download only. It does not authorize or start implementation.'
}
