import { isDeepStrictEqual } from 'node:util'

import type { PromptMode } from '@/lib/services/prompt-builder'

export const LLM_PROVIDER_BENCHMARK_SUITES = ['core', 'intensive'] as const
export type LLMProviderBenchmarkSuite = (typeof LLM_PROVIDER_BENCHMARK_SUITES)[number]

export const LLM_PROVIDER_BENCHMARK_CONDITIONS = [
  'gemini-low',
  'gemini-medium',
  'gemini-high',
  'codex',
] as const
export type LLMProviderBenchmarkConditionId = (typeof LLM_PROVIDER_BENCHMARK_CONDITIONS)[number]
export type LLMProviderBenchmarkProvider = 'gemini' | 'codex'
export type GeminiBenchmarkThinkingLevel = 'low' | 'medium' | 'high'

export type LLMProviderBenchmarkCondition = {
  id: LLMProviderBenchmarkConditionId
  provider: LLMProviderBenchmarkProvider
  thinkingLevel?: GeminiBenchmarkThinkingLevel
}

export const BENCHMARK_CONDITIONS: Record<
  LLMProviderBenchmarkConditionId,
  LLMProviderBenchmarkCondition
> = {
  'gemini-low': { id: 'gemini-low', provider: 'gemini', thinkingLevel: 'low' },
  'gemini-medium': { id: 'gemini-medium', provider: 'gemini', thinkingLevel: 'medium' },
  'gemini-high': { id: 'gemini-high', provider: 'gemini', thinkingLevel: 'high' },
  codex: { id: 'codex', provider: 'codex' },
}

export type LLMProviderBenchmarkFixture = {
  id: string
  name: string
  mode: PromptMode
  stagedArchitecture?: boolean
  toolName: string
  prompt: string
  expectedInput: Record<string, unknown>
}

export type BenchmarkToolCall = {
  name: string
  input: Record<string, unknown>
}

export type BenchmarkFailure =
  | 'pass'
  | 'missing_tool_call'
  | 'wrong_tool'
  | 'wrong_input'
  | 'duplicate_tool_call'
  | 'wrong_completion'
  | 'provider_error'
  | 'timeout'

export type LLMProviderBenchmarkResult = {
  conditionId: LLMProviderBenchmarkConditionId
  provider: LLMProviderBenchmarkProvider
  run: number
  fixture: string
  exact: boolean
  failure: BenchmarkFailure
  firstEventMs: number | null
  completeMs: number
}

export type BenchmarkLatencySummary = {
  count: number
  min: number | null
  mean: number | null
  p50: number | null
  p95: number | null
  max: number | null
}

export type LLMProviderBenchmarkSummary = {
  condition: LLMProviderBenchmarkCondition
  model: string
  measuredRuns: number
  warmupRuns: number
  fixtureCount: number
  attempts: number
  exact: number
  exactAccuracyPercent: number
  failures: Record<BenchmarkFailure, number>
  timeToFirstEventMs: BenchmarkLatencySummary
  timeToCompletionMs: BenchmarkLatencySummary
  results: LLMProviderBenchmarkResult[]
}

export type LLMProviderBenchmarkRequestBudget = {
  fixtureAttempts: number
  nominalProviderRequests: number
  maximumProviderRequests: number
}

export async function drainBenchmarkStreamWithinDeadline({
  createStream,
  timeoutMs,
  onChunk,
  onTimeout,
}: {
  createStream: () => Promise<ReadableStream<string>>
  timeoutMs: number
  onChunk: (value: string) => void
  onTimeout: () => void
}): Promise<{ timedOut: boolean }> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('Benchmark stream timeout must be a positive integer')
  }

  const state: { reader: ReadableStreamDefaultReader<string> | null } = { reader: null }
  let timedOut = false
  let timeout: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<'timeout'>((resolve) => {
    timeout = setTimeout(() => {
      timedOut = true
      onTimeout()
      if (state.reader) void state.reader.cancel().catch(() => undefined)
      resolve('timeout')
    }, timeoutMs)
  })
  const drain = (async () => {
    const stream = await createStream()
    state.reader = stream.getReader()

    if (timedOut) {
      void state.reader.cancel().catch(() => undefined)
      return
    }

    while (true) {
      const { value, done } = await state.reader.read()
      if (done || timedOut) return
      if (value) onChunk(value)
    }
  })()

  try {
    const outcome = await Promise.race([drain.then(() => 'complete' as const), deadline])
    if (outcome === 'timeout') {
      // The native provider timeout and abort signal should settle this work.
      // Do not await a non-compliant stream here: this runner deadline exists
      // specifically to keep the benchmark bounded when they do not.
      void drain.catch(() => undefined)
      return { timedOut: true }
    }

    return { timedOut: false }
  } finally {
    if (timeout) clearTimeout(timeout)
    if (!timedOut && state.reader) state.reader.releaseLock()
  }
}

