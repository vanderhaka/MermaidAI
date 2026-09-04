// @vitest-environment node
import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'

import {
  buildScopeDiscoveryTuningPolicy,
  evaluateScopeDiscoverySimulation,
  SCOPE_DISCOVERY_TUNING_MAX_ITERATION,
  type ScopeDiscoverySimulationObservation,
} from '@/lib/services/llm-prompt-tuning'
import { buildSystemPrompt, type PromptContext } from '@/lib/services/prompt-builder'
import { drainBenchmarkStreamWithinDeadline } from '@/lib/services/llm-provider-benchmark'
import { TOOL_EVENT_DELIMITER } from '@/lib/services/llm-shared'
import type { FlowEdge, FlowNode, Module } from '@/types/graph'

vi.mock('server-only', () => ({}))

const LIVE_ENABLED = process.env.RUN_SCOPE_DISCOVERY_TUNING === '1'
const DEFAULT_TIMEOUT_MS = 45_000
const MAX_PROVIDER_REQUESTS_PER_RUN = 20
const TOOL_EVENT_PATTERN = new RegExp(`${TOOL_EVENT_DELIMITER}[^\n]*(?:\n|$)`, 'g')
const FIXTURE_TIME = '2026-09-04T00:00:00.000Z'

type RecordedToolCall = {
  name: string
  input: Record<string, unknown>
}

type ConversationRule =
  | { kind: 'purpose-options'; topic: RegExp }
  | { kind: 'one-question'; topic: RegExp }
  | { kind: 'at-most-one' }
  | null

type DiscoveryScenario = {
  id: string
  context: PromptContext
  messages: Anthropic.MessageParam[]
  expectedCalls: string[]
  earlyDiscoveryExpected: boolean | null
  buildTimingExpected: boolean | null
  preservationExpected: boolean | null
  conversationRule: ConversationRule
  forbiddenGrounding: RegExp
  validateInputs: (calls: RecordedToolCall[]) => boolean
}

function moduleFixture(overrides: Partial<Module> = {}): Module {
  return {
    id: 'module-scope',
    project_id: 'project-simulation',
    domain: 'Quoting',
    name: 'Quick Capture',
    description: 'Captures a quoting flow.',
    prd_content: '',
    position: { x: 0, y: 0 },
    color: '#111827',
    entry_points: [],
    exit_points: [],
    created_at: FIXTURE_TIME,
    updated_at: FIXTURE_TIME,
    ...overrides,
  }
}

function nodeFixture(overrides: Partial<FlowNode>): FlowNode {
  return {
    id: 'node-subtotal',
    module_id: 'module-scope',
    node_type: 'process',
    label: 'Calculate subtotal',
    pseudocode: '',
    position: { x: 0, y: 0 },
    color: '#2563eb',
    created_at: FIXTURE_TIME,
    updated_at: FIXTURE_TIME,
    ...overrides,
  }
}

