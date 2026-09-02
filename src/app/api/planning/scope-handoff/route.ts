import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getUserWithDevAuth } from '@/lib/auth/dev-auth'
import { chatRateLimiter } from '@/lib/rate-limiter'
import { buildInitialArchitectureCommand } from '@/lib/services/architecture-service'
import { getPlanningArtifactVersion } from '@/lib/services/planning-artifact-service'
import {
  beginScopeArchitectureHandoff,
  claimScopeArchitectureHandoff,
  completeScopeArchitectureHandoff,
  failScopeArchitectureHandoff,
  getResumableScopeArchitectureHandoff,
  type ScopeArchitectureHandoffJob,
} from '@/lib/services/scope-architecture-handoff-service'
import { generateArchitectureFromScope } from '@/lib/services/scope-architecture-generator'
import { getProjectById } from '@/lib/services/project-service'
import { createClient } from '@/lib/supabase/server'

const requestSchema = z
  .object({
    projectId: z.uuid(),
    requestKey: z.uuid(),
  })
  .strict()

const querySchema = z.object({ projectId: z.uuid() }).strict()

function errorResponse(error: string, status: number) {
  return NextResponse.json({ state: 'failed', error }, { status })
}

type AuthorizationResult =
  | { success: true; userId: string }
  | { success: false; response: NextResponse }

async function authorizeProject(projectId: string): Promise<AuthorizationResult> {
  const supabase = await createClient()
  const auth = await getUserWithDevAuth(supabase)
  if (auth.error || !auth.data.user) {
    return { success: false, response: errorResponse('Unauthorized.', 401) }
  }

  const projectResult = await getProjectById(projectId)
  if (
    !projectResult.success ||
    projectResult.data.user_id !== auth.data.user.id ||
    !['scope', 'architecture'].includes(projectResult.data.mode)
  ) {
    return { success: false, response: errorResponse('Project access denied.', 403) }
  }
  return { success: true, userId: auth.data.user.id }
}

async function completedResponse(job: ScopeArchitectureHandoffJob) {
  if (!job.completed_version_id) {
    return errorResponse('The completed handoff is missing its Architecture version.', 500)
  }
  const versionResult = await getPlanningArtifactVersion(
    job.project_id,
    'architecture',
    job.completed_version_id,
  )
  if (!versionResult.success || versionResult.data?.content_state !== 'complete') {
    return errorResponse(
      versionResult.success ? 'The completed Architecture is unavailable.' : versionResult.error,
      500,
    )
  }
  return NextResponse.json({
    state: 'complete',
    jobId: job.id,
    artifact: versionResult.data,
  })
}

async function failClaim(
  job: ScopeArchitectureHandoffJob,
  claimToken: string,
  errorCode: string,
): Promise<void> {
  await failScopeArchitectureHandoff({
    projectId: job.project_id,
    jobId: job.id,
    claimToken,
    errorCode,
  }).catch(() => undefined)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = querySchema.safeParse({ projectId: url.searchParams.get('projectId') })
  if (!parsed.success) return errorResponse('Invalid Quick Capture handoff query.', 400)

  const authorization = await authorizeProject(parsed.data.projectId)
  if (!authorization.success) return authorization.response

  const result = await getResumableScopeArchitectureHandoff(parsed.data.projectId)
  if (!result.success) return errorResponse(result.error, 500)
  return NextResponse.json({
    state: result.data ? 'running' : 'idle',
    requestKey: result.data?.request_key ?? null,
    jobId: result.data?.id ?? null,
  })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON body.', 400)
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid handoff request.', 400)
  }
  const input = parsed.data

  const authorization = await authorizeProject(input.projectId)
  if (!authorization.success) return authorization.response

  const beginResult = await beginScopeArchitectureHandoff(input)
  if (!beginResult.success) return errorResponse(beginResult.error, 409)

  const claimResult = await claimScopeArchitectureHandoff({
    projectId: input.projectId,
    jobId: beginResult.data.id,
  })
  if (!claimResult.success) return errorResponse(claimResult.error, 409)
  if (claimResult.data.outcome === 'complete') {
    return completedResponse(claimResult.data.job)
  }
  if (claimResult.data.outcome === 'busy') {
    return NextResponse.json(
      {
        state: 'running',
        jobId: claimResult.data.job.id,
        attemptCount: claimResult.data.job.attempt_count,
      },
      { status: 202 },
    )
  }

  const job = claimResult.data.job
  const claimToken = job.claim_token
  if (!claimToken) return errorResponse('The handoff lease could not be acquired.', 500)

  const rateLimit = chatRateLimiter.check(authorization.userId)
  if (!rateLimit.allowed) {
    await failClaim(job, claimToken, 'rate_limited')
    return NextResponse.json(
      { state: 'failed', error: 'Too many planning requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  const generated = await generateArchitectureFromScope({
    projectId: input.projectId,
    snapshot: job.source_snapshot,
    signal: request.signal,
  })
  if (!generated.success) {
    await failClaim(job, claimToken, generated.code)
    return errorResponse(generated.error, 502)
  }

  const command = buildInitialArchitectureCommand({
    projectId: input.projectId,
    changeSetId: job.change_set_id,
    turnId: job.request_key,
    expectedRevision: 0,
    capture: generated.data,
  })
  if (!command.success) {
    await failClaim(job, claimToken, 'invalid_command')
    return errorResponse(command.error, 500)
  }

  const completeResult = await completeScopeArchitectureHandoff({
    projectId: input.projectId,
    jobId: job.id,
    claimToken,
    command: command.data,
  })
  if (!completeResult.success) {
    await failClaim(job, claimToken, 'commit_failed')
    const sourceChanged = /changed while|no longer active/i.test(completeResult.error)
    return errorResponse(completeResult.error, sourceChanged ? 409 : 500)
  }

  return NextResponse.json({
    state: 'complete',
    jobId: job.id,
    artifact: completeResult.data.version,
  })
}
