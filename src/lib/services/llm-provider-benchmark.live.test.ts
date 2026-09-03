// @vitest-environment node
import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'

import {
  BENCHMARK_CONDITIONS,
  LLM_PROVIDER_BENCHMARK_CONDITIONS,
  LLM_PROVIDER_BENCHMARK_SUITES,
  assessBenchmarkResult,
  calculateBenchmarkRequestBudget,
  compareBenchmarkSummaries,
  drainBenchmarkStreamWithinDeadline,
  getBenchmarkFixtures,
  summarizeBenchmarkResults,
  type LLMProviderBenchmarkCondition,
  type LLMProviderBenchmarkConditionId,
  type LLMProviderBenchmarkFixture,
  type LLMProviderBenchmarkResult,
  type LLMProviderBenchmarkSuite,
} from '@/lib/services/llm-provider-benchmark'
import { TOOL_EVENT_DELIMITER } from '@/lib/services/llm-shared'

vi.mock('server-only', () => ({}))

const DEFAULT_SUITE: LLMProviderBenchmarkSuite = 'core'
const DEFAULT_MEASURED_RUNS = 1
const DEFAULT_WARMUP_RUNS = 0
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_RUNS = 10
const MAX_WARMUP_RUNS = 5
const MAX_TIMEOUT_MS = 120_000
const MAX_PROVIDER_REQUESTS = 1_000
const TOOL_EVENT_PATTERN = new RegExp(`${TOOL_EVENT_DELIMITER}[^\\n]*(?:\\n|$)`, 'g')

type BenchmarkConfig = {
  suite: LLMProviderBenchmarkSuite
  conditions: LLMProviderBenchmarkCondition[]
  measuredRuns: number
  warmupRuns: number
  timeoutMs: number
  maxProviderRequests: number
  dryRun: boolean
  minExactAccuracyPercent: number | null
  maxP95CompleteMs: number | null
}

function resolveInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback

  const value = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`)
  }
  return value
}

function resolveRequiredInteger(name: string, minimum: number, maximum: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) throw new Error(`${name} is required for a live benchmark`)

  const value = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}`)
  }
  return value
}

