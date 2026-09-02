import type { ArchitectureReadinessReport } from '@/lib/services/architecture-readiness'
import type { ArchitectureSourceComparison } from '@/lib/planning/source-comparison'
import type { PlanningDecision } from '@/lib/services/planning-decision-service'
import type { ChatMessage } from '@/types/chat'
import type { ArchitectureSnapshotContent } from '@/types/planning'
import type {
  ExecutionHandoffContent,
  PlanningArtifactKind,
  WorkPlanContent,
} from '@/types/planning'

export type PlanningDecisionView = Pick<
  PlanningDecision,
  | 'id'
  | 'project_id'
  | 'artifact_version_id'
  | 'category'
  | 'statement'
  | 'state'
  | 'provenance'
  | 'readiness_impact'
  | 'supersedes_decision_id'
  | 'created_at'
  | 'updated_at'
  | 'latest_event'
>

type ArchitecturePlanningVersionBase = {
  id: string
  artifactId: string
  version: number
  contentHash: string
}

export type ArchitecturePlanningVersion =
  | (ArchitecturePlanningVersionBase & {
      contentState: 'draft'
      content: null
    })
  | (ArchitecturePlanningVersionBase & {
      contentState: 'complete'
      content: ArchitectureSnapshotContent
    })

export type ArchitecturePlanningView = {
  expectedRevision: number
  autoDecideEnabled: boolean
  version: ArchitecturePlanningVersion | null
  readinessReport: ArchitectureReadinessReport | null
  decisions: PlanningDecisionView[]
}

export type PlanningStageSlug = 'architecture' | 'work-plan' | 'handoff'

export type PlanningStageState = 'locked' | 'ready' | 'current' | 'stale'

export type PlanningStageAvailability = {
  architecture: { state: 'current' }
  workPlan: { state: PlanningStageState; version: number | null }
  handoff: { state: PlanningStageState; version: number | null }
}

type CompletePlanningVersionView<K extends PlanningArtifactKind, C> = {
  id: string
  artifactId: string
  artifactKind: K
  version: number
  contentHash: string
  sourceVersionId: string | null
  secondarySourceVersionId: string | null
  renderedMarkdown: string | null
  content: C
}

export type WorkPlanVersionView = CompletePlanningVersionView<'work_plan', WorkPlanContent>

export type ExecutionHandoffVersionView = CompletePlanningVersionView<
  'execution_handoff',
  ExecutionHandoffContent
>

export type WorkPlanPlanningView = {
  sourceArchitectureVersion: {
    id: string
    version: number
  } | null
  version: WorkPlanVersionView | null
  messages: ChatMessage[]
  isStale: boolean
  canGenerate: boolean
  sourceComparison: ArchitectureSourceComparison | null
}

export type ExecutionHandoffPlanningView = {
  sourceWorkPlanVersion: {
    id: string
    version: number
  } | null
  version: ExecutionHandoffVersionView | null
  isStale: boolean
  canGenerate: boolean
}
