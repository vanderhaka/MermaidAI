// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockCallLLMWithTools } = vi.hoisted(() => ({
  mockCallLLMWithTools: vi.fn(),
}))
vi.mock('@/lib/services/llm-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/llm-client')>()
  return { ...actual, callLLMWithTools: mockCallLLMWithTools }
})

import { generateWorkPlan } from '@/lib/services/work-plan-generator'

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
      {
        id: 'notifications',
        name: 'Notifications',
        purpose: 'Send confirmations.',
        responsibilities: ['Notify the customer.'],
        boundaries: ['Does not own bookings.'],
      },
    ],
    connections: [
      {
        from_capability_id: 'booking',
        to_capability_id: 'notifications',
        description: 'A confirmation triggers a message.',
      },
    ],
    important_flows: [
      {
        id: 'customer-books',
        actor: 'Customer',
        outcome: 'Appointment confirmed.',
        capability_ids: ['booking', 'notifications'],
      },
    ],
    assumptions: [],
    blockers: [],
  },
}

const validPlan = {
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
      objective: 'Confirm and communicate one booking.',
      slice_ids: ['slice-booking'],
    },
  ],
  slices: [
    {
      id: 'slice-booking',
      title: 'Confirm and notify',
      actor_or_trigger: 'A customer selects an available time.',
      observable_outcome: 'The booking is confirmed and the customer is notified.',
      protected_invariant: 'A slot can only be reserved once.',
      dependencies: [],
      source_capability_ids: ['booking', 'notifications'],
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

function providerStreamFromToolInput(toolInput: Record<string, unknown>) {
  return (_prompt: unknown, _messages: unknown, _tools: unknown, executeTool: Function) =>
    new ReadableStream<string>({
      async start(controller) {
        await executeTool('submit_work_plan', toolInput)
        controller.close()
      },
    })
}

describe('Work Plan generator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts one complete DAG bound to the exact Architecture version', async () => {
    mockCallLLMWithTools.mockImplementation(providerStreamFromToolInput(validPlan))

    await expect(
      generateWorkPlan({
        projectName: 'Salon',
        architectureVersion,
        decisions: [],
      }),
    ).resolves.toEqual({ success: true, data: validPlan })

    expect(mockCallLLMWithTools).toHaveBeenCalledWith(
      expect.stringContaining('Frozen source: Architecture v2'),
      expect.any(Array),
      [expect.objectContaining({ name: 'submit_work_plan' })],
      expect.any(Function),
      expect.objectContaining({
        provider: 'codex',
        reasoningEffort: 'low',
        continuationReasoningEffort: 'low',
        sessionKey: projectId,
      }),
    )
  })

  it('rejects a plan that changes the source version', async () => {
    mockCallLLMWithTools.mockImplementation(
      providerStreamFromToolInput({
        ...validPlan,
        source_architecture_version: {
          ...validPlan.source_architecture_version,
          version: 99,
        },
      }),
    )

    const result = await generateWorkPlan({
      projectName: 'Salon',
      architectureVersion,
      decisions: [],
    })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('does not match the frozen Architecture'),
      code: 'invalid_output',
    })
  })

  it('rejects a structurally valid plan that omits an Architecture capability', async () => {
    mockCallLLMWithTools.mockImplementation(
      providerStreamFromToolInput({
        ...validPlan,
        slices: [
          {
            ...validPlan.slices[0],
            source_capability_ids: ['booking'],
          },
        ],
      }),
    )

    const result = await generateWorkPlan({
      projectName: 'Salon',
      architectureVersion,
      decisions: [],
    })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('does not cover Architecture capability: notifications'),
      code: 'invalid_output',
    })
  })

  it('does not accept a partial or cyclic model response', async () => {
    mockCallLLMWithTools.mockImplementation(
      providerStreamFromToolInput({ ...validPlan, phases: [] }),
    )

    const result = await generateWorkPlan({
      projectName: 'Salon',
      architectureVersion,
      decisions: [],
    })

    expect(result.success).toBe(false)
    expect(!result.success && result.code).toBe('invalid_output')
  })
})
