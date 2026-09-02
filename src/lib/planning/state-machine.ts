import type {
  PlanningArtifactKind,
  PlanningChangeSetState,
  PlanningDecisionState,
  PlanningHandoffState,
} from '@/types/planning'

const artifactSourceRules: Readonly<Record<PlanningArtifactKind, PlanningArtifactKind | null>> = {
  architecture: null,
  work_plan: 'architecture',
  execution_handoff: 'work_plan',
}

const handoffTransitions: Readonly<Record<PlanningHandoffState, readonly PlanningHandoffState[]>> =
  {
    pending: ['running', 'failed'],
    running: ['complete', 'failed'],
    complete: [],
    failed: ['pending'],
  }

const changeSetTransitions: Readonly<
  Record<PlanningChangeSetState, readonly PlanningChangeSetState[]>
> = {
  completed: ['undone'],
  partial: ['completed', 'failed', 'undone'],
  failed: [],
  undone: [],
}

const decisionTransitions: Readonly<
  Record<PlanningDecisionState, readonly PlanningDecisionState[]>
> = {
  proposed: ['accepted', 'rejected', 'superseded'],
  accepted: ['superseded'],
  rejected: ['superseded'],
  superseded: [],
}

export function getRequiredSourceArtifactKind(
  artifactKind: PlanningArtifactKind,
): PlanningArtifactKind | null {
  return artifactSourceRules[artifactKind]
}

export function isValidArtifactSource(
  artifactKind: PlanningArtifactKind,
  sourceArtifactKind: PlanningArtifactKind | null,
): boolean {
  return getRequiredSourceArtifactKind(artifactKind) === sourceArtifactKind
}

export function canTransitionHandoff(
  from: PlanningHandoffState,
  to: PlanningHandoffState,
): boolean {
  return handoffTransitions[from].includes(to)
}

export function canTransitionChangeSet(
  from: PlanningChangeSetState,
  to: PlanningChangeSetState,
): boolean {
  return changeSetTransitions[from].includes(to)
}

export function canTransitionDecision(
  from: PlanningDecisionState,
  to: PlanningDecisionState,
): boolean {
  return decisionTransitions[from].includes(to)
}

export function isArtifactStale({
  artifactKind,
  sourceVersionId,
  activeSourceVersionId,
}: {
  artifactKind: PlanningArtifactKind
  sourceVersionId: string | null
  activeSourceVersionId: string | null
}): boolean {
  if (getRequiredSourceArtifactKind(artifactKind) === null) return false
  return (
    sourceVersionId === null ||
    activeSourceVersionId === null ||
    sourceVersionId !== activeSourceVersionId
  )
}
