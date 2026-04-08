// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn()
const mockOrder = vi.fn()
const mockEq = vi.fn(() => ({
  single: mockSingle,
  order: mockOrder,
  eq: mockEq,
  select: mockSelect,
}))
const mockSelect = vi.fn(() => ({ single: mockSingle, eq: mockEq, order: mockOrder }))
const mockInsert = vi.fn(() => ({ select: mockSelect }))
const mockUpdate = vi.fn(() => ({ eq: mockEq }))
const mockFrom = vi.fn(() => ({
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))
vi.mock('server-only', () => ({}))

import {
  createOpenQuestion,
  resolveOpenQuestion,
  listOpenQuestions,
  listOpenOpenQuestions,
} from '@/lib/services/open-question-service'

const validInput = {
  project_id: '550e8400-e29b-41d4-a716-446655440000',
  node_id: '660e8400-e29b-41d4-a716-446655440000',
  section: 'Authentication',
  question: 'What OAuth providers should we support?',
}

const questionData = {
  id: 'oq-1',
  ...validInput,
  status: 'open',
  resolution: null,
  created_at: '2026-04-08T00:00:00Z',
  resolved_at: null,
}

describe('createOpenQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ insert: mockInsert, select: mockSelect, update: mockUpdate })
    mockSelect.mockReturnValue({ single: mockSingle, eq: mockEq, order: mockOrder })
  })

  it('returns success with inserted question for valid input', async () => {
    mockSingle.mockResolvedValue({ data: questionData, error: null })

    const result = await createOpenQuestion(validInput)

    expect(result).toEqual({ success: true, data: questionData })
    expect(mockFrom).toHaveBeenCalledWith('open_questions')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: validInput.project_id,
        node_id: validInput.node_id,
        section: 'Authentication',
        question: 'What OAuth providers should we support?',
        status: 'open',
        resolution: null,
      }),
    )
  })

  it('returns failure for invalid input (empty question)', async () => {
    const result = await createOpenQuestion({ ...validInput, question: '' })

    expect(result.success).toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns failure for invalid UUIDs', async () => {
    const result = await createOpenQuestion({ ...validInput, project_id: 'bad' })

    expect(result.success).toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns failure when supabase insert fails', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const result = await createOpenQuestion(validInput)

    expect(result).toEqual({ success: false, error: 'DB error' })
  })
})

describe('resolveOpenQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ insert: mockInsert, select: mockSelect, update: mockUpdate })
    mockEq.mockReturnValue({ single: mockSingle, order: mockOrder, eq: mockEq, select: mockSelect })
    mockSelect.mockReturnValue({ single: mockSingle, eq: mockEq, order: mockOrder })
  })

  it('updates status to resolved and sets resolved_at', async () => {
    const resolvedData = {
      ...questionData,
      status: 'resolved',
      resolution: 'Google + GitHub',
      resolved_at: '2026-04-08T01:00:00Z',
    }
    mockSingle.mockResolvedValue({ data: resolvedData, error: null })

    const result = await resolveOpenQuestion('oq-1', 'Google + GitHub')

    expect(result).toEqual({ success: true, data: resolvedData })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'resolved',
        resolution: 'Google + GitHub',
      }),
    )
  })

  it('returns failure for empty resolution', async () => {
    const result = await resolveOpenQuestion('oq-1', '')

    expect(result.success).toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns failure when supabase update fails', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })

    const result = await resolveOpenQuestion('oq-1', 'Some resolution')

    expect(result).toEqual({ success: false, error: 'Not found' })
  })
})

describe('listOpenQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ insert: mockInsert, select: mockSelect, update: mockUpdate })
    mockEq.mockReturnValue({ single: mockSingle, order: mockOrder, eq: mockEq, select: mockSelect })
    mockSelect.mockReturnValue({ single: mockSingle, eq: mockEq, order: mockOrder })
  })

  it('returns all questions for a project ordered by created_at', async () => {
    const questions = [questionData]
    mockOrder.mockResolvedValue({ data: questions, error: null })

    const result = await listOpenQuestions('proj-1')

    expect(result).toEqual({ success: true, data: questions })
    expect(mockFrom).toHaveBeenCalledWith('open_questions')
    expect(mockEq).toHaveBeenCalledWith('project_id', 'proj-1')
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('returns empty array when no questions exist', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null })

    const result = await listOpenQuestions('proj-1')

    expect(result).toEqual({ success: true, data: [] })
  })

  it('returns failure when supabase query fails', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'Query failed' } })

    const result = await listOpenQuestions('proj-1')

    expect(result).toEqual({ success: false, error: 'Query failed' })
  })
})

describe('listOpenOpenQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({ insert: mockInsert, select: mockSelect, update: mockUpdate })
    mockEq.mockReturnValue({ single: mockSingle, order: mockOrder, eq: mockEq, select: mockSelect })
    mockSelect.mockReturnValue({ single: mockSingle, eq: mockEq, order: mockOrder })
  })

  it('filters by status open', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null })

    await listOpenOpenQuestions('proj-1')

    expect(mockEq).toHaveBeenCalledWith('project_id', 'proj-1')
    expect(mockEq).toHaveBeenCalledWith('status', 'open')
  })

  it('returns only open questions', async () => {
    const openQuestions = [questionData]
    mockOrder.mockResolvedValue({ data: openQuestions, error: null })

    const result = await listOpenOpenQuestions('proj-1')

    expect(result).toEqual({ success: true, data: openQuestions })
  })
})
