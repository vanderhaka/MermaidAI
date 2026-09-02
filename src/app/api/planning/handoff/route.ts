import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getUserWithDevAuth } from '@/lib/auth/dev-auth'
import { chatRateLimiter } from '@/lib/rate-limiter'
import {
  getLatestArchitectureReadinessReport,
  type ArchitectureReadinessDecision,
} from '@/lib/services/architecture-readiness'
import {
  buildExecutionHandoffContent,
  renderExecutionHandoffPacket,
} from '@/lib/services/handoff-packet-renderer'
import {
  getPlanningArtifactStaleness,
  getPlanningArtifactVersion,
  type CompletePlanningArtifactVersion,
} from '@/lib/services/planning-artifact-service'
import { listPlanningDecisions } from '@/lib/services/planning-decision-service'
import {
  beginPlanningHandoff,
  claimPlanningHandoff,
  completePlanningHandoff,
  failPlanningHandoff,
  type PlanningHandoffJob,
  type PlanningHandoffTarget,
} from '@/lib/services/planning-handoff-service'
import { getPlanningState } from '@/lib/services/planning-state-service'
import { getProjectById } from '@/lib/services/project-service'
import { createClient } from '@/lib/supabase/server'
import { generateWorkPlan } from '@/lib/services/work-plan-generator'

const handoffRequestSchema = z
  .object({
    projectId: z.uuid(),
    sourceVersionId: z.uuid(),
    targetKind: z.enum(['work_plan', 'execution_handoff']),
    requestKey: z.uuid(),
  })
  .strict()

function errorResponse(error: string, status: number) {
  return NextResponse.json({ state: 'failed', error }, { status })
}

async function loadCompletedResult(input: {
  projectId: string
  targetKind: PlanningHandoffTarget
  job: PlanningHandoffJob
}) {
  if (!input.job.completed_version_id) {
    return errorResponse('The completed handoff is missing its artifact version.', 500)
  }
  const versionResult = await getPlanningArtifactVersion(
    input.projectId,
    input.targetKind,
    input.job.completed_version_id,
  )
  if (!versionResult.success || versionResult.data?.content_state !== 'complete') {
    return errorResponse(
      versionResult.success
        ? 'The completed handoff artifact is unavailable.'
        : versionResult.error,
      500,
    )
  }
  const staleResult = await getPlanningArtifactStaleness(
    input.projectId,
    input.targetKind,
    versionResult.data.id,
  )
  return NextResponse.json({
    state: 'complete',
    jobId: input.job.id,
    artifact: versionResult.data,
    stale: staleResult.success ? staleResult.data : { isStale: true, reasons: [] },
  })
}