function edgeFixture(overrides: Partial<FlowEdge>): FlowEdge {
  return {
    id: 'edge-subtotal-total',
    module_id: 'module-scope',
    source_node_id: 'node-subtotal',
    target_node_id: 'node-total',
    label: null,
    condition: null,
    created_at: FIXTURE_TIME,
    ...overrides,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function noCalls(calls: RecordedToolCall[]): boolean {
  return calls.length === 0
}

function validateMinimalQuoteCapture(calls: RecordedToolCall[]): boolean {
  if (
    calls.length !== 2 ||
    calls[0]?.name !== 'capture_scope_flow' ||
    calls[1]?.name !== 'write_prd'
  ) {
    return false
  }

  const capture = calls[0].input
  const nodes = capture.nodes
  const edges = capture.edges
  const questions = capture.questions
  const serialized = JSON.stringify(calls).toLowerCase()

  return (
    capture.moduleId === 'module-scope' &&
    Array.isArray(nodes) &&
    nodes.length >= 3 &&
    nodes.length <= 7 &&
    Array.isArray(edges) &&
    edges.length >= 2 &&
    Array.isArray(questions) &&
    questions.length <= 1 &&
    calls[1].input.moduleId === 'module-scope' &&
    /square metre|square meter|m²|sqm/.test(serialized) &&
    /door/.test(serialized) &&
    /window/.test(serialized) &&
    /quote|estimate|total/.test(serialized)
  )
}

function validateConcreteQuoteCapture(calls: RecordedToolCall[]): boolean {
  if (!validateMinimalQuoteCapture(calls)) return false
  const serialized = JSON.stringify(calls).toLowerCase()
  return /gst/.test(serialized) && /subtotal/.test(serialized) && /rate/.test(serialized)
}

function validateExactGstInsertion(calls: RecordedToolCall[]): boolean {
  if (calls.length !== 1 || calls[0]?.name !== 'insert_node_between') {
    return false
  }

  const insertion = calls[0].input
  return (
    insertion.moduleId === 'module-scope' &&
    insertion.sourceNodeId === 'node-subtotal' &&
    insertion.targetNodeId === 'node-total' &&
    typeof insertion.label === 'string' &&
    /gst/i.test(insertion.label)
  )
}

const basePaintingContext: PromptContext = {
  projectName: 'House Painting Quotes',
  currentModule: moduleFixture(),
  nodes: [],
  edges: [],
  openQuestions: [],
  helperMode: true,
}

const unrelatedPaintingScope =
  /contractor|credential|background check|schedul|availability|booking|login|authentication|portal|insurance|payment|payout/i

const TRAINING_SCENARIOS: DiscoveryScenario[] = [
  {
    id: 'painting-broad-first-turn',
    context: basePaintingContext,
    messages: [{ role: 'user', content: 'Create a house painting quoting system.' }],
    expectedCalls: [],
    earlyDiscoveryExpected: true,
    buildTimingExpected: null,
    preservationExpected: null,
    conversationRule: {
      kind: 'purpose-options',
      topic: /quote|estimate|result|output|use/i,
    },
    forbiddenGrounding: unrelatedPaintingScope,
    validateInputs: noCalls,
  },
  {
    id: 'painting-role-is-not-purpose',
    context: basePaintingContext,
    messages: [
      { role: 'user', content: 'Create a house painting quoting system.' },
      {
        role: 'assistant',
        content:
          'Who should use the first version?\n\nOptions:\n1. Office admin (Recommended)\n2. Homeowner\n3. Estimator',
      },
      { role: 'user', content: 'Admin.' },
    ],
    expectedCalls: [],
    earlyDiscoveryExpected: true,
    buildTimingExpected: null,
    preservationExpected: null,
    conversationRule: {
      kind: 'purpose-options',
      topic: /quote|estimate|price|calculate|produce|result/i,
    },
    forbiddenGrounding: unrelatedPaintingScope,
    validateInputs: noCalls,
  },
  {
    id: 'painting-rejected-contractor-boundary',
    context: basePaintingContext,
    messages: [
      { role: 'user', content: 'Create a house painting quoting system.' },
      { role: 'assistant', content: 'Who should use it?' },
      { role: 'user', content: 'Admin.' },
      {
        role: 'assistant',
        content: 'How should the admin verify contractor credentials?',
      },
      { role: 'user', content: 'No contractor details.' },
    ],
    expectedCalls: [],
    earlyDiscoveryExpected: true,
    buildTimingExpected: null,
    preservationExpected: null,
    conversationRule: {
      kind: 'purpose-options',
      topic: /quote|estimate|price|calculate|measure|result/i,
    },
    forbiddenGrounding: unrelatedPaintingScope,
    validateInputs: noCalls,
  },
  {
    id: 'painting-purpose-needs-pricing-rule',
    context: basePaintingContext,
    messages: [
      { role: 'user', content: 'Create a house painting quoting system.' },
      {
        role: 'assistant',
        content: 'What should the first version produce?',
      },
      {
        role: 'user',
        content: 'An admin enters measurements and gets an itemised customer quote.',
      },
    ],
    expectedCalls: [],
    earlyDiscoveryExpected: true,
    buildTimingExpected: null,
    preservationExpected: null,
    conversationRule: {
      kind: 'purpose-options',
      topic: /price|rate|measure|square|calculate|item/i,
    },
    forbiddenGrounding: unrelatedPaintingScope,
    validateInputs: noCalls,
  },
  {
    id: 'painting-ready-for-minimal-draft',
    context: basePaintingContext,
    messages: [
      { role: 'user', content: 'Create a house painting quoting system.' },
      { role: 'assistant', content: 'What should it produce?' },
      {
        role: 'user',
        content: 'An admin enters measurements and gets an itemised customer quote. Quoting only.',
      },
      { role: 'assistant', content: 'How is the painting price calculated?' },
      {
        role: 'user',
        content: 'Square metre for flat surfaces, each for doors and windows.',
      },
    ],
    expectedCalls: ['capture_scope_flow', 'write_prd'],
    earlyDiscoveryExpected: null,
    buildTimingExpected: true,
    preservationExpected: null,
    conversationRule: null,
    forbiddenGrounding: unrelatedPaintingScope,
    validateInputs: validateMinimalQuoteCapture,
  },
  {
    id: 'painting-concrete-first-turn-builds',
    context: basePaintingContext,
    messages: [
      {
        role: 'user',
        content:
          'Build the flow now: an admin enters wall area in square metres and door and window counts, the system applies configured per-square-metre and per-item rates, then shows subtotal, GST, and total. Quoting only.',
      },
    ],
    expectedCalls: ['capture_scope_flow', 'write_prd'],
    earlyDiscoveryExpected: null,
    buildTimingExpected: true,
    preservationExpected: true,
    conversationRule: null,
    forbiddenGrounding: unrelatedPaintingScope,
    validateInputs: validateConcreteQuoteCapture,
  },
  {
    id: 'painting-established-exact-change',
    context: {
      ...basePaintingContext,
      nodes: [
        nodeFixture({ id: 'node-subtotal', label: 'Calculate subtotal' }),
        nodeFixture({ id: 'node-total', label: 'Show quote total' }),
      ],
      edges: [edgeFixture({})],
    },
    messages: [
      {
        role: 'user',
        content:
          'Add a GST calculation between Calculate subtotal and Show quote total. Make no other changes.',
      },
    ],
    expectedCalls: ['insert_node_between'],
    earlyDiscoveryExpected: null,
    buildTimingExpected: true,
    preservationExpected: true,
    conversationRule: null,
    forbiddenGrounding: unrelatedPaintingScope,
    validateInputs: validateExactGstInsertion,
  },
  {
    id: 'painting-quoting-only-correction',
    context: basePaintingContext,
    messages: [
      { role: 'user', content: 'Create a house painting quoting system.' },
      {
        role: 'assistant',
        content: 'What constraints matter when scheduling painting jobs?',
      },
      { role: 'user', content: 'I just want quoting, that is it.' },
    ],
    expectedCalls: [],
    earlyDiscoveryExpected: true,
    buildTimingExpected: null,
    preservationExpected: null,
    conversationRule: {
      kind: 'one-question',
      topic: /quote|estimate|price|rate|measure|include|produce|deliver/i,
    },
    forbiddenGrounding: unrelatedPaintingScope,
    validateInputs: noCalls,
  },
]

const HOLDOUT_SCENARIOS: DiscoveryScenario[] = [
  {
    id: 'landscaping-broad-first-turn',
    context: {
      ...basePaintingContext,
      projectName: 'Landscaping Estimates',
    },
    messages: [{ role: 'user', content: 'Make a landscaping estimate app.' }],
    expectedCalls: [],
    earlyDiscoveryExpected: true,
    buildTimingExpected: null,
    preservationExpected: null,
    conversationRule: {
      kind: 'purpose-options',
      topic: /quote|estimate|result|output|use/i,
    },
    forbiddenGrounding:
      /contractor|credential|background check|schedul|booking|login|portal|payment/i,
    validateInputs: noCalls,
  },
  {
    id: 'landscaping-role-answer-stays-in-discovery',
    context: {
      ...basePaintingContext,
      projectName: 'Landscaping Estimates',
    },
    messages: [
      { role: 'user', content: 'Make a landscaping estimate app.' },
      { role: 'assistant', content: 'Who uses it?' },
      { role: 'user', content: 'Office staff.' },
    ],
    expectedCalls: [],
    earlyDiscoveryExpected: true,
    buildTimingExpected: null,
    preservationExpected: null,
    conversationRule: {
      kind: 'purpose-options',
      topic: /quote|estimate|price|calculate|produce|result/i,
    },
    forbiddenGrounding:
      /contractor|credential|background check|schedul|booking|login|portal|payment/i,
    validateInputs: noCalls,
  },
  {
    id: 'cleaning-ready-for-small-draft',
    context: {
      ...basePaintingContext,
      projectName: 'Pool Cleaning Quotes',
    },
    messages: [
      {
        role: 'user',
        content:
          'An office admin needs a quote only. They enter pool size and choose standard or deep cleaning. Charge a configured base rate by size plus the cleaning-type surcharge, then show the total.',
      },
    ],
    expectedCalls: ['capture_scope_flow', 'write_prd'],
    earlyDiscoveryExpected: null,
    buildTimingExpected: true,
    preservationExpected: true,
    conversationRule: null,
    forbiddenGrounding:
      /contractor|credential|background check|schedul|booking|login|portal|payment/i,
    validateInputs: (calls) => {
      if (
        calls.length !== 2 ||
        calls[0]?.name !== 'capture_scope_flow' ||
        calls[1]?.name !== 'write_prd'
      ) {
        return false
      }
      const serialized = JSON.stringify(calls).toLowerCase()
      return (
        /pool/.test(serialized) &&
        /size/.test(serialized) &&
        /standard/.test(serialized) &&
        /deep/.test(serialized) &&
        /surcharge|rate/.test(serialized) &&
        /total|quote/.test(serialized)
      )
    },
  },
  {
    id: 'quote-only-rejects-adjacent-lifecycle',
    context: {
      ...basePaintingContext,
      projectName: 'Roofing Quotes',
    },
    messages: [
      { role: 'user', content: 'Build a roofing quote tool.' },
      { role: 'assistant', content: 'How should jobs be scheduled?' },
      { role: 'user', content: 'No jobs or scheduling. Quote creation only.' },
    ],
    expectedCalls: [],
    earlyDiscoveryExpected: true,
    buildTimingExpected: null,
    preservationExpected: null,
    conversationRule: {
      kind: 'one-question',
      topic: /quote|estimate|price|rate|measure|include|produce/i,
    },
    forbiddenGrounding:
      /contractor|credential|background check|schedul|booking|login|portal|payment/i,
    validateInputs: noCalls,
  },
  {
    id: 'established-quote-exact-change',
    context: {
      ...basePaintingContext,
      projectName: 'Flooring Quotes',
      nodes: [
        nodeFixture({ id: 'node-subtotal', label: 'Calculate subtotal' }),
        nodeFixture({ id: 'node-total', label: 'Show quote total' }),
      ],
      edges: [edgeFixture({})],
    },
    messages: [
      {
        role: 'user',
        content:
          'Insert GST between Calculate subtotal and Show quote total, and change nothing else.',
      },
    ],
    expectedCalls: ['insert_node_between'],
    earlyDiscoveryExpected: null,
    buildTimingExpected: true,
    preservationExpected: true,
    conversationRule: null,
    forbiddenGrounding:
      /contractor|credential|background check|schedul|booking|login|portal|payment/i,
    validateInputs: validateExactGstInsertion,
  },
]

function exactSequence(actual: RecordedToolCall[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((call, index) => call.name === expected[index])
  )
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function hasRecommendedOptions(text: string): boolean {
  const hasOptionsHeading = /^\s*(?:\*\*)?options\s*:(?:\*\*)?\s*$/im.test(text)
  const options = text.split('\n').filter((line) => /^\s*(?:\d+[.)]|[-*])\s+\S/.test(line))
  const recommended = options.filter((line) => /\(recommended\)\s*$/i.test(line))
  return hasOptionsHeading && options.length >= 2 && options.length <= 3 && recommended.length === 1
}

function conversationMatches(rule: ConversationRule, text: string): boolean | null {
  if (!rule) return null
  const questions = text.match(/\?/g)?.length ?? 0
  const concise = wordCount(text) > 0 && wordCount(text) <= 170
  if (!concise) return false

  switch (rule.kind) {
    case 'purpose-options':
      return questions === 1 && hasRecommendedOptions(text) && rule.topic.test(text)
    case 'one-question':
      return questions === 1 && rule.topic.test(text)
    case 'at-most-one':
      return questions <= 1
  }
}

function resolveRequiredInteger(name: string, maximum: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) throw new Error(`${name} is required for live scope discovery tuning`)
  const value = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}`)
  }
  return value
}

function resolveIteration(): number {
  const raw = process.env.SCOPE_DISCOVERY_TUNING_ITERATION?.trim()
  if (!raw) throw new Error('SCOPE_DISCOVERY_TUNING_ITERATION is required')
  const value = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(value) || value < 0 || value > SCOPE_DISCOVERY_TUNING_MAX_ITERATION) {
    throw new Error(
      `SCOPE_DISCOVERY_TUNING_ITERATION must be from 0 through ${SCOPE_DISCOVERY_TUNING_MAX_ITERATION}`,
    )
  }
  return value
}

function withoutToolEvents(value: string): string {
  return value.replace(TOOL_EVENT_PATTERN, '')
}

describe.skipIf(!LIVE_ENABLED)('live Quick Capture discovery gauntlet', () => {
  it(
    'evaluates one sequential policy candidate without mutating application state',
    async () => {
      const useHoldoutSet = process.env.SCOPE_DISCOVERY_TUNING_SET?.trim() === 'holdout'
      const scenarios = useHoldoutSet ? HOLDOUT_SCENARIOS : TRAINING_SCENARIOS
      const iteration = useHoldoutSet ? SCOPE_DISCOVERY_TUNING_MAX_ITERATION : resolveIteration()
      const maxProviderRequests = resolveRequiredInteger(
        'SCOPE_DISCOVERY_TUNING_MAX_PROVIDER_REQUESTS',
        MAX_PROVIDER_REQUESTS_PER_RUN,
      )
      const policy = buildScopeDiscoveryTuningPolicy(iteration)

      if (process.env.SCOPE_DISCOVERY_TUNING_DRY_RUN === '1') {
        console.log(
          JSON.stringify({
            kind: 'scope-discovery-tuning-preflight',
            set: useHoldoutSet ? 'holdout' : 'training',
            iteration,
            scenarios: scenarios.length,
            maximumProviderRequests: maxProviderRequests,
            applicationMutations: 0,
          }),
        )
        return
      }

      const nativeFetch = globalThis.fetch.bind(globalThis)
      let providerRequests = 0
      vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
        if (providerRequests >= maxProviderRequests) {
          throw new Error('Scope discovery tuning provider request cap reached')
        }
        providerRequests += 1
        return nativeFetch(...args)
      })

      const observations: ScopeDiscoverySimulationObservation[] = []
      const evidence: Array<Record<string, unknown>> = []

      try {
        for (const scenario of scenarios) {
          const calls: RecordedToolCall[] = []
          const abortController = new AbortController()
          let completionText = ''
          let providerError = false
          let timedOut = false
          const startedAt = performance.now()

          try {
            const deadline = await drainBenchmarkStreamWithinDeadline({
              createStream: async () => {
                const { callLLMWithTools } = await import('@/lib/services/llm-client')
                const { getToolsForMode } = await import('@/lib/services/llm-tools')
                const basePrompt = buildSystemPrompt(
                  'scope_build',
                  scenario.context,
                  useHoldoutSet ? {} : { quickCaptureDiscoveryContract: '' },
                )
                const systemPrompt =
                  useHoldoutSet || !policy ? basePrompt : `${basePrompt}\n\n${policy}`

                return callLLMWithTools(
                  systemPrompt,
                  scenario.messages,
                  getToolsForMode('scope_build'),
                  async (name, input) => {
                    calls.push({ name, input })
                    return {
                      content: 'Simulated tool receipt: the requested operation succeeded once.',
                      isError: false,
                      ...(calls.length >= 2
                        ? { terminalText: 'Simulation stopped after the second tool call.' }
                        : {}),
                    }
                  },
                  {
                    provider: 'codex',
                    requestTimeoutMs: DEFAULT_TIMEOUT_MS,
                    signal: abortController.signal,
                  },
                )
              },
              timeoutMs: DEFAULT_TIMEOUT_MS,
              onChunk: (value) => {
                completionText += withoutToolEvents(value)
              },
              onTimeout: () => {
                timedOut = true
                abortController.abort()
              },
            })
            timedOut ||= deadline.timedOut
          } catch {
            providerError = !timedOut
          }

          const healthy = !providerError && !timedOut
          const sequenceCorrect = healthy && exactSequence(calls, scenario.expectedCalls)
          const inputsCorrect = sequenceCorrect && scenario.validateInputs(calls)
          const inspectedText = `${completionText}\n${JSON.stringify(calls)}`
          const groundedCorrect = healthy && !scenario.forbiddenGrounding.test(inspectedText)
          const observation: ScopeDiscoverySimulationObservation = {
            id: scenario.id,
            earlyDiscoveryCorrect:
              scenario.earlyDiscoveryExpected === null
                ? null
                : healthy && calls.length === 0 && inputsCorrect,
            groundedCorrect,
            buildTimingCorrect:
              scenario.buildTimingExpected === null ? null : healthy && inputsCorrect,
            conversationCorrect: healthy
              ? conversationMatches(scenario.conversationRule, completionText)
              : false,
            preservationCorrect:
              scenario.preservationExpected === null ? null : healthy && inputsCorrect,
          }
          observations.push(observation)
          evidence.push({
            calls: calls.map((call) => call.name),
            ...(!inputsCorrect || !groundedCorrect ? { failedCallInputs: calls } : {}),
            ...observation,
            completionText: completionText.trim(),
            providerError,
            timedOut,
            completeMs: Math.round(performance.now() - startedAt),
          })
        }
      } finally {
        vi.unstubAllGlobals()
      }

      const result = evaluateScopeDiscoverySimulation(observations)
      console.log(
        JSON.stringify({
          kind: 'scope-discovery-tuning-result',
          set: useHoldoutSet ? 'holdout' : 'training',
          iteration,
          model: process.env.CODEX_MODEL?.trim() || 'gpt-5.6-luna',
          providerRequests,
          requestCap: maxProviderRequests,
          ...result,
          evidence,
        }),
      )

      expect(observations).toHaveLength(scenarios.length)
      expect(providerRequests).toBeLessThanOrEqual(maxProviderRequests)
      if (useHoldoutSet) {
        expect(result.criteria.C1, 'holdout C1 early discovery gate').toBe(100)
        expect(result.criteria.C2, 'holdout C2 groundedness').toBe(100)
        expect(result.criteria.C3, 'holdout C3 build timing').toBe(100)
        expect(result.criteria.C4, 'holdout C4 conversation quality').toBeGreaterThanOrEqual(90)
        expect(result.criteria.C5, 'holdout C5 mature-flow preservation').toBe(100)
        expect(result.weightedScore, 'holdout weighted quality score').toBeGreaterThanOrEqual(95)
      }
    },
    8 * 60_000,
  )
})
