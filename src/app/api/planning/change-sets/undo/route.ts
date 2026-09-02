import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getUserWithDevAuth } from '@/lib/auth/dev-auth'
import {
  undoLatestArchitectureChangeSet,
  undoLatestWorkPlanChangeSet,
} from '@/lib/services/change-set-service'
import { getProjectById } from '@/lib/services/project-service'
import { createClient } from '@/lib/supabase/server'

const requestSchema = z
  .object({
    projectId: z.uuid(),
    stage: z.enum(['architecture', 'work_plan']),
    targetChangeSetId: z.uuid(),
    undoChangeSetId: z.uuid(),
  })
  .strict()
  .refine((input) => input.targetChangeSetId !== input.undoChangeSetId, {
    path: ['undoChangeSetId'],
    message: 'Undo change set ID must be different from its target.',
  })

function errorResponse(error: string, status: number) {
  return NextResponse.json({ state: 'failed', error }, { status })
}

function errorStatus(error: string): number {
  return /current tip|not undoable|changed|stale|already|version chain/i.test(error) ? 409 : 500
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
    return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid undo request.', 400)
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

  const serviceInput = {
    projectId: input.projectId,
    targetChangeSetId: input.targetChangeSetId,
    undoChangeSetId: input.undoChangeSetId,
  }

  if (input.stage === 'architecture') {
    const result = await undoLatestArchitectureChangeSet(serviceInput)
    if (!result.success) return errorResponse(result.error, errorStatus(result.error))
    return NextResponse.json({ state: 'complete', receipt: result.data })
  }

  const result = await undoLatestWorkPlanChangeSet(serviceInput)
  if (!result.success) return errorResponse(result.error, errorStatus(result.error))
  return NextResponse.json({
    state: 'complete',
    artifact: result.data.version,
    assistantMessage: result.data.assistantMessage,
    receipt: result.data.receipt,
  })
}
