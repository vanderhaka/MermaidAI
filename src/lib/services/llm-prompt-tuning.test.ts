import { describe, expect, it } from 'vitest'

import {
  buildPromptTuningPolicy,
  buildScopeDiscoveryTuningPolicy,
  evaluatePromptSimulation,
  evaluateScopeDiscoverySimulation,
  PROMPT_TUNING_MAX_ITERATION,
  SCOPE_DISCOVERY_TUNING_MAX_ITERATION,
  type PromptSimulationObservation,
  type ScopeDiscoverySimulationObservation,
} from '@/lib/services/llm-prompt-tuning'

describe('prompt tuning evaluator', () => {
  const passingObservation: PromptSimulationObservation = {
    id: 'known-pass',
    intentCorrect: true,
    toolSequenceCorrect: true,
    stateSafetyCorrect: true,
    conversationCorrect: true,
  }

  it('calibrates a known good policy and behavior to a perfect score', () => {
    expect(
      evaluatePromptSimulation(
        [passingObservation],
        buildPromptTuningPolicy(PROMPT_TUNING_MAX_ITERATION),
      ),
    ).toEqual({
      criteria: { C1: 100, C2: 100, C3: 100, C4: 100, C5: 100 },
      weightedScore: 100,
    })
  })

  it('separates a deliberately bad control from the known good case', () => {
    const failingObservation: PromptSimulationObservation = {
      id: 'known-fail',
      intentCorrect: false,
      toolSequenceCorrect: false,
      stateSafetyCorrect: false,
      conversationCorrect: false,
    }

    expect(evaluatePromptSimulation([failingObservation], '')).toEqual({
      criteria: { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0 },
      weightedScore: 0,
    })
  })

  it('penalizes duplicate and universal-mutation rules even when marker coverage is intact', () => {
    const validPolicy = buildPromptTuningPolicy(PROMPT_TUNING_MAX_ITERATION)
    const conflictingPolicy = `${validPolicy}\n21. Every response must use a tool and build.\n22. Every response must use a tool and build.`

    expect(evaluatePromptSimulation([passingObservation], validPolicy).criteria.C5).toBe(100)
    expect(
      evaluatePromptSimulation([passingObservation], conflictingPolicy).criteria.C5,
    ).toBeLessThan(100)
  })

  it('excludes scenarios without a conversation assertion from C4', () => {
    expect(
      evaluatePromptSimulation(
        [passingObservation, { ...passingObservation, id: 'tool-only', conversationCorrect: null }],
        buildPromptTuningPolicy(PROMPT_TUNING_MAX_ITERATION),
      ).criteria.C4,
    ).toBe(100)
  })

  it('rejects iterations outside the frozen range', () => {
    expect(() => buildPromptTuningPolicy(-1)).toThrow(/0 through 20/)
    expect(() => buildPromptTuningPolicy(21)).toThrow(/0 through 20/)
  })
})

describe('Quick Capture discovery tuning evaluator', () => {
  const knownPass: ScopeDiscoverySimulationObservation = {
    id: 'known-pass',
    earlyDiscoveryCorrect: true,
    groundedCorrect: true,
    buildTimingCorrect: true,
    conversationCorrect: true,
    preservationCorrect: true,
  }

  it('calibrates a known pass to 100', () => {
    expect(evaluateScopeDiscoverySimulation([knownPass])).toEqual({
      criteria: { C1: 100, C2: 100, C3: 100, C4: 100, C5: 100 },
      weightedScore: 100,
    })
  })

  it('separates the known failure pattern from a passing response', () => {
    const knownFailure: ScopeDiscoverySimulationObservation = {
      id: 'known-failure',
      earlyDiscoveryCorrect: false,
      groundedCorrect: false,
      buildTimingCorrect: false,
      conversationCorrect: false,
      preservationCorrect: false,
    }

    expect(evaluateScopeDiscoverySimulation([knownFailure])).toEqual({
      criteria: { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0 },
      weightedScore: 0,
    })
  })

  it('excludes non-applicable checks from criterion denominators', () => {
    expect(
      evaluateScopeDiscoverySimulation([
        knownPass,
        {
          ...knownPass,
          id: 'discovery-only',
          buildTimingCorrect: null,
          preservationCorrect: null,
        },
      ]),
    ).toEqual({
      criteria: { C1: 100, C2: 100, C3: 100, C4: 100, C5: 100 },
      weightedScore: 100,
    })
  })

  it('builds exactly ten cumulative policy candidates', () => {
    expect(buildScopeDiscoveryTuningPolicy(0)).toBe('')
    expect(buildScopeDiscoveryTuningPolicy(1)).toContain('broad project label')
    expect(buildScopeDiscoveryTuningPolicy(SCOPE_DISCOVERY_TUNING_MAX_ITERATION)).toContain(
      'established canvas',
    )
    expect(() => buildScopeDiscoveryTuningPolicy(-1)).toThrow(/0 through 10/)
    expect(() => buildScopeDiscoveryTuningPolicy(11)).toThrow(/0 through 10/)
  })
})