export type LLMProviderBenchmarkComparison = {
  candidateConditionId: LLMProviderBenchmarkConditionId
  baselineConditionId: LLMProviderBenchmarkConditionId
  exactAccuracyPointDelta: number
  p95CompleteMsDelta: number | null
  p95CompletePercentDelta: number | null
}

const CORE_FIXTURES: LLMProviderBenchmarkFixture[] = [
  {
    id: 'create-module-complete',
    name: 'create module with optional fields',
    mode: 'discovery',
    toolName: 'create_module',
    prompt:
      'Create exactly one module with these exact values: name "Billing", domain "Subscriptions", description "Handles subscription lifecycle.", entry_points ["checkout_completed", "billing_portal"], and exit_points ["entitlement_updated", "payment_failed"].',
    expectedInput: {
      name: 'Billing',
      domain: 'Subscriptions',
      description: 'Handles subscription lifecycle.',
      entry_points: ['checkout_completed', 'billing_portal'],
      exit_points: ['entitlement_updated', 'payment_failed'],
    },
  },
  {
    id: 'update-module-complete',
    name: 'update module with replacement lists',
    mode: 'discovery',
    toolName: 'update_module',
    prompt:
      'Update exactly one module with these exact values: moduleId "module-42", domain "Revenue", name "Billing Core", description "Owns renewal and cancellation rules.", entry_points ["payment_webhook"], and exit_points ["entitlement_changed"].',
    expectedInput: {
      moduleId: 'module-42',
      domain: 'Revenue',
      name: 'Billing Core',
      description: 'Owns renewal and cancellation rules.',
      entry_points: ['payment_webhook'],
      exit_points: ['entitlement_changed'],
    },
  },
  {
    id: 'delete-module',
    name: 'delete module by exact id',
    mode: 'discovery',
    toolName: 'delete_module',
    prompt: 'Delete exactly one module. Its moduleId must be "module-retired".',
    expectedInput: { moduleId: 'module-retired' },
  },
  {
    id: 'connect-modules',
    name: 'connect modules with directional ports',
    mode: 'discovery',
    toolName: 'connect_modules',
    prompt:
      'Connect exactly one pair of modules with these exact values: sourceModuleId "checkout", targetModuleId "billing", sourceExitPoint "payment_confirmed", and targetEntryPoint "charge_request".',
    expectedInput: {
      sourceModuleId: 'checkout',
      targetModuleId: 'billing',
      sourceExitPoint: 'payment_confirmed',
      targetEntryPoint: 'charge_request',
    },
  },
  {
    id: 'create-node-pseudocode',
    name: 'create node with literal pseudocode',
    mode: 'discovery',
    toolName: 'create_node',
    prompt:
      'Create exactly one node with moduleId "billing-module", label "Check entitlement", nodeType "decision", and this literal pseudocode string: "// file: src/lib/billing/entitlements.ts\\nreturn subscription.status === \'active\'".',
    expectedInput: {
      moduleId: 'billing-module',
      label: 'Check entitlement',
      nodeType: 'decision',
      pseudocode:
        "// file: src/lib/billing/entitlements.ts\nreturn subscription.status === 'active'",
    },
  },
  {
    id: 'update-node-complete',
    name: 'update node with new content',
    mode: 'discovery',
    toolName: 'update_node',
    prompt:
      'Update exactly one node with nodeId "node-7", label "Retry payment", nodeType "process", and pseudocode "retryCharge(invoiceId)".',
    expectedInput: {
      nodeId: 'node-7',
      label: 'Retry payment',
      nodeType: 'process',
      pseudocode: 'retryCharge(invoiceId)',
    },
  },
  {
    id: 'delete-node',
    name: 'delete node by exact id',
    mode: 'discovery',
    toolName: 'delete_node',
    prompt: 'Delete exactly one node. Its nodeId must be "node-legacy".',
    expectedInput: { nodeId: 'node-legacy' },
  },
  {
    id: 'create-edge-complete',
    name: 'create edge with label and condition',
    mode: 'discovery',
    toolName: 'create_edge',
    prompt:
      'Create exactly one edge with moduleId "billing-module", sourceNodeId "node-check", targetNodeId "node-retry", label "retry", and condition "payment_failed".',
    expectedInput: {
      moduleId: 'billing-module',
      sourceNodeId: 'node-check',
      targetNodeId: 'node-retry',
      label: 'retry',
      condition: 'payment_failed',
    },
  },
  {
    id: 'update-edge-complete',
    name: 'update edge label and condition',
    mode: 'discovery',
    toolName: 'update_edge',
    prompt:
      'Update exactly one edge with edgeId "edge-31", label "approved", and condition "risk_score < 0.4".',
    expectedInput: {
      edgeId: 'edge-31',
      label: 'approved',
      condition: 'risk_score < 0.4',
    },
  },
  {
    id: 'delete-edge',
    name: 'delete edge by exact id',
    mode: 'discovery',
    toolName: 'delete_edge',
    prompt: 'Delete exactly one edge. Its edgeId must be "edge-obsolete".',
    expectedInput: { edgeId: 'edge-obsolete' },
  },
]

