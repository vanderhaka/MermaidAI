// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))

import { addChatMessage, listChatMessages } from '@/lib/services/chat-message-service'

const mockSingle = vi.fn()
const mockMaybeSingle = vi.fn()
const mockOrder = vi.fn()
const mockMessageKeyEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockEq = vi.fn(() => ({ order: mockOrder, eq: mockMessageKeyEq }))
const mockSelect = vi.fn(() => ({ single: mockSingle, eq: mockEq }))
const mockInsert = vi.fn(() => ({ select: mockSelect }))
const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  select: mockSelect,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))

describe('addChatMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a chat message and returns it', async () => {
    const message = {
      id: 'msg-1',
      project_id: 'proj-1',
      role: 'user',
      content: 'Hello world',
      created_at: '2026-01-01T00:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: message, error: null })

    const result = await addChatMessage({
      project_id: 'proj-1',
      role: 'user',
      content: 'Hello world',
    })

    expect(result).toEqual({ success: true, data: message })
    expect(mockFrom).toHaveBeenCalledWith('chat_messages')
    expect(mockInsert).toHaveBeenCalledWith({
      project_id: 'proj-1',
      role: 'user',
      content: 'Hello world',
    })
    expect(mockSelect).toHaveBeenCalled()
    expect(mockSingle).toHaveBeenCalled()
  })

  it('returns error when supabase insert fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Insert failed' },
    })

    const result = await addChatMessage({
      project_id: 'proj-1',
      role: 'assistant',
      content: 'Response text',
    })

    expect(result).toEqual({ success: false, error: 'Insert failed' })
  })

  it('returns the existing identical row when Retry reuses a message key', async () => {
    const input = {
      project_id: 'proj-1',
      role: 'user' as const,
      content: 'Hello world',
      turn_id: '11111111-1111-4111-8111-111111111111',
      message_key: '22222222-2222-4222-8222-222222222222',
      planning_stage: 'architecture' as const,
      artifact_id: '33333333-3333-4333-8333-333333333333',
      artifact_version_id: '44444444-4444-4444-8444-444444444444',
      change_set_id: '55555555-5555-4555-8555-555555555555',
    }
    const existing = {
      id: 'msg-1',
      ...input,
      metadata: null,
      created_at: '2026-01-01T00:00:00Z',
    }
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })
    mockMaybeSingle.mockResolvedValue({ data: existing, error: null })

    await expect(addChatMessage(input)).resolves.toEqual({ success: true, data: existing })
    expect(mockMessageKeyEq).toHaveBeenCalledWith('message_key', input.message_key)
  })

  it('accepts the same user key when a later Retry adds the exact committed linkage', async () => {
    const input = {
      project_id: 'proj-1',
      role: 'user' as const,
      content: 'Hello world',
      turn_id: '11111111-1111-4111-8111-111111111111',
      message_key: '22222222-2222-4222-8222-222222222222',
      planning_stage: 'architecture' as const,
      artifact_id: '33333333-3333-4333-8333-333333333333',
      artifact_version_id: '44444444-4444-4444-8444-444444444444',
      change_set_id: '55555555-5555-4555-8555-555555555555',
    }
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'msg-1',
        ...input,
        artifact_version_id: '66666666-6666-4666-8666-666666666666',
        change_set_id: null,
        metadata: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })

    await expect(addChatMessage(input)).resolves.toEqual({
      success: true,
      data: expect.objectContaining({ id: 'msg-1', change_set_id: null }),
    })
  })

  it('refuses a duplicate message key whose durable identity or content differs', async () => {
    const input = {
      project_id: 'proj-1',
      role: 'assistant' as const,
      content: 'Final answer',
      turn_id: '11111111-1111-4111-8111-111111111111',
      message_key: '22222222-2222-4222-8222-222222222222',
    }
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'msg-1',
        ...input,
        content: 'Different answer',
        metadata: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })

    await expect(addChatMessage(input)).resolves.toEqual({
      success: false,
      error: 'Message key is already linked to different chat content or identity.',
    })
  })

  it('refuses a duplicate assistant key whose durable completion metadata differs', async () => {
    const input = {
      project_id: 'proj-1',
      role: 'assistant' as const,
      content: 'Final answer',
      turn_id: '11111111-1111-4111-8111-111111111111',
      message_key: '22222222-2222-4222-8222-222222222222',
      planning_stage: null,
      artifact_id: null,
      artifact_version_id: null,
      change_set_id: null,
      metadata: { turn_status: 'completed' },
    }
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'msg-1',
        ...input,
        metadata: { turn_status: 'partial' },
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    })

    await expect(addChatMessage(input)).resolves.toEqual({
      success: false,
      error: 'Message key is already linked to different chat content or identity.',
    })
  })
})

describe('listChatMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns messages ordered by created_at ascending', async () => {
    const messages = [
      {
        id: 'msg-1',
        project_id: 'proj-1',
        role: 'user',
        content: 'First message',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'msg-2',
        project_id: 'proj-1',
        role: 'assistant',
        content: 'Second message',
        created_at: '2026-01-01T00:01:00Z',
      },
    ]
    mockOrder.mockResolvedValue({ data: messages, error: null })

    const result = await listChatMessages('proj-1')

    expect(result).toEqual({ success: true, data: messages })
    expect(mockFrom).toHaveBeenCalledWith('chat_messages')
    expect(mockSelect).toHaveBeenCalledWith(
      'id, project_id, role, content, created_at, turn_id, message_key, planning_stage, artifact_id, artifact_version_id, change_set_id, metadata',
    )
    expect(mockEq).toHaveBeenCalledWith('project_id', 'proj-1')
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('returns empty array when no messages exist', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null })

    const result = await listChatMessages('proj-1')

    expect(result).toEqual({ success: true, data: [] })
  })

  it('returns error when supabase query fails', async () => {
    mockOrder.mockResolvedValue({
      data: null,
      error: { message: 'Query failed' },
    })

    const result = await listChatMessages('proj-1')

    expect(result).toEqual({ success: false, error: 'Query failed' })
  })
})
