// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockCallLLMWithTools } = vi.hoisted(() => ({ mockCallLLMWithTools: vi.fn() }))
vi.mock('@/lib/services/llm-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/llm-client')>()
  return { ...actual, callLLMWithTools: mockCallLLMWithTools }
})

import { generateArchitectureFromScope } from '@/lib/services/scope-architecture-generator'

const projectId = '11111111-1111-4111-8111-111111111111'
const moduleId = '22222222-2222-4222-8222-222222222222'

const snapshot = {
  project: { name: 'Salon', description: 'Book appointments.' },
  modules: [
    {
      id: moduleId,
      name: 'Scope',
      description: null,
      domain: null,
      prdContent: 'A customer books and receives confirmation.',
      entryPoints: [],
      exitPoints: [],
    },
  ],
  nodes: [],
  edges: [],
  connections: [],
  openQuestions: [],
  messages: [{ role: 'user' as const, content: 'Deposits are out of scope.' }],
}

const capture = {
  objective: 'Let customers book salon appointments.',
  outcomes: ['A customer receives a confirmed appointment.'],
  actors: ['Customer'],
  modules: [
    {
      key: 'bookings',
      name: 'Bookings',
      domain: 'Scheduling',
      purpose: 'Own appointment requests.',
      responsibilities: ['Confirm an available appointment.'],
      boundaries: ['Does not collect payment.'],
      entryPoints: [],
      exitPoints: ['confirmed appointment'],
    },
  ],
  connections: [],
  importantFlows: [
    {
      key: 'customer-books',
      actor: 'Customer',
      outcome: 'A confirmed appointment.',
      capabilityKeys: ['bookings'],
    },
  ],
  assumptions: [],
  questions: [],
}

function streamFromToolInput(toolInput: unknown) {
  return (_prompt: unknown, _messages: unknown, _tools: unknown, executeTool: Function) =>
    new ReadableStream<string>({
      async start(controller) {
        await executeTool('submit_architecture_capture', toolInput)
        controller.close()
      },
    })
}

describe('Quick Capture Architecture generator', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses one structured high-level Architecture call against the frozen snapshot', async () => {
    mockCallLLMWithTools.mockImplementation(streamFromToolInput(capture))

    await expect(generateArchitectureFromScope({ projectId, snapshot })).resolves.toEqual({
      success: true,
      data: capture,
    })
    expect(mockCallLLMWithTools).toHaveBeenCalledWith(
      expect.stringMatching(
        /Architecture is intentionally high level:[\s\S]*do not invent file names/,
      ),
      expect.any(Array),
      [expect.objectContaining({ name: 'submit_architecture_capture' })],
      expect.any(Function),
      expect.objectContaining({
        provider: 'codex',
        reasoningEffort: 'low',
        continuationReasoningEffort: 'low',
        sessionKey: projectId,
      }),
    )
    expect(mockCallLLMWithTools.mock.calls[0][0]).toContain(
      'keep uncertainty in assumptions, questions, and blockers only',
    )
  })

  it('fails before provider access when the frozen snapshot is malformed or unbounded', async () => {
    const result = await generateArchitectureFromScope({
      projectId,
      snapshot: {
        ...snapshot,
        messages: [{ role: 'user', content: 'x'.repeat(16_001) }],
      },
    })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('Invalid Quick Capture snapshot'),
      code: 'invalid_output',
    })
    expect(mockCallLLMWithTools).not.toHaveBeenCalled()
  })

  it('rejects invalid or partial Architecture output', async () => {
    mockCallLLMWithTools.mockImplementation(streamFromToolInput({ ...capture, outcomes: [] }))

    const result = await generateArchitectureFromScope({ projectId, snapshot })

    expect(result.success).toBe(false)
    expect(!result.success && result.code).toBe('invalid_output')
  })
})
