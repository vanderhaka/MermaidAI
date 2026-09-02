'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type PlanningHandoffTarget = 'work_plan' | 'execution_handoff'
type PlanningHandoffStatus = 'idle' | 'starting' | 'running' | 'failed'

type UsePlanningHandoffInput = {
  projectId: string
  sourceVersionId: string | null
  targetKind: PlanningHandoffTarget
  startImmediately?: boolean
  onComplete: () => void
}

type HandoffResponse =
  | { state: 'running' }
  | { state: 'complete' }
  | { state: 'failed'; error?: string }

const POLL_INTERVAL_MS = 700
const MAX_POLLS = 180

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, POLL_INTERVAL_MS)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeoutId)
        reject(new DOMException('The request was cancelled.', 'AbortError'))
      },
      { once: true },
    )
  })
}

export function usePlanningHandoff({
  projectId,
  sourceVersionId,
  targetKind,
  startImmediately = false,
  onComplete,
}: UsePlanningHandoffInput) {
  const [status, setStatus] = useState<PlanningHandoffStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const requestKeyRef = useRef<string | null>(null)
  const initialRequestStartedRef = useRef(false)

  const run = useCallback(async () => {
    if (!sourceVersionId || controllerRef.current) return

    const controller = new AbortController()
    const requestKey = requestKeyRef.current ?? crypto.randomUUID()
    controllerRef.current = controller
    requestKeyRef.current = requestKey
    setError(null)
    setStatus('starting')

    try {
      for (let poll = 0; poll < MAX_POLLS; poll += 1) {
        const response = await fetch('/api/planning/handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, sourceVersionId, targetKind, requestKey }),
          signal: controller.signal,
        })
        const payload = (await response.json().catch(() => null)) as HandoffResponse | null

        if (response.ok && payload?.state === 'complete') {
          setStatus('idle')
          requestKeyRef.current = null
          onComplete()
          return
        }
        if (response.status === 202 && payload?.state === 'running') {
          setStatus('running')
          await waitForPoll(controller.signal)
          continue
        }

        throw new Error(
          payload?.state === 'failed' && payload.error
            ? payload.error
            : 'The planning handoff could not be completed.',
        )
      }

      throw new Error('The planning handoff is still running. Try resuming it in a moment.')
    } catch (handoffError) {
      if (controller.signal.aborted) return
      setStatus('failed')
      setError(
        handoffError instanceof Error
          ? handoffError.message
          : 'The planning handoff could not be completed.',
      )
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [onComplete, projectId, sourceVersionId, targetKind])

  useEffect(() => {
    if (startImmediately && !initialRequestStartedRef.current && sourceVersionId) {
      initialRequestStartedRef.current = true
      void run()
    }

    return () => {
      const controller = controllerRef.current
      controllerRef.current = null
      initialRequestStartedRef.current = false
      controller?.abort()
    }
  }, [run, sourceVersionId, startImmediately])

  return {
    status,
    error,
    isRunning: status === 'starting' || status === 'running',
    run,
    dismissError: () => {
      setError(null)
      setStatus('idle')
      requestKeyRef.current = null
    },
  }
}
