// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only (no-op in test)
vi.mock('server-only', () => ({}))

const { mockGetAuthUserId } = vi.hoisted(() => ({
  mockGetAuthUserId: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getAuthUserId: mockGetAuthUserId }))

import { addChatMessage, listChatMessages } from '@/lib/services/chat-message-service'

const mockSingle = vi.fn()
const mockOrder = vi.fn()
const mockEq = vi.fn(() => ({ order: mockOrder }))
const mockSelect = vi.fn(() => ({ single: mockSingle, eq: mockEq }))
const mockInsert = vi.fn(() => ({ select: mockSelect }))
const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  select: mockSelect,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

describe('addChatMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUserId.mockResolvedValue('test-user-id')
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
})

describe('listChatMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthUserId.mockResolvedValue('test-user-id')
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
    expect(mockSelect).toHaveBeenCalledWith('id, project_id, role, content, created_at')
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
