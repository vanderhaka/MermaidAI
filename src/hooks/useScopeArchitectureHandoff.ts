'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type ScopeHandoffStatus = 'idle' | 'checking' | 'starting' | 'running' | 'failed'

type ScopeHandoffResponse =
  | { state: 'idle'; requestKey: null }
  | { state: 'running'; requestKey?: string | null }
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

export function useScopeArchitectureHandoff({
  projectId,
  onComplete,
}: {
  projectId: string
  onComplete: () => void
}) {
  const [status, setStatus] = useState<ScopeHandoffStatus>('checking')
  const [error, setError] = useState<string | null>(null)
  const requestKeyRef = useRef<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const run = useCallback(
    async (resumedRequestKey?: string) => {
      if (controllerRef.current) return

      const controller = new AbortController()
      const requestKey = resumedRequestKey ?? requestKeyRef.current ?? crypto.randomUUID()
      controllerRef.current = controller
      requestKeyRef.current = requestKey
      setError(null)
      setStatus(resumedRequestKey ? 'running' : 'starting')

      try {
        for (let poll = 0; poll < MAX_POLLS; poll += 1) {
          const response = await fetch('/api/planning/scope-handoff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, requestKey }),
            signal: controller.signal,
          })
          const payload = (await response.json().catch(() => null)) as ScopeHandoffResponse | null

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
              : 'The Architecture could not be created from this Quick Capture.',
          )
        }

        throw new Error('The Architecture is still being prepared. Retry to resume the same job.')
      } catch (handoffError) {
        if (controller.signal.aborted) return
        setStatus('failed')
        setError(
          handoffError instanceof Error
            ? handoffError.message
            : 'The Architecture could not be created from this Quick Capture.',
        )
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null
      }
    },
    [onComplete, projectId],
  )

  useEffect(() => {
    const controller = new AbortController()

    async function resumeExistingJob() {
      try {
        const response = await fetch(
          `/api/planning/scope-handoff?projectId=${encodeURIComponent(projectId)}`,
          { signal: controller.signal },
        )
        const payload = (await response.json().catch(() => null)) as ScopeHandoffResponse | null
        if (!response.ok) {
          throw new Error(
            payload?.state === 'failed' && payload.error
              ? payload.error
              : 'Could not check the Architecture handoff.',
          )
        }
        if (payload?.state === 'running' && payload.requestKey) {
          requestKeyRef.current = payload.requestKey
          await run(payload.requestKey)
          return
        }
        setStatus('idle')
      } catch (resumeError) {
        if (controller.signal.aborted) return
        setStatus('failed')
        setError(
          resumeError instanceof Error
            ? resumeError.message
            : 'Could not check the Architecture handoff.',
        )
      }
    }

    void resumeExistingJob()
    return () => {
      controller.abort()
      controllerRef.current?.abort()
    }
  }, [projectId, run])

  return {
    status,
    error,
    isRunning: status === 'starting' || status === 'running',
    isChecking: status === 'checking',
    run: () => run(),
    retry: () => run(),
    dismissError: () => {
      setError(null)
      setStatus('idle')
    },
  }
}
