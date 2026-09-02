// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  canTransitionChangeSet,
  canTransitionDecision,
  canTransitionHandoff,
  getRequiredSourceArtifactKind,
  isArtifactStale,
  isValidArtifactSource,
} from '@/lib/planning/state-machine'

describe('planning state machine', () => {
  it('defines the immutable source chain', () => {
    expect(getRequiredSourceArtifactKind('architecture')).toBeNull()
    expect(getRequiredSourceArtifactKind('work_plan')).toBe('architecture')
    expect(getRequiredSourceArtifactKind('execution_handoff')).toBe('work_plan')
    expect(isValidArtifactSource('work_plan', 'architecture')).toBe(true)
    expect(isValidArtifactSource('execution_handoff', 'architecture')).toBe(false)
  })

  it('allows only durable handoff lifecycle transitions', () => {
    expect(canTransitionHandoff('pending', 'running')).toBe(true)
    expect(canTransitionHandoff('running', 'complete')).toBe(true)
    expect(canTransitionHandoff('failed', 'pending')).toBe(true)
    expect(canTransitionHandoff('complete', 'running')).toBe(false)
  })

  it('only permits a finalized change set to be undone once', () => {
    expect(canTransitionChangeSet('completed', 'undone')).toBe(true)
    expect(canTransitionChangeSet('partial', 'undone')).toBe(true)
    expect(canTransitionChangeSet('undone', 'completed')).toBe(false)
  })

  it('keeps decisions append-only by superseding rather than reopening', () => {
    expect(canTransitionDecision('proposed', 'accepted')).toBe(true)
    expect(canTransitionDecision('accepted', 'superseded')).toBe(true)
    expect(canTransitionDecision('rejected', 'proposed')).toBe(false)
  })

  it('marks downstream artifacts stale only when their exact source changes', () => {
    expect(
      isArtifactStale({
        artifactKind: 'work_plan',
        sourceVersionId: 'architecture-v1',
        activeSourceVersionId: 'architecture-v1',
      }),
    ).toBe(false)
    expect(
      isArtifactStale({
        artifactKind: 'work_plan',
        sourceVersionId: 'architecture-v1',
        activeSourceVersionId: 'architecture-v2',
      }),
    ).toBe(true)
  })
})