const INTENSIVE_FIXTURES: LLMProviderBenchmarkFixture[] = [
  {
    id: 'insert-node-between',
    name: 'insert node atomically between two nodes',
    mode: 'scope_build',
    toolName: 'insert_node_between',
    prompt:
      'Insert exactly one node between existing nodes with moduleId "checkout-module", sourceNodeId "node-validate", targetNodeId "node-charge", label "Apply promotion", nodeType "process", pseudocode "applyPromotion(cart)", incomingEdgeLabel "valid", and outgoingEdgeLabel "discounted".',
    expectedInput: {
      moduleId: 'checkout-module',
      sourceNodeId: 'node-validate',
      targetNodeId: 'node-charge',
      label: 'Apply promotion',
      nodeType: 'process',
      pseudocode: 'applyPromotion(cart)',
      incomingEdgeLabel: 'valid',
      outgoingEdgeLabel: 'discounted',
    },
  },
  {
    id: 'capture-scope-flow',
    name: 'capture a dependency-safe scope flow batch',
    mode: 'scope_build',
    toolName: 'capture_scope_flow',
    prompt:
      'Capture exactly one scope flow with moduleId "scope-7". Nodes, in order, are [{key:"start",label:"Start checkout",nodeType:"start"},{key:"validate",label:"Validate cart",nodeType:"process"},{key:"end",label:"Show confirmation",nodeType:"end"}]. Edges, in order, are [{source:"start",target:"validate",label:"submit"},{source:"validate",target:"end",condition:"valid"}]. Questions is exactly [{section:"Payments",question:"Which payment providers are supported?",relatedNode:"validate"}].',
    expectedInput: {
      moduleId: 'scope-7',
      nodes: [
        { key: 'start', label: 'Start checkout', nodeType: 'start' },
        { key: 'validate', label: 'Validate cart', nodeType: 'process' },
        { key: 'end', label: 'Show confirmation', nodeType: 'end' },
      ],
      edges: [
        { source: 'start', target: 'validate', label: 'submit' },
        { source: 'validate', target: 'end', condition: 'valid' },
      ],
      questions: [
        {
          section: 'Payments',
          question: 'Which payment providers are supported?',
          relatedNode: 'validate',
        },
      ],
    },
  },
  {
    id: 'capture-architecture-map',
    name: 'capture an atomic architecture map',
    mode: 'module_map',
    stagedArchitecture: true,
    toolName: 'capture_architecture_map',
    prompt:
      'Capture exactly one architecture map. objective is "Let customers manage subscriptions.". outcomes are ["Customer starts a subscription","Customer can cancel a subscription"]. actors are ["Customer","Support agent"]. modules is [{key:"billing",name:"Billing",domain:"Subscriptions",purpose:"Manages subscription lifecycle.",responsibilities:["Create subscriptions","Cancel subscriptions"],boundaries:["Does not process card payments"],entryPoints:["checkout_completed"],exitPoints:["entitlement_updated"]}]. connections is []. importantFlows is [{key:"subscribe",actor:"Customer",outcome:"Customer starts a subscription",capabilityKeys:["billing"]}]. assumptions is [{category:"Payments",statement:"A payment provider exists."}]. questions is [{section:"Payments",question:"Which payment provider is used?",readinessImpact:"blocking",relatedModuleKey:"billing"}].',
    expectedInput: {
      objective: 'Let customers manage subscriptions.',
      outcomes: ['Customer starts a subscription', 'Customer can cancel a subscription'],
      actors: ['Customer', 'Support agent'],
      modules: [
        {
          key: 'billing',
          name: 'Billing',
          domain: 'Subscriptions',
          purpose: 'Manages subscription lifecycle.',
          responsibilities: ['Create subscriptions', 'Cancel subscriptions'],
          boundaries: ['Does not process card payments'],
          entryPoints: ['checkout_completed'],
          exitPoints: ['entitlement_updated'],
        },
      ],
      connections: [],
      importantFlows: [
        {
          key: 'subscribe',
          actor: 'Customer',
          outcome: 'Customer starts a subscription',
          capabilityKeys: ['billing'],
        },
      ],
      assumptions: [{ category: 'Payments', statement: 'A payment provider exists.' }],
      questions: [
        {
          section: 'Payments',
          question: 'Which payment provider is used?',
          readinessImpact: 'blocking',
          relatedModuleKey: 'billing',
        },
      ],
    },
  },
  {
    id: 'refine-architecture-flow',
    name: 'refine an architecture flow with mixed operations',
    mode: 'module_detail',
    stagedArchitecture: true,
    toolName: 'refine_architecture_flow',
    prompt:
      'Refine exactly one architecture flow with moduleId "billing-module". createNodes is [{key:"check-entitlement",label:"Check entitlement",nodeType:"decision",pseudocode:"isEntitled(customerId)"}]. updateNodes is [{nodeId:"node-retry",label:"Retry payment",nodeType:"process",pseudocode:"retryCharge(invoiceId)"}]. deleteNodeIds is ["node-legacy"]. createEdges is [{source:"check-entitlement",target:"node-retry",label:"no",condition:"inactive"}]. updateEdges is [{edgeId:"edge-old",label:"yes",condition:"active"}]. deleteEdgeIds is ["edge-legacy"].',
    expectedInput: {
      moduleId: 'billing-module',
      createNodes: [
        {
          key: 'check-entitlement',
          label: 'Check entitlement',
          nodeType: 'decision',
          pseudocode: 'isEntitled(customerId)',
        },
      ],
      updateNodes: [
        {
          nodeId: 'node-retry',
          label: 'Retry payment',
          nodeType: 'process',
          pseudocode: 'retryCharge(invoiceId)',
        },
      ],
      deleteNodeIds: ['node-legacy'],
      createEdges: [
        {
          source: 'check-entitlement',
          target: 'node-retry',
          label: 'no',
          condition: 'inactive',
        },
      ],
      updateEdges: [{ edgeId: 'edge-old', label: 'yes', condition: 'active' }],
      deleteEdgeIds: ['edge-legacy'],
    },
  },
]

