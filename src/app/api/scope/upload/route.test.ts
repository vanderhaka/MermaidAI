// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetUser = vi.fn()
const mockSupabase = { auth: { getUser: mockGetUser } }
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

const mockUploadRateLimiterCheck = vi.fn()
vi.mock('@/lib/rate-limiter', () => ({
  uploadRateLimiter: { check: (...args: unknown[]) => mockUploadRateLimiterCheck(...args) },
}))

const mockGetProjectById = vi.fn()
vi.mock('@/lib/services/project-service', () => ({
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
}))

const mockParseDocument = vi.fn()
vi.mock('@/lib/services/document-parser', () => ({
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
  parseDocument: (...args: unknown[]) => mockParseDocument(...args),
}))

import { POST } from '@/app/api/scope/upload/route'

function makeRequest({
  projectId = 'proj-1',
  includeProjectId = true,
  file = new File(['Project brief'], 'brief.txt', { type: 'text/plain' }),
  includeFile = true,
}: {
  projectId?: string
  includeProjectId?: boolean
  file?: File
  includeFile?: boolean
} = {}): Request {
  const formData = new FormData()

  if (includeProjectId) {
    formData.append('projectId', projectId)
  }
  if (includeFile) {
    formData.append('file', file)
  }

  return new Request('http://localhost:3000/api/scope/upload', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/scope/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    })

    mockUploadRateLimiterCheck.mockReturnValue({ allowed: true, remaining: 5 })

    mockGetProjectById.mockResolvedValue({
      success: true,
      data: { id: 'proj-1', name: 'Test Project' },
    })

    mockParseDocument.mockResolvedValue({
      success: true,
      data: {
        filename: 'brief.txt',
        type: 'txt',
        text: 'Project brief',
        truncated: false,
        originalLength: 13,
      },
    })
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await POST(makeRequest())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 429 when the upload rate limit is exceeded', async () => {
    mockUploadRateLimiterCheck.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 12,
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('12')
    await expect(response.json()).resolves.toEqual({
      error: 'Too many uploads — try again shortly.',
    })
  })

  it('returns 400 when projectId is missing', async () => {
    const response = await POST(makeRequest({ includeProjectId: false }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'projectId is required' })
  })

  it('returns 400 when file is missing', async () => {
    const response = await POST(makeRequest({ includeFile: false }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'file is required' })
  })

  it('returns 413 before parsing oversized files', async () => {
    const uploadLimit = 10 * 1024 * 1024
    const file = new File([new Uint8Array(uploadLimit + 1)], 'oversized.pdf', {
      type: 'application/pdf',
    })

    const response = await POST(makeRequest({ file }))

    expect(response.status).toBe(413)
    expect(mockParseDocument).not.toHaveBeenCalled()
  })

  it('returns 404 when the project lookup fails', async () => {
    mockGetProjectById.mockResolvedValue({ success: false, error: 'Not found' })

    const response = await POST(makeRequest())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Project not found' })
  })

  it('maps parser validation errors to HTTP status codes', async () => {
    mockParseDocument.mockResolvedValue({
      success: false,
      error: {
        code: 'unsupported_type',
        message: 'Only PDF, DOCX, TXT, and Markdown files are supported.',
      },
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toEqual({
      error: 'Only PDF, DOCX, TXT, and Markdown files are supported.',
    })
  })

  it('returns parsed document data for owned projects', async () => {
    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      filename: 'brief.txt',
      type: 'txt',
      text: 'Project brief',
      truncated: false,
      originalLength: 13,
    })

    expect(mockGetProjectById).toHaveBeenCalledWith('proj-1')
    expect(mockParseDocument).toHaveBeenCalledWith(expect.any(File))
  })
})
