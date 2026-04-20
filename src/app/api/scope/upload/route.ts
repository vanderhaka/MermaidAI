import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { uploadRateLimiter } from '@/lib/rate-limiter'
import { MAX_UPLOAD_BYTES, parseDocument } from '@/lib/services/document-parser'
import { getProjectById } from '@/lib/services/project-service'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Scope-mode document upload endpoint. Accepts a multipart form with
 *   - file: PDF | DOCX | TXT | MD
 *   - projectId: the active scope project
 *
 * Validates ownership, parses to plain text, returns the extracted text.
 * The client then injects the text into a regular /api/chat call so the
 * scope prompt drives the flow + open-questions generation as usual.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimit = uploadRateLimiter.check(user.id)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads — try again shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 })
  }

  const projectId = formData.get('projectId')
  const file = formData.get('file')

  if (typeof projectId !== 'string' || projectId.length === 0) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)
    return NextResponse.json({ error: `File exceeds the ${mb} MB upload limit.` }, { status: 413 })
  }

  // Verify the caller owns the project. project-service honors RLS so a
  // cross-tenant id will come back as a failure.
  const projectResult = await getProjectById(projectId)
  if (!projectResult.success) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const parsed = await parseDocument(file)
  if (!parsed.success) {
    const statusMap: Record<typeof parsed.error.code, number> = {
      unsupported_type: 415,
      too_large: 413,
      empty: 422,
      parse_failed: 422,
    }
    return NextResponse.json(
      { error: parsed.error.message },
      { status: statusMap[parsed.error.code] },
    )
  }

  return NextResponse.json({
    filename: parsed.data.filename,
    type: parsed.data.type,
    text: parsed.data.text,
    truncated: parsed.data.truncated,
    originalLength: parsed.data.originalLength,
  })
}
