// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  applyArchitectureCommand,
  getArchitectureCommandRequestHash,
} from '@/lib/services/planning-command-service'

const projectId = '11111111-1111-4111-8111-111111111111'
const changeSetId = '22222222-2222-4222-8222-222222222222'
const operationId = '33333333-3333-4333-8333-333333333333'
const moduleId = '44444444-4444-4444-8444-444444444444'
const artifactVersionId = '55555555-5555-4555-8555-555555555555'

const architectureContent = {
  objective: 'Let customers book appointments.',
  outcomes: ['Customers can confirm a booking.'],
  actors: ['Customer'],
  capabilities: [
    {
      id: moduleId,
      name: 'Booking',
      purpose: 'Capture an appointment request.',
      responsibilities: ['Collect appointment details'],
      boundaries: ['Does not charge a payment'],
    },
  ],
  connections: [],
  important_flows: [
    {
      id: 'customer-books',
      actor: 'Customer',
      outcome: 'A confirmed appointment.',
      capability_ids: [moduleId],
    },
  ],
  assumptions: [],
  blockers: [],
}

const command = {
  projectId,
  changeSetId,
  expectedRevision: 0,
  operations: [
    {
      type: 'module.create' as const,
      operationId,
      module: {
        id: moduleId,
        name: 'Booking',
        description: 'Book a time',
        domain: null,
        position: { x: 0, y: 0 },
        color: '#ffffff',
        entryPoints: [],
        exitPoints: [],
      },
    },
  ],
  architectureContent,
}

const receipt = {
  changeSetId,
  projectId,
  expectedRevision: 0,
  committedRevision: 1,
  semantic: true,
  previousArchitectureVersionId: null,
  architectureVersionId: artifactVersionId,
  operations: [
    {
      operationId,
      sequence: 0,
      type: 'module.create',
      semantic: true,
      before: { modules: [] },
      after: { modules: [{ id: moduleId }] },
    },
  ],
  summary: { created: { modules: 1 } },
  planningInputLinksBefore: {
    decisions: [],
    questions: [],
  },
  replayed: false,
}

const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ rpc: mockRpc })),
}))

describe('planning command service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hashes normalized commands deterministically', () => {
    const reordered = {
      ...command,
      architectureContent: {
        blockers: [],
        assumptions: [],
        important_flows: architectureContent.important_flows,
        connections: [],
        capabilities: architectureContent.capabilities,
        actors: ['  Customer  '],
        outcomes: architectureContent.outcomes,
        objective: '  Let customers book appointments.  ',
      },
    }

    expect(getArchitectureCommandRequestHash(reordered)).toBe(
      getArchitectureCommandRequestHash(command),
    )
  })

  it('commits the whole validated batch through one RPC and returns its receipt', async () => {
    mockRpc.mockResolvedValue({ data: receipt, error: null })

    const result = await applyArchitectureCommand(command)

    expect(result).toEqual({ success: true, data: receipt })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('apply_architecture_command', {
      p_project_id: projectId,
      p_change_set_id: changeSetId,
      p_turn_id: null,
      p_expected_revision: 0,
      p_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_operations: command.operations,
      p_architecture_content: architectureContent,
      p_architecture_content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
  })

  it('rejects malformed commands before calling the database', async () => {
    const result = await applyArchitectureCommand({ ...command, expectedRevision: -1 })

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('Invalid Architecture command'),
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns stale and idempotency database conflicts without pretending a commit landed', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Stale planning revision' } })

    await expect(applyArchitectureCommand(command)).resolves.toEqual({
      success: false,
      error: 'Stale planning revision',
    })
  })

  it('rejects a malformed database receipt', async () => {
    mockRpc.mockResolvedValue({ data: { ...receipt, committedRevision: 0 }, error: null })

    await expect(applyArchitectureCommand(command)).resolves.toEqual({
      success: false,
      error: expect.stringContaining('Invalid committed Architecture receipt'),
    })
  })
})