function resolveOptionalNumber(name: string, minimum: number, maximum: number): number | null {
  const raw = process.env[name]?.trim()
  if (!raw) return null

  const value = Number(raw)
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a number from ${minimum} through ${maximum}`)
  }
  return value
}

function resolveSuite(): LLMProviderBenchmarkSuite {
  const raw = process.env.LLM_BENCHMARK_SUITE?.trim() || DEFAULT_SUITE
  if (!LLM_PROVIDER_BENCHMARK_SUITES.includes(raw as LLMProviderBenchmarkSuite)) {
    throw new Error(
      `LLM_BENCHMARK_SUITE must be one of: ${LLM_PROVIDER_BENCHMARK_SUITES.join(', ')}`,
    )
  }
  return raw as LLMProviderBenchmarkSuite
}

function splitRequestedValues(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ]
}

function resolveConditionIds(): LLMProviderBenchmarkConditionId[] {
  const explicitConditions = process.env.LLM_BENCHMARK_CONDITIONS?.trim()
  if (explicitConditions) {
    const values = splitRequestedValues(explicitConditions)
    if (
      values.length === 0 ||
      values.some(
        (value) =>
          !LLM_PROVIDER_BENCHMARK_CONDITIONS.includes(value as LLMProviderBenchmarkConditionId),
      )
    ) {
      throw new Error(
        `LLM_BENCHMARK_CONDITIONS must contain one or more of: ${LLM_PROVIDER_BENCHMARK_CONDITIONS.join(', ')}`,
      )
    }
    return values as LLMProviderBenchmarkConditionId[]
  }

  const legacyProviders = process.env.LLM_BENCHMARK_PROVIDERS?.trim()
  if (legacyProviders) {
    const providers = splitRequestedValues(legacyProviders)
    if (
      providers.length === 0 ||
      providers.some((provider) => provider !== 'gemini' && provider !== 'codex')
    ) {
      throw new Error('LLM_BENCHMARK_PROVIDERS must contain one or both of: gemini, codex')
    }
    return providers.map((provider) => (provider === 'gemini' ? 'gemini-medium' : 'codex'))
  }

  return ['gemini-medium', 'codex']
}

function resolveBenchmarkConfig(): BenchmarkConfig {
  return {
    suite: resolveSuite(),
    conditions: resolveConditionIds().map((conditionId) => BENCHMARK_CONDITIONS[conditionId]),
    measuredRuns: resolveInteger('LLM_BENCHMARK_RUNS', DEFAULT_MEASURED_RUNS, 1, MAX_RUNS),
    warmupRuns: resolveInteger(
      'LLM_BENCHMARK_WARMUP_RUNS',
      DEFAULT_WARMUP_RUNS,
      0,
      MAX_WARMUP_RUNS,
    ),
    timeoutMs: resolveInteger(
      'LLM_BENCHMARK_TIMEOUT_MS',
      DEFAULT_TIMEOUT_MS,
      1_000,
      MAX_TIMEOUT_MS,
    ),
    maxProviderRequests: resolveRequiredInteger(
      'LLM_BENCHMARK_MAX_PROVIDER_REQUESTS',
      1,
      MAX_PROVIDER_REQUESTS,
    ),
    dryRun: process.env.LLM_BENCHMARK_DRY_RUN === '1',
    minExactAccuracyPercent: resolveOptionalNumber(
      'LLM_BENCHMARK_MIN_EXACT_ACCURACY_PERCENT',
      0,
      100,
    ),
    maxP95CompleteMs: resolveOptionalNumber('LLM_BENCHMARK_MAX_P95_COMPLETE_MS', 1, 300_000),
  }
}

function modelFor(condition: LLMProviderBenchmarkCondition): string {
  return condition.provider === 'gemini'
    ? process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash'
    : process.env.CODEX_MODEL?.trim() || 'gpt-5.6-luna'
}

function withoutToolEvents(value: string): string {
  return value.replace(TOOL_EVENT_PATTERN, '')
}

async function resolveFixtureTool(fixture: LLMProviderBenchmarkFixture): Promise<Anthropic.Tool> {
  const { getToolsForMode } = await import('@/lib/services/llm-tools')
  const tool = getToolsForMode(fixture.mode, {
    stagedArchitecture: fixture.stagedArchitecture,
  }).find((candidate) => candidate.name === fixture.toolName)

  if (!tool) {
    throw new Error(`Benchmark fixture ${fixture.id} does not resolve tool ${fixture.toolName}`)
  }
  return tool
}

async function runFixture({
  condition,
  fixture,
  run,
  timeoutMs,
}: {
  condition: LLMProviderBenchmarkCondition
  fixture: LLMProviderBenchmarkFixture
  run: number
  timeoutMs: number
}): Promise<LLMProviderBenchmarkResult> {
  const { callLLMWithTools } = await import('@/lib/services/llm-client')
  const tool = await resolveFixtureTool(fixture)
  const calls: Array<{ name: string; input: Record<string, unknown> }> = []
  const abortController = new AbortController()
  let completionText = ''
  let firstEventMs: number | null = null
  let timedOut = false
  let providerError = false
  const startedAt = performance.now()

  try {
    const deadline = await drainBenchmarkStreamWithinDeadline({
      createStream: () =>
        callLLMWithTools(
          'You are taking a deterministic tool-call benchmark. Use the required tool exactly once with only the values stated by the user. After the tool succeeds, reply with exactly "Done." Do not call any other tool.',
          [{ role: 'user', content: fixture.prompt }],
          [tool],
          async (name, input) => {
            const isFirstCall = calls.length === 0
            calls.push({ name, input })

            // Let the first correct call traverse the real continuation path. A
            // wrong or duplicate call becomes terminal, bounding this fixture to
            // three model requests even when a provider misbehaves.
            if (isFirstCall && name === fixture.toolName) {
              return { content: 'Benchmark tool call received.', isError: false }
            }
            return {
              content: 'Benchmark tool call received.',
              isError: false,
              terminalText: 'Done.',
            }
          },
          {
            provider: condition.provider,
            requestTimeoutMs: timeoutMs,
            signal: abortController.signal,
          },
        ),
      timeoutMs,
      onChunk: (value) => {
        if (firstEventMs === null) firstEventMs = Math.round(performance.now() - startedAt)
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

  const assessment = assessBenchmarkResult({
    fixture,
    calls,
    completionText,
    timedOut,
    providerError,
  })

  return {
    conditionId: condition.id,
    provider: condition.provider,
    run,
    fixture: fixture.id,
    ...assessment,
    firstEventMs,
    completeMs: Math.round(performance.now() - startedAt),
  }
}

async function withConditionEnvironment<T>(
  condition: LLMProviderBenchmarkCondition,
  action: () => Promise<T>,
): Promise<T> {
  const priorThinkingLevel = process.env.GEMINI_THINKING_LEVEL

  try {
    if (condition.provider === 'gemini') {
      process.env.GEMINI_THINKING_LEVEL = condition.thinkingLevel
    }
    return await action()
  } finally {
    if (priorThinkingLevel === undefined) {
      delete process.env.GEMINI_THINKING_LEVEL
    } else {
      process.env.GEMINI_THINKING_LEVEL = priorThinkingLevel
    }
  }
}

const isLiveBenchmark = process.env.RUN_LLM_PROVIDER_BENCHMARK === '1'
const benchmarkConfig = isLiveBenchmark ? resolveBenchmarkConfig() : null
const liveBenchmark = isLiveBenchmark ? describe : describe.skip
const benchmarkTestTimeoutMs = benchmarkConfig
  ? benchmarkConfig.conditions.length *
      getBenchmarkFixtures(benchmarkConfig.suite).length *
      (benchmarkConfig.measuredRuns + benchmarkConfig.warmupRuns) *
      benchmarkConfig.timeoutMs +
    30_000
  : 10_000

liveBenchmark('live LLM provider benchmark', () => {
  it(
    'reports exact tool-call accuracy, failure modes, and latency percentiles',
    async () => {
      if (!benchmarkConfig) throw new Error('Live benchmark configuration is unavailable')
      const fixtures = getBenchmarkFixtures(benchmarkConfig.suite)
      const requestBudget = calculateBenchmarkRequestBudget({
        conditionCount: benchmarkConfig.conditions.length,
        fixtureCount: fixtures.length,
        measuredRuns: benchmarkConfig.measuredRuns,
        warmupRuns: benchmarkConfig.warmupRuns,
      })

      if (requestBudget.maximumProviderRequests > benchmarkConfig.maxProviderRequests) {
        throw new Error(
          `This benchmark can make up to ${requestBudget.maximumProviderRequests} provider requests, above LLM_BENCHMARK_MAX_PROVIDER_REQUESTS=${benchmarkConfig.maxProviderRequests}. Increase that explicit cap to run it.`,
        )
      }

      const worstCaseDurationMs = requestBudget.fixtureAttempts * benchmarkConfig.timeoutMs
      console.info(
        `[llm-provider-benchmark-preflight] ${JSON.stringify({
          suite: benchmarkConfig.suite,
          conditions: benchmarkConfig.conditions.map((condition) => condition.id),
          measuredRuns: benchmarkConfig.measuredRuns,
          warmupRuns: benchmarkConfig.warmupRuns,
          fixtureCount: fixtures.length,
          requestBudget,
          explicitRequestCap: benchmarkConfig.maxProviderRequests,
          worstCaseDurationMs,
          dryRun: benchmarkConfig.dryRun,
        })}`,
      )

      if (benchmarkConfig.dryRun) return

      if (
        benchmarkConfig.conditions.some((condition) => condition.provider === 'gemini') &&
        !process.env.GEMINI_API_KEY?.trim()
      ) {
        throw new Error('GEMINI_API_KEY is required to run a Gemini benchmark')
      }

      const resultsByCondition = new Map(
        benchmarkConfig.conditions.map((condition) => [
          condition.id,
          [] as LLMProviderBenchmarkResult[],
        ]),
      )
      const totalMeasuredFixtures =
        benchmarkConfig.conditions.length * benchmarkConfig.measuredRuns * fixtures.length
      let completedMeasuredFixtures = 0

      console.info(
        `[llm-provider-benchmark-start] ${JSON.stringify({
          suite: benchmarkConfig.suite,
          conditions: benchmarkConfig.conditions.map((condition) => condition.id),
          measuredRuns: benchmarkConfig.measuredRuns,
          fixtureCount: fixtures.length,
          totalMeasuredFixtures,
          requestBudget,
          worstCaseDurationMs,
        })}`,
      )

      for (let warmup = 1; warmup <= benchmarkConfig.warmupRuns; warmup++) {
        for (const [fixtureIndex, fixture] of fixtures.entries()) {
          for (
            let conditionIndex = 0;
            conditionIndex < benchmarkConfig.conditions.length;
            conditionIndex++
          ) {
            const condition =
              benchmarkConfig.conditions[
                (conditionIndex + fixtureIndex + warmup - 1) % benchmarkConfig.conditions.length
              ]!
            await withConditionEnvironment(condition, () =>
              runFixture({
                condition,
                fixture,
                run: -warmup,
                timeoutMs: benchmarkConfig.timeoutMs,
              }),
            )
          }
        }
      }

      for (let run = 1; run <= benchmarkConfig.measuredRuns; run++) {
        for (const [fixtureIndex, fixture] of fixtures.entries()) {
          for (
            let conditionIndex = 0;
            conditionIndex < benchmarkConfig.conditions.length;
            conditionIndex++
          ) {
            const condition =
              benchmarkConfig.conditions[
                (conditionIndex + fixtureIndex + run - 1) % benchmarkConfig.conditions.length
              ]!
            const result = await withConditionEnvironment(condition, () =>
              runFixture({
                condition,
                fixture,
                run,
                timeoutMs: benchmarkConfig.timeoutMs,
              }),
            )
            resultsByCondition.get(condition.id)!.push(result)
            completedMeasuredFixtures += 1
            console.info(
              `[llm-provider-benchmark-progress] ${JSON.stringify({
                condition: condition.id,
                fixture: fixture.id,
                run,
                completedMeasuredFixtures,
                totalMeasuredFixtures,
                outcome: result.failure,
                completeMs: result.completeMs,
              })}`,
            )
          }
        }
      }

      const summaries = benchmarkConfig.conditions.map((condition) =>
        summarizeBenchmarkResults({
          condition,
          model: modelFor(condition),
          measuredRuns: benchmarkConfig.measuredRuns,
          warmupRuns: benchmarkConfig.warmupRuns,
          fixtureCount: fixtures.length,
          results: resultsByCondition.get(condition.id)!,
        }),
      )

      const report = {
        suite: benchmarkConfig.suite,
        isolation: 'Real provider calls with a fake, non-mutating tool executor.',
        requestBudget,
        thresholds: {
          minExactAccuracyPercent: benchmarkConfig.minExactAccuracyPercent,
          maxP95CompleteMs: benchmarkConfig.maxP95CompleteMs,
        },
        summaries,
        comparisons: (() => {
          const codexBaseline = summaries.find((summary) => summary.condition.id === 'codex')
          return codexBaseline
            ? summaries
                .filter((summary) => summary.condition.provider === 'gemini')
                .map((summary) => compareBenchmarkSummaries(summary, codexBaseline))
            : []
        })(),
      }
      console.info(`[llm-provider-benchmark] ${JSON.stringify(report)}`)

      for (const summary of summaries) {
        if (benchmarkConfig.minExactAccuracyPercent !== null) {
          expect(summary.exactAccuracyPercent).toBeGreaterThanOrEqual(
            benchmarkConfig.minExactAccuracyPercent,
          )
        }
        if (benchmarkConfig.maxP95CompleteMs !== null) {
          expect(summary.timeToCompletionMs.p95).not.toBeNull()
          expect(summary.timeToCompletionMs.p95).toBeLessThanOrEqual(
            benchmarkConfig.maxP95CompleteMs,
          )
        }
      }
    },
    benchmarkTestTimeoutMs,
  )
})
