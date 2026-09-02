// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePlanningHandoff } from '@/hooks/usePlanningHandoff'

describe('usePlanningHandoff', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('acknowledges locally before the request resolves and completes once', async () => {
    let resolveFetch: ((response: Response) => void) | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      usePlanningHandoff({
        projectId: 'project-1',
        sourceVersionId: 'version-1',
        targetKind: 'work_plan',
        onComplete,
      }),
    )

    act(() => {
      void result.current.run()
    })

    expect(result.current.status).toBe('starting')
    await act(async () => {
      resolveFetch?.(Response.json({ state: 'complete' }))
    })
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(result.current.status).toBe('idle')
  })

  it('surfaces a safe failure and can clear it for retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ state: 'failed', error: 'Architecture is not ready.' }, { status: 409 }),
    )
    const { result } = renderHook(() =>
      usePlanningHandoff({
        projectId: 'project-1',
        sourceVersionId: 'version-1',
        targetKind: 'work_plan',
        onComplete: vi.fn(),
      }),
    )

    await act(async () => {
      await result.current.run()
    })
    expect(result.current.status).toBe('failed')
    expect(result.current.error).toBe('Architecture is not ready.')

    act(() => result.current.dismissError())
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('restarts the automatic handoff after the Strict Mode effect replay', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockImplementationOnce((_input, init) => {
      const signal = init?.signal
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('The request was cancelled.', 'AbortError')),
          { once: true },
        )
      })
    })
    fetchMock.mockResolvedValueOnce(Response.json({ state: 'complete' }))
    const onComplete = vi.fn()

    renderHook(
      () =>
        usePlanningHandoff({
          projectId: 'project-1',
          sourceVersionId: 'version-1',
          targetKind: 'work_plan',
          startImmediately: true,
          onComplete,
        }),
      { reactStrictMode: true },
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      signal: expect.objectContaining({ aborted: true }),
    })
  })
})
