import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getUserWithDevAuth } from '@/lib/auth/dev-auth'
import { chatRateLimiter } from '@/lib/rate-limiter'
import { addChatMessage, listChatMessages } from '@/lib/services/chat-message-service'
import {
  getActivePlanningArtifactVersion,
  getPlanningArtifactStaleness,
  getPlanningArtifactVersion,
} from '@/lib/services/planning-artifact-service'
import { listPlanningDecisions } from '@/lib/services/planning-decision-service'
import { getPlanningState } from '@/lib/services/planning-state-service'
import { getProjectById } from '@/lib/services/project-service'
import { refineWorkPlan } from '@/lib/services/work-plan-refinement-service'
import {
  commitWorkPlanRevision,
  getCommittedWorkPlanRevision,
  type WorkPlanRevisionRequest,
} from '@/lib/services/work-plan-revision-service'
import { createClient } from '@/lib/supabase/server'

const requestSchema = z
  .object({
    projectId: z.uuid(),
    workPlanVersionId: z.uuid(),
    message: z.string().trim().min(1).max(20_000),
    turnId: z.uuid(),
    changeSetId: z.uuid(),
    userMessageKey: z.uuid(),
    assistantMessageKey: z.uuid(),
  })
  .strict()

function errorResponse(error: string, status: number) {
  return NextResponse.json({ state: 'failed', error }, { status })
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
    return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid refinement request.', 400)
  }
  const input = parsed.data

  const supabase = await createClient()
  const auth = await getUserWithDevAuth(supabase)
  if (auth.error || !auth.data.user) return errorResponse('Unauthorized.', 401)

  const [projectResult, stateResult] = await Promise.all([
    getProjectById(input.projectId),
    getPlanningState(input.projectId),
  ])
  if (
    !projectResult.success ||
    projectResult.data.user_id !== auth.data.user.id ||
    projectResult.data.mode !== 'architecture'
  ) {
    return errorResponse('Project access denied.', 403)
  }
  if (
    !stateResult.success ||
    stateResult.data === null ||
    !stateResult.data.staged_workflow_enabled
  ) {
    return errorResponse('The staged planning workflow is unavailable for this project.', 409)
  }

  const activeWorkPlanResult = await getActivePlanningArtifactVersion(input.projectId, 'work_plan')
  if (!activeWorkPlanResult.success || activeWorkPlanResult.data?.content_state !== 'complete') {
    return errorResponse(
      activeWorkPlanResult.success
        ? 'A complete Work Plan is required.'
        : activeWorkPlanResult.error,
      409,
    )
  }
  const activeWorkPlan = activeWorkPlanResult.data
  const revisionRequest: WorkPlanRevisionRequest = {
    projectId: input.projectId,
    expectedWorkPlanVersionId: input.workPlanVersionId,
    sourceArchitectureVersionId: activeWorkPlan.content.source_architecture_version.id,
    changeSetId: input.changeSetId,
    turnId: input.turnId,
    userMessageKey: input.userMessageKey,
    assistantMessageKey: input.assistantMessageKey,
    message: input.message,
  }

  const replayResult = await getCommittedWorkPlanRevision(revisionRequest)
  if (!replayResult.success) return errorResponse(replayResult.error, 409)
  if (replayResult.data) {
    return NextResponse.json({
      state: 'complete',
      artifact: replayResult.data.version,
      assistantMessage: replayResult.data.assistantMessage,
      receipt: { ...replayResult.data.receipt, replayed: true },
    })
  }

  if (activeWorkPlan.id !== input.workPlanVersionId) {
    return errorResponse(
      `Work Plan v${activeWorkPlan.version} is now active. Refresh before applying this message.`,
      409,
    )
  }

  const rateLimit = chatRateLimiter.check(auth.data.user.id)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { state: 'failed', error: 'Too many planning requests. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
    )
  }

  const [sourceResult, stalenessResult, decisionsResult, messagesResult] = await Promise.all([
    getPlanningArtifactVersion(
      input.projectId,
      'architecture',
      activeWorkPlan.content.source_architecture_version.id,
    ),
    getPlanningArtifactStaleness(input.projectId, 'work_plan', activeWorkPlan.id),
    listPlanningDecisions(input.projectId),
    listChatMessages(input.projectId),
  ])
  if (!sourceResult.success || sourceResult.data?.content_state !== 'complete') {
    return errorResponse(
      sourceResult.success
        ? 'The Work Plan source Architecture is unavailable.'
        : sourceResult.error,
      409,
    )
  }
  if (!stalenessResult.success || stalenessResult.data.isStale) {
    return errorResponse(
      'Refresh this Work Plan from the current Architecture before refining it.',
      409,
    )
  }
  if (!decisionsResult.success) return errorResponse(decisionsResult.error, 500)
  if (!messagesResult.success) return errorResponse(messagesResult.error, 500)

  const userMessageResult = await addChatMessage({
    project_id: input.projectId,
    role: 'user',
    content: input.message,
    turn_id: input.turnId,
    message_key: input.userMessageKey,
    planning_stage: 'work_plan',
    artifact_id: activeWorkPlan.artifact_id,
    artifact_version_id: activeWorkPlan.id,
    metadata: { delivery_status: 'submitted' },
  })
  if (!userMessageResult.success) return errorResponse(userMessageResult.error, 500)

  const history = messagesResult.data
    .filter(
      (message) =>
        message.message_key !== input.userMessageKey &&
        message.artifact_id === activeWorkPlan.artifact_id &&
        message.planning_stage === 'work_plan' &&
        (message.role === 'user' || message.role === 'assistant'),
    )
    .slice(-30)
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }))

  const refinement = await refineWorkPlan({
    projectName: projectResult.data.name,
    architectureVersion: sourceResult.data,
    workPlanVersion: activeWorkPlan,
    decisions: decisionsResult.data.filter(
      (decision) => decision.artifact_version_id === sourceResult.data?.id,
    ),
    history,
    message: input.message,
    signal: request.signal,
  })
  if (!refinement.success) return errorResponse(refinement.error, 502)

  const committed = await commitWorkPlanRevision({
    ...revisionRequest,
    content: refinement.data.content,
    assistantContent: refinement.data.summary,
    summary: refinement.data.summary,
    commands: refinement.data.commands,
  })
  if (!committed.success) {
    const status = /changed while|no longer current|reused with different/i.test(committed.error)
      ? 409
      : 500
    return errorResponse(committed.error, status)
  }

  return NextResponse.json({
    state: 'complete',
    artifact: committed.data.version,
    assistantMessage: committed.data.assistantMessage,
    receipt: committed.data.receipt,
  })
}