export function getBenchmarkFixtures(
  suite: LLMProviderBenchmarkSuite,
): LLMProviderBenchmarkFixture[] {
  return suite === 'intensive' ? [...CORE_FIXTURES, ...INTENSIVE_FIXTURES] : [...CORE_FIXTURES]
}

export function assessBenchmarkResult({
  fixture,
  calls,
  completionText,
  timedOut,
  providerError,
}: {
  fixture: LLMProviderBenchmarkFixture
  calls: BenchmarkToolCall[]
  completionText: string
  timedOut: boolean
  providerError: boolean
}): Pick<LLMProviderBenchmarkResult, 'exact' | 'failure'> {
  if (timedOut) return { exact: false, failure: 'timeout' }
  if (providerError) return { exact: false, failure: 'provider_error' }
  if (calls.length === 0) return { exact: false, failure: 'missing_tool_call' }
  if (calls.length > 1) return { exact: false, failure: 'duplicate_tool_call' }
  if (calls[0]?.name !== fixture.toolName) return { exact: false, failure: 'wrong_tool' }
  if (!isDeepStrictEqual(calls[0]?.input, fixture.expectedInput)) {
    return { exact: false, failure: 'wrong_input' }
  }
  if (completionText.trim() !== 'Done.') return { exact: false, failure: 'wrong_completion' }
  return { exact: true, failure: 'pass' }
}

