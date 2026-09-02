// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useScopeArchitectureHandoff } from '@/hooks/useScopeArchitectureHandoff'

describe('useScopeArchitectureHandoff', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('checks for an existing job, acknowledges immediately, and completes once', async () => {
    let resolvePost: ((response: Response) => void) | undefined
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(Response.json({ state: 'idle', requestKey: null }))
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolvePost = resolve
        }),
    )
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useScopeArchitectureHandoff({ projectId: 'project-1', onComplete }),
    )

    await waitFor(() => expect(result.current.status).toBe('idle'))
    act(() => {
      void result.current.run()
    })
    expect(result.current.status).toBe('starting')

    await act(async () => {
      resolvePost?.(Response.json({ state: 'complete' }))
    })
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(result.current.status).toBe('idle')
  })

  it('retries a failed handoff with the exact same request identity', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(Response.json({ state: 'idle', requestKey: null }))
    fetchMock.mockResolvedValueOnce(
      Response.json({ state: 'failed', error: 'Generation failed.' }, { status: 502 }),
    )
    fetchMock.mockResolvedValueOnce(Response.json({ state: 'complete' }))
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useScopeArchitectureHandoff({ projectId: 'project-1', onComplete }),
    )

    await waitFor(() => expect(result.current.status).toBe('idle'))
    await act(async () => {
      await result.current.run()
    })
    expect(result.current.error).toBe('Generation failed.')

    await act(async () => {
      await result.current.retry()
    })
    expect(onComplete).toHaveBeenCalledTimes(1)

    const firstBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    const retryBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))
    expect(firstBody.requestKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(retryBody).toEqual(firstBody)
  })

  it('automatically resumes the durable job returned after a reload', async () => {
    const requestKey = '11111111-1111-4111-8111-111111111111'
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(Response.json({ state: 'running', requestKey, jobId: 'job-1' }))
    fetchMock.mockResolvedValueOnce(Response.json({ state: 'complete' }))
    const onComplete = vi.fn()

    renderHook(() => useScopeArchitectureHandoff({ projectId: 'project-1', onComplete }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      projectId: 'project-1',
      requestKey,
    })
  })
})