async function failClaim(
  job: PlanningHandoffJob,
  claimToken: string,
  errorCode: string,
): Promise<void> {
  await failPlanningHandoff({
    projectId: job.project_id,
    jobId: job.id,
    claimToken,
    errorCode,
  }).catch(() => undefined)
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON body.', 400)
  }
  const parsed = handoffRequestSchema.safeParse(body)
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid handoff request.', 400)
  }
  const input = parsed.data

  const supabase = await createClient()
  const auth = await getUserWithDevAuth(supabase)
  if (auth.error || !auth.data.user) return errorResponse('Unauthorized.', 401)

  const projectResult = await getProjectById(input.projectId)
  if (
    !projectResult.success ||
    projectResult.data.user_id !== auth.data.user.id ||
    projectResult.data.mode !== 'architecture'
  ) {
    return errorResponse('Project access denied.', 403)
  }

  const sourceKind = input.targetKind === 'work_plan' ? 'architecture' : 'work_plan'
  const [sourceResult, planningStateResult] = await Promise.all([
    getPlanningArtifactVersion(input.projectId, sourceKind, input.sourceVersionId),
    getPlanningState(input.projectId),
  ])
  if (!sourceResult.success || sourceResult.data?.content_state !== 'complete') {
    return errorResponse(
      sourceResult.success ? 'A complete source version is required.' : sourceResult.error,
      409,
    )
  }
  if (
    !planningStateResult.success ||
    planningStateResult.data === null ||
    !planningStateResult.data.staged_workflow_enabled
  ) {
    return errorResponse('The staged planning workflow is unavailable for this project.', 409)
  }

  let decisions: ArchitectureReadinessDecision[] = []
  if (sourceKind === 'architecture') {
    const readinessResult = await getLatestArchitectureReadinessReport(
      input.projectId,
      sourceResult.data.id,
    )
    const report = readinessResult.success ? readinessResult.data?.report : null
    if (
      !report ||
      report.freshness !== 'current' ||
      !report.handoffEligible ||
      report.architectureVersionId !== sourceResult.data.id ||
      report.architectureContentHash !== sourceResult.data.content_hash ||
      report.evaluatedRevision !== planningStateResult.data.write_safety_revision
    ) {
      return errorResponse(
        'Architecture is not ready for a Work Plan. Review the readiness checks first.',
        409,
      )
    }
    const decisionsResult = await listPlanningDecisions(input.projectId)
    if (!decisionsResult.success) return errorResponse(decisionsResult.error, 500)
    decisions = decisionsResult.data.filter(
      (decision) => decision.artifact_version_id === sourceResult.data?.id,
    )
  } else {
    const workPlanVersion = sourceResult.data as CompletePlanningArtifactVersion<'work_plan'>
    const freshness = await getPlanningArtifactStaleness(
      input.projectId,
      'work_plan',
      sourceResult.data.id,
    )
    if (!freshness.success || freshness.data.isStale) {
      return errorResponse('Refresh the stale Work Plan before creating a Handoff.', 409)
    }
    if (workPlanVersion.content.unresolved_blockers.length > 0) {
      return errorResponse('Resolve the Work Plan blockers before creating a Handoff.', 409)
    }
  }

  const beginResult = await beginPlanningHandoff(input)
  if (!beginResult.success) return errorResponse(beginResult.error, 409)
  const claimResult = await claimPlanningHandoff({
    projectId: input.projectId,
    jobId: beginResult.data.id,
  })
  if (!claimResult.success) return errorResponse(claimResult.error, 409)
  if (claimResult.data.outcome === 'complete') {
    return loadCompletedResult({
      projectId: input.projectId,
      targetKind: input.targetKind,
      job: claimResult.data.job,
    })
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

  const claimedJob = claimResult.data.job
  const claimToken = claimedJob.claim_token
  if (!claimToken) return errorResponse('The handoff lease could not be acquired.', 500)

  const rateLimit = chatRateLimiter.check(auth.data.user.id)
  if (!rateLimit.allowed) {
    await failClaim(claimedJob, claimToken, 'rate_limited')
    return NextResponse.json(
      { state: 'failed', error: 'Too many planning requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  let content: unknown
  let renderedMarkdown: string | null = null
  if (input.targetKind === 'work_plan') {
    const architectureVersion = sourceResult.data as CompletePlanningArtifactVersion<'architecture'>
    const generated = await generateWorkPlan({
      projectName: projectResult.data.name,
      architectureVersion,
      decisions,
      signal: request.signal,
    })
    if (!generated.success) {
      await failClaim(claimedJob, claimToken, generated.code)
      return errorResponse(generated.error, 502)
    }
    content = generated.data
  } else {
    const workPlanVersion = sourceResult.data as CompletePlanningArtifactVersion<'work_plan'>
    const handoffContent = buildExecutionHandoffContent(workPlanVersion)
    content = handoffContent
    renderedMarkdown = renderExecutionHandoffPacket({
      projectName: projectResult.data.name,
      content: handoffContent,
    })
  }

  const completeResult = await completePlanningHandoff({
    projectId: input.projectId,
    jobId: claimedJob.id,
    claimToken,
    targetKind: input.targetKind,
    content,
    renderedMarkdown,
  })
  if (!completeResult.success) {
    await failClaim(claimedJob, claimToken, 'commit_failed')
    return errorResponse(completeResult.error, 500)
  }

  const staleResult = await getPlanningArtifactStaleness(
    input.projectId,
    input.targetKind,
    completeResult.data.id,
  )
  return NextResponse.json({
    state: 'complete',
    jobId: claimedJob.id,
    artifact: completeResult.data,
    stale: staleResult.success ? staleResult.data : { isStale: true, reasons: [] },
  })
}