export function summarizeLatency(values: number[]): BenchmarkLatencySummary {
  if (values.length === 0) {
    return { count: 0, min: null, mean: null, p50: null, p95: null, max: null }
  }

  const sorted = [...values].sort((left, right) => left - right)
  const percentile = (fraction: number): number => {
    const position = (sorted.length - 1) * fraction
    const lowerIndex = Math.floor(position)
    const upperIndex = Math.ceil(position)
    const lower = sorted[lowerIndex] ?? 0
    const upper = sorted[upperIndex] ?? lower
    return Math.round(lower + (upper - lower) * (position - lowerIndex))
  }

  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    mean: Math.round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1) ?? null,
  }
}

export function summarizeBenchmarkResults({
  condition,
  model,
  measuredRuns,
  warmupRuns,
  fixtureCount,
  results,
}: {
  condition: LLMProviderBenchmarkCondition
  model: string
  measuredRuns: number
  warmupRuns: number
  fixtureCount: number
  results: LLMProviderBenchmarkResult[]
}): LLMProviderBenchmarkSummary {
  const failures: Record<BenchmarkFailure, number> = {
    pass: 0,
    missing_tool_call: 0,
    wrong_tool: 0,
    wrong_input: 0,
    duplicate_tool_call: 0,
    wrong_completion: 0,
    provider_error: 0,
    timeout: 0,
  }

  for (const result of results) failures[result.failure] += 1

  const exact = failures.pass
  const successfulResults = results.filter(
    (result) => result.failure !== 'provider_error' && result.failure !== 'timeout',
  )

  return {
    condition,
    model,
    measuredRuns,
    warmupRuns,
    fixtureCount,
    attempts: results.length,
    exact,
    exactAccuracyPercent:
      results.length === 0 ? 0 : Math.round((exact / results.length) * 10_000) / 100,
    failures,
    timeToFirstEventMs: summarizeLatency(
      successfulResults.flatMap((result) =>
        result.firstEventMs === null ? [] : [result.firstEventMs],
      ),
    ),
    timeToCompletionMs: summarizeLatency(successfulResults.map((result) => result.completeMs)),
    results,
  }
}

export function compareBenchmarkSummaries(
  candidate: LLMProviderBenchmarkSummary,
  baseline: LLMProviderBenchmarkSummary,
): LLMProviderBenchmarkComparison {
  const candidateP95 = candidate.timeToCompletionMs.p95
  const baselineP95 = baseline.timeToCompletionMs.p95
  const p95CompleteMsDelta =
    candidateP95 === null || baselineP95 === null ? null : candidateP95 - baselineP95

  return {
    candidateConditionId: candidate.condition.id,
    baselineConditionId: baseline.condition.id,
    exactAccuracyPointDelta:
      Math.round((candidate.exactAccuracyPercent - baseline.exactAccuracyPercent) * 100) / 100,
    p95CompleteMsDelta,
    p95CompletePercentDelta:
      p95CompleteMsDelta === null || baselineP95 === null || baselineP95 === 0
        ? null
        : Math.round((p95CompleteMsDelta / baselineP95) * 10_000) / 100,
  }
}

export function calculateBenchmarkRequestBudget({
  conditionCount,
  fixtureCount,
  measuredRuns,
  warmupRuns,
}: {
  conditionCount: number
  fixtureCount: number
  measuredRuns: number
  warmupRuns: number
}): LLMProviderBenchmarkRequestBudget {
  const fixtureAttempts = conditionCount * fixtureCount * (measuredRuns + warmupRuns)

  return {
    fixtureAttempts,
    // A correct tool loop normally needs a tool-call request followed by one
    // response request. The harness can force at most one additional nudge.
    nominalProviderRequests: fixtureAttempts * 2,
    maximumProviderRequests: fixtureAttempts * 3,
  }
}
