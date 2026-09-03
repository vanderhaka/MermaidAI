// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

vi.mock('server-only', () => ({}))

const { mockCallLLMWithTools } = vi.hoisted(() => ({
  mockCallLLMWithTools: vi.fn(),
}))
vi.mock('@/lib/services/llm-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/llm-client')>()
  return { ...actual, callLLMWithTools: mockCallLLMWithTools }
})

import { refineWorkPlan } from '@/lib/services/work-plan-refinement-service'

const projectId = '11111111-1111-4111-8111-111111111111'
const architectureVersionId = '22222222-2222-4222-8222-222222222222'

const architectureVersion = {
  id: architectureVersionId,
  artifact_id: '33333333-3333-4333-8333-333333333333',
  project_id: projectId,
  artifact_kind: 'architecture' as const,
  version: 2,
  content_hash: 'architecture-hash',
  readiness_report: null,
  rendered_markdown: null,
  provenance: {},
  source_version_id: null,
  secondary_source_version_id: null,
  created_at: '2026-09-02T00:00:00.000Z',
  content_state: 'complete' as const,
  request_key: '44444444-4444-4444-8444-444444444444',
  request_hash: 'request-hash',
  content: {
    objective: 'Let customers book appointments.',
    outcomes: ['A confirmed appointment.'],
    actors: ['Customer'],
    capabilities: [
      {
        id: 'booking',
        name: 'Booking',
        purpose: 'Reserve appointments.',
        responsibilities: ['Confirm an available slot.'],
        boundaries: ['Does not collect payment.'],
      },
    ],
    connections: [],
    important_flows: [
      {
        id: 'customer-books',
        actor: 'Customer',
        outcome: 'Appointment confirmed.',
        capability_ids: ['booking'],
      },
    ],
    assumptions: [],
    blockers: [],
  },
}

const workPlan = {
  source_architecture_version: {
    id: architectureVersionId,
    artifact_kind: 'architecture' as const,
    version: 2,
  },
  objective: 'Ship dependable appointment booking.',
  non_goals: ['Take payments.'],
  phases: [
    {
      id: 'phase-one',
      title: 'Booking path',
      objective: 'Confirm one booking.',
      slice_ids: ['slice-booking'],
    },
  ],
  slices: [
    {
      id: 'slice-booking',
      title: 'Confirm booking',
      actor_or_trigger: 'A customer selects an available time.',
      observable_outcome: 'The booking is confirmed.',
      protected_invariant: 'A slot can only be reserved once.',
      dependencies: [],
      source_capability_ids: ['booking'],
      acceptance_criteria: ['One valid request creates one confirmed booking.'],
      verification: [{ command: 'npm test -- booking' }],
      likely_targets: { files: [], api: ['/api/bookings'], data: ['bookings'] },
      risks: ['Concurrent slot claims.'],
      rollback_notes: ['Disable booking writes.'],
      assumption_ids: [],
      unresolved_blocker_ids: [],
    },
  ],
  assumptions: [],
  unresolved_blockers: [],
}

const workPlanVersion = {
  ...architectureVersion,
  id: '55555555-5555-4555-8555-555555555555',
  artifact_id: '66666666-6666-4666-8666-666666666666',
  artifact_kind: 'work_plan' as const,
  version: 3,
  content_hash: 'work-plan-hash',
  source_version_id: architectureVersionId,
  content: workPlan,
}

function providerStream(toolInput: Record<string, unknown>) {
  return (_prompt: unknown, _messages: unknown, _tools: unknown, executeTool: Function) =>
    new ReadableStream<string>({
      async start(controller) {
        await executeTool('submit_work_plan_edits', toolInput)
        controller.close()
      },
    })
}

