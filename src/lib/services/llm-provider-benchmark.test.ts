import { describe, expect, it, vi } from 'vitest'

import {
  BENCHMARK_CONDITIONS,
  assessBenchmarkResult,
  calculateBenchmarkRequestBudget,
  compareBenchmarkSummaries,
  drainBenchmarkStreamWithinDeadline,
  getBenchmarkFixtures,
  summarizeBenchmarkResults,
  summarizeLatency,
} from '@/lib/services/llm-provider-benchmark'
import { getToolsForMode } from '@/lib/services/llm-tools'

vi.mock('server-only', () => ({}))

describe('LLM provider benchmark evaluator', () => {
  const fixture = getBenchmarkFixtures('core')[0]!

  it('returns at its deadline and cancels a stream that never yields', async () => {
    let cancelled = false
    const neverEndingStream = new ReadableStream<string>({
      pull: () => new Promise<void>(() => {}),
      cancel: () => {
        cancelled = true
      },
    })
    const onTimeout = vi.fn()

    await expect(
      drainBenchmarkStreamWithinDeadline({
        createStream: async () => neverEndingStream,
        timeoutMs: 20,
        onChunk: vi.fn(),
        onTimeout,
      }),
    ).resolves.toEqual({ timedOut: true })

    expect(onTimeout).toHaveBeenCalledOnce()
    expect(cancelled).toBe(true)
  })

  it('returns at its deadline when a provider never returns a stream', async () => {
    const onTimeout = vi.fn()

    await expect(
      drainBenchmarkStreamWithinDeadline({
        createStream: () => new Promise<ReadableStream<string>>(() => {}),
        timeoutMs: 20,
        onChunk: vi.fn(),
        onTimeout,
      }),
    ).resolves.toEqual({ timedOut: true })

    expect(onTimeout).toHaveBeenCalledOnce()
  })

  it('passes all chunks through when a stream finishes before its deadline', async () => {
    const chunks: string[] = []
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('Done.')
        controller.close()
      },
    })

    await expect(
      drainBenchmarkStreamWithinDeadline({
        createStream: async () => stream,
        timeoutMs: 100,
        onChunk: (value) => chunks.push(value),
        onTimeout: vi.fn(),
      }),
    ).resolves.toEqual({ timedOut: false })

    expect(chunks).toEqual(['Done.'])
  })

  it('accepts only one exact tool call followed by the required completion', () => {
    expect(
      assessBenchmarkResult({
        fixture,
        calls: [{ name: fixture.toolName, input: fixture.expectedInput }],
        completionText: 'Done.',
        timedOut: false,
        providerError: false,
      }),
    ).toEqual({ exact: true, failure: 'pass' })
  })

  it('calibrates deliberate mismatches to distinct failure categories', () => {
    expect(
      assessBenchmarkResult({
        fixture,
        calls: [],
        completionText: '',
        timedOut: false,
        providerError: false,
      }),
    ).toEqual({ exact: false, failure: 'missing_tool_call' })

    expect(
      assessBenchmarkResult({
        fixture,
        calls: [{ name: 'delete_module', input: fixture.expectedInput }],
        completionText: 'Done.',
        timedOut: false,
        providerError: false,
      }),
    ).toEqual({ exact: false, failure: 'wrong_tool' })

    expect(
      assessBenchmarkResult({
        fixture,
        calls: [
          { name: fixture.toolName, input: fixture.expectedInput },
          { name: fixture.toolName, input: fixture.expectedInput },
        ],
        completionText: 'Done.',
        timedOut: false,
        providerError: false,
      }),
    ).toEqual({ exact: false, failure: 'duplicate_tool_call' })

    expect(
      assessBenchmarkResult({
        fixture,
        calls: [{ name: fixture.toolName, input: { name: 'Wrong' } }],
        completionText: 'Done.',
        timedOut: false,
        providerError: false,
      }),
    ).toEqual({ exact: false, failure: 'wrong_input' })

    expect(
      assessBenchmarkResult({
        fixture,
        calls: [{ name: fixture.toolName, input: fixture.expectedInput }],
        completionText: '',
        timedOut: true,
        providerError: true,
      }),
    ).toEqual({ exact: false, failure: 'timeout' })
  })

  it('calculates stable latency percentiles and aggregate accuracy', () => {
    expect(summarizeLatency([100, 200, 300, 400])).toEqual({
      count: 4,
      min: 100,
      mean: 250,
      p50: 250,
      p95: 385,
      max: 400,
    })

    const summary = summarizeBenchmarkResults({
      condition: BENCHMARK_CONDITIONS.codex,
      model: 'gpt-5.6-luna',
      measuredRuns: 1,
      warmupRuns: 0,
      fixtureCount: 2,
      results: [
        {
          conditionId: 'codex',
          provider: 'codex',
          run: 1,
          fixture: 'correct',
          exact: true,
          failure: 'pass',
          firstEventMs: 100,
          completeMs: 200,
        },
        {
          conditionId: 'codex',
          provider: 'codex',
          run: 1,
          fixture: 'wrong',
          exact: false,
          failure: 'wrong_input',
          firstEventMs: 300,
          completeMs: 400,
        },
      ],
    })

    expect(summary.exactAccuracyPercent).toBe(50)
    expect(summary.failures).toMatchObject({ pass: 1, wrong_input: 1 })
    expect(summary.timeToCompletionMs.p95).toBe(390)

    expect(
      compareBenchmarkSummaries(summary, {
        ...summary,
        condition: BENCHMARK_CONDITIONS['gemini-medium'],
        exactAccuracyPercent: 75,
        timeToCompletionMs: { ...summary.timeToCompletionMs, p95: 300 },
      }),
    ).toEqual({
      candidateConditionId: 'codex',
      baselineConditionId: 'gemini-medium',
      exactAccuracyPointDelta: -25,
      p95CompleteMsDelta: 90,
      p95CompletePercentDelta: 30,
    })
  })

  it('uses an explicit three-request ceiling for each fixture attempt', () => {
    expect(
      calculateBenchmarkRequestBudget({
        conditionCount: 2,
        fixtureCount: 10,
        measuredRuns: 3,
        warmupRuns: 1,
      }),
    ).toEqual({
      fixtureAttempts: 80,
      nominalProviderRequests: 160,
      maximumProviderRequests: 240,
    })
  })

  it('keeps every benchmark fixture bound to a current MermaidAI tool', () => {
    const fixtures = getBenchmarkFixtures('intensive')
    expect(getBenchmarkFixtures('core')).toHaveLength(10)
    expect(fixtures).toHaveLength(14)

    for (const fixture of fixtures) {
      const tool = getToolsForMode(fixture.mode, {
        stagedArchitecture: fixture.stagedArchitecture,
      }).find((candidate) => candidate.name === fixture.toolName)
      expect(tool, `${fixture.id} should resolve ${fixture.toolName}`).toBeDefined()

      const schema = tool?.input_schema as { properties?: Record<string, unknown> } | undefined
      expect(schema?.properties).toBeDefined()
      for (const key of Object.keys(fixture.expectedInput)) {
        expect(schema?.properties, `${fixture.id} should include ${key}`).toHaveProperty(key)
      }
    }
  })
})