describe('Work Plan refinement service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.AI_PROVIDER
  })

  it('applies one finite batch and preserves the frozen source', async () => {
    mockCallLLMWithTools.mockImplementation(
      providerStream({
        summary: 'Clarified the booking proof.',
        commands: [
          {
            type: 'update_slice',
            slice_id: 'slice-booking',
            slice: {
              ...workPlan.slices[0],
              acceptance_criteria: [
                'One valid request creates one confirmed booking.',
                'A duplicate request returns the original booking.',
              ],
            },
          },
        ],
      }),
    )

    const result = await refineWorkPlan({
      projectName: 'Salon',
      architectureVersion,
      workPlanVersion,
      decisions: [],
      history: [{ role: 'assistant', content: 'The booking path is ready to refine.' }],
      message: 'Add duplicate-request coverage.',
    })

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        summary: 'Clarified the booking proof.',
        commandCount: 1,
        content: expect.objectContaining({
          source_architecture_version: workPlan.source_architecture_version,
          slices: [
            expect.objectContaining({
              acceptance_criteria: expect.arrayContaining([
                'A duplicate request returns the original booking.',
              ]),
            }),
          ],
        }),
      }),
    })
    expect(mockCallLLMWithTools).toHaveBeenCalledWith(
      expect.stringContaining('Current Work Plan:'),
      expect.arrayContaining([{ role: 'user', content: 'Add duplicate-request coverage.' }]),
      [expect.objectContaining({ name: 'submit_work_plan_edits' })],
      expect.any(Function),
      expect.objectContaining({
        provider: 'codex',
        requiredToolName: 'submit_work_plan_edits',
        reasoningEffort: 'low',
        continuationReasoningEffort: 'low',
        sessionKey: projectId,
      }),
    )
  })

  it('uses the configured hosted provider for Production refinement', async () => {
    process.env.AI_PROVIDER = 'anthropic'
    mockCallLLMWithTools.mockImplementation(
      providerStream({
        summary: 'Clarified the booking proof.',
        commands: [
          {
            type: 'update_slice',
            slice_id: 'slice-booking',
            slice: { ...workPlan.slices[0], title: 'Confirm a booking' },
          },
        ],
      }),
    )

    const result = await refineWorkPlan({
      projectName: 'Salon',
      architectureVersion,
      workPlanVersion,
      decisions: [],
      history: [],
      message: 'Keep the current plan.',
    })

    expect(result.success).toBe(true)
    expect(mockCallLLMWithTools).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.any(Array),
      expect.any(Function),
      expect.objectContaining({ provider: 'anthropic' }),
    )
  })

  it('rejects a finite batch that drops Architecture coverage', async () => {
    mockCallLLMWithTools.mockImplementation(
      providerStream({
        summary: 'Removed booking.',
        commands: [{ type: 'remove_slice', slice_id: 'slice-booking' }],
      }),
    )

    const result = await refineWorkPlan({
      projectName: 'Salon',
      architectureVersion,
      workPlanVersion,
      decisions: [],
      history: [],
      message: 'Remove booking.',
    })

    expect(result.success).toBe(false)
    expect(!result.success && result.code).toBe('invalid_output')
  })

  it('automatically repairs one validator-rejected edit batch', async () => {
    mockCallLLMWithTools
      .mockImplementationOnce(
        providerStream({
          summary: 'Tried to edit phase membership directly.',
          commands: [
            {
              type: 'update_phase',
              phase_id: 'phase-one',
              slice_ids: ['slice-booking'],
            },
          ],
        }),
      )
      .mockImplementationOnce(
        providerStream({
          summary: 'Clarified the booking proof.',
          commands: [
            {
              type: 'update_slice',
              slice_id: 'slice-booking',
              slice: {
                ...workPlan.slices[0],
                acceptance_criteria: [
                  'One valid request creates one confirmed booking.',
                  'A duplicate request returns the original booking.',
                ],
              },
            },
          ],
        }),
      )

    const result = await refineWorkPlan({
      projectName: 'Salon',
      architectureVersion,
      workPlanVersion,
      decisions: [],
      history: [],
      message: 'Add duplicate-request coverage.',
    })

    expect(result.success).toBe(true)
    expect(mockCallLLMWithTools).toHaveBeenCalledTimes(2)
    const retryMessages = mockCallLLMWithTools.mock.calls[1]?.[1] as Anthropic.MessageParam[]
    expect(retryMessages.at(-1)).toEqual(
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('Unrecognized key: "slice_ids"'),
      }),
    )
  })

  it('retains durable decisions even when chat history is capped', async () => {
    mockCallLLMWithTools.mockImplementation(
      providerStream({
        summary: 'Updated the objective.',
        commands: [{ type: 'update_summary', objective: 'Ship booking without payments.' }],
      }),
    )
    const history = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `Turn ${index}`,
    }))

    await refineWorkPlan({
      projectName: 'Salon',
      architectureVersion,
      workPlanVersion,
      decisions: [
        {
          id: 'decision-payment',
          artifact_version_id: architectureVersionId,
          category: 'scope',
          statement: 'Payments stay out of scope.',
          state: 'accepted',
          provenance: 'user',
          readiness_impact: 'non_blocking',
          supersedes_decision_id: null,
          latest_event: null,
        },
      ],
      history,
      message: 'Clarify the objective.',
    })

    const [prompt, messages] = mockCallLLMWithTools.mock.calls[0]
    expect(prompt).toContain('Payments stay out of scope.')
    expect(messages).toHaveLength(31)
    expect(messages[0]).toEqual({ role: 'user', content: 'Turn 10' })
  })
})
