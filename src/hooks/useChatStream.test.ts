// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatStream, type ChatStream, type UseChatStreamOptions } from '@/hooks/useChatStream'
import { TOOL_EVENT_DELIMITER } from '@/lib/services/llm-shared'
import { useGraphStore } from '@/store/graph-store'
import type { ChatMessage } from '@/types/chat'

type Options = UseChatStreamOptions<void>

function makeOptions(overrides: Partial<Options> = {}): Options {
  return {
    projectId: 'proj-1',
    initialMessages: [],
    fallbackErrorMessage: 'Something went wrong',
    buildTurnRequest: () => ({
      mode: 'scope_build',
      context: {
        projectId: 'proj-1',
        projectName: 'Storefront',
        activeModuleId: 'mod-1',
        mode: 'scope_build',
        modules: [{ id: 'mod-1', name: 'Scope' }],
      },
    }),
    applyToolEvent: (tool, _data, recordToolCall) => recordToolCall(`Applied ${tool}`),
    ...overrides,
  }
}

const architecturePlanningLink = {
  stage: 'architecture' as const,
  artifactId: '11111111-1111-4111-8111-111111111111',
  artifactVersionId: '22222222-2222-4222-8222-222222222222',
  expectedRevision: 7,
}

/** Lets the deferred mount effects run, as they would before a user can type. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function renderChatStream(options: Options = makeOptions()) {
  const rendered = renderHook((props: Options) => useChatStream(props), { initialProps: options })
  await settle()
  return rendered
}

function makeServerMessage(content: string): ChatMessage {
  return {
    id: `server-${content}`,
    role: 'assistant',
    content,
    operations: [],
    createdAt: '2026-01-01T00:00:00Z',
  }
}

function toolEventChunk(tool: string, data: Record<string, unknown>): string {
  return `${TOOL_EVENT_DELIMITER}${JSON.stringify({ tool, data })}\n`
}

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  let index = 0

  return new Response(
    new ReadableStream({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close()
          return
        }
        controller.enqueue(encoder.encode(chunks[index++]))
      },
    }),
    { status: 200 },
  )
}

/** Streams one chunk, then hangs until the request is aborted. */
function hangingStreamResponse(text: string, signal: AbortSignal | undefined) {
  const encoder = new TextEncoder()
  let sentFirstChunk = false

  return new Response(
    new ReadableStream({
      pull(controller) {
        if (!sentFirstChunk) {
          sentFirstChunk = true
          controller.enqueue(encoder.encode(text))
          return
        }

        return new Promise<never>((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          )
        })
      },
    }),
    { status: 200 },
  )
}

/** Streams one chunk of prose, then breaks. */
function streamErrorAfterTextResponse(text: string) {
  const encoder = new TextEncoder()
  let sentFirstChunk = false

  return new Response(
    new ReadableStream({
      pull(controller) {
        if (!sentFirstChunk) {
          sentFirstChunk = true
          controller.enqueue(encoder.encode(text))
          return
        }

        controller.error(new Error('Stream collapsed'))
      },
    }),
    { status: 200 },
  )
}

async function startTurn(chat: { current: ChatStream<void> }, message: string): Promise<void> {
  await act(async () => {
    void chat.current.sendMessage(message)
  })
}

function contentsOf(chat: { current: ChatStream<void> }): string[] {
  return chat.current.messages.map((entry) => entry.content)
}

describe('useChatStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useGraphStore.getState().reset()
    window.localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Assistant response')))
  })

  it('sends the turn, applies its tool events, and commits the answer', async () => {
    const onTurnEnd = vi.fn()
    vi.mocked(fetch).mockResolvedValueOnce(
      streamResponse([toolEventChunk('create_node', { node: { id: 'node-1' } }), 'Mapped it.']),
    )
    const { result } = await renderChatStream(
      makeOptions({ initialMessages: [makeServerMessage('Earlier answer')], onTurnEnd }),
    )

    let sent: boolean | undefined
    await act(async () => {
      sent = await result.current.sendMessage('Map the lead journey')
    })

    expect(sent).toBe(true)
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        projectId: 'proj-1',
        message: 'Map the lead journey',
        mode: 'scope_build',
        helperMode: true,
        context: {
          projectId: 'proj-1',
          projectName: 'Storefront',
          activeModuleId: 'mod-1',
          mode: 'scope_build',
          modules: [{ id: 'mod-1', name: 'Scope' }],
        },
        history: [{ role: 'assistant', content: 'Earlier answer' }],
        turn: expect.objectContaining({
          expectedRevision: 0,
          planningStage: null,
          artifactId: null,
          artifactVersionId: null,
        }),
      }),
    )

    expect(contentsOf(result)).toEqual(['Earlier answer', 'Map the lead journey', 'Mapped it.'])
    expect(result.current.messages[2].toolCalls).toEqual(['Applied create_node'])
    // The turn is over: nothing is left streaming or marked busy.
    expect(result.current.isSending).toBe(false)
    expect(result.current.streamingContent).toBe('')
    expect(result.current.toolActivity).toBeNull()
    expect(result.current.chatError).toBeNull()
    expect(onTurnEnd).toHaveBeenCalledWith({
      message: 'Map the lead journey',
      extra: undefined,
      completedSuccessfully: true,
      graphChanged: true,
      appliedTools: ['create_node'],
    })
  })

  it('creates one stable planning identity and an ordered operation pool for a send', async () => {
    const { result } = await renderChatStream(
      makeOptions({ planningLink: architecturePlanningLink }),
    )

    await act(async () => {
      await result.current.sendMessage('Map the lead journey')
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body)) as {
      turn: {
        turnId: string
        userMessageKey: string
        assistantMessageKey: string
        changeSetId: string
        expectedRevision: number
        operationIds: string[]
        planningStage: string
        artifactId: string
        artifactVersionId: string
      }
    }

    expect(body.turn).toEqual(
      expect.objectContaining({
        expectedRevision: 7,
        planningStage: 'architecture',
        artifactId: architecturePlanningLink.artifactId,
        artifactVersionId: architecturePlanningLink.artifactVersionId,
      }),
    )
    const generatedIds = [
      body.turn.turnId,
      body.turn.userMessageKey,
      body.turn.assistantMessageKey,
      body.turn.changeSetId,
      ...body.turn.operationIds,
    ]
    for (const id of generatedIds) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    }
    expect(body.turn.operationIds.length).toBeGreaterThan(0)
    expect(new Set(body.turn.operationIds).size).toBe(body.turn.operationIds.length)
    expect(result.current.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        turnId: body.turn.turnId,
        messageKey: body.turn.userMessageKey,
      }),
      expect.objectContaining({
        role: 'assistant',
        turnId: body.turn.turnId,
        messageKey: body.turn.assistantMessageKey,
      }),
    ])
  })

  it('rejects an overlapping turn before it mutates the conversation', async () => {
    const cleanupController = new AbortController()
    vi.mocked(fetch).mockResolvedValueOnce(
      hangingStreamResponse('Still mapping', cleanupController.signal),
    )
    const { result } = await renderChatStream()

    await startTurn(result, 'Map the lead journey')
    await waitFor(() => {
      expect(result.current.streamingContent).toBe('Still mapping')
    })

    let accepted: boolean | undefined
    try {
      await act(async () => {
        accepted = await result.current.sendMessage('Start a second plan')
      })

      expect(accepted).toBe(false)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(contentsOf(result)).toEqual(['Map the lead journey'])
    } finally {
      cleanupController.abort()
      await waitFor(() => {
        expect(result.current.isSending).toBe(false)
      })
    }
  })

  it('treats a stop as a graceful end, keeping the partial answer without an error', async () => {
    const onTurnEnd = vi.fn()
    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(hangingStreamResponse('Half an answer', init?.signal ?? undefined)),
    )
    const { result } = await renderChatStream(makeOptions({ onTurnEnd }))

    await startTurn(result, 'Map the lead journey')
    await waitFor(() => {
      expect(result.current.streamingContent).toBe('Half an answer')
    })

    act(() => {
      result.current.stop()
    })

    await waitFor(() => {
      expect(result.current.isSending).toBe(false)
    })
    expect(contentsOf(result)).toEqual([
      'Map the lead journey',
      'Half an answer\n\n⚠ Response interrupted',
    ])
    expect(result.current.chatError).toBeNull()
    expect(onTurnEnd).toHaveBeenCalledWith(
      expect.objectContaining({ completedSuccessfully: false }),
    )
  })

  it('marks an interrupted assistant as partial when an Architecture batch already committed', async () => {
    const changeSummary = {
      capabilitiesCreated: 0,
      connectionsCreated: 0,
      assumptionsRecorded: 0,
      questionsRecorded: 0,
      created: 0,
      updated: 1,
      deleted: 0,
      assumed: 0,
      resolved: 0,
      provisional: true,
    }
    vi.mocked(fetch).mockImplementationOnce((_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        turn: {
          turnId: string
          changeSetId: string
          operationIds: string[]
          expectedRevision: number
        }
      }
      return Promise.resolve(
        hangingStreamResponse(
          toolEventChunk('update_module', {
            change_summary: changeSummary,
            __chatTurnReceipt: {
              turnId: body.turn.turnId,
              changeSetId: body.turn.changeSetId,
              operationId: body.turn.operationIds[0],
              sequence: 0,
              status: 'committed',
              expectedRevision: body.turn.expectedRevision,
              committedRevision: body.turn.expectedRevision + 1,
            },
          }) + 'Updated the boundary.',
          init?.signal ?? undefined,
        ),
      )
    })
    const { result } = await renderChatStream(
      makeOptions({
        planningLink: architecturePlanningLink,
        getCommittedMessageMetadata: () => ({ change_summary: changeSummary }),
      }),
    )

    await startTurn(result, 'Tighten the boundary')
    await waitFor(() => expect(result.current.streamingContent).toBe('Updated the boundary.'))
    act(() => result.current.stop())
    await waitFor(() => expect(result.current.isSending).toBe(false))

    expect(result.current.messages[1]).toEqual(
      expect.objectContaining({
        changeSetId: expect.any(String),
        metadata: expect.objectContaining({ turn_status: 'partial' }),
      }),
    )
  })

  it('surfaces the failure and still commits what the assistant had said', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(streamErrorAfterTextResponse('Partial thought'))
    const { result } = await renderChatStream()

    let sent: boolean | undefined
    await act(async () => {
      sent = await result.current.sendMessage('Map the lead journey')
    })

    expect(sent).toBe(false)
    expect(result.current.chatError).toBe('Stream collapsed')
    expect(contentsOf(result)).toEqual([
      'Map the lead journey',
      'Partial thought\n\n⚠ Response interrupted',
    ])
  })

  it('falls back to the caller-supplied message when the failure has none', async () => {
    vi.mocked(fetch).mockRejectedValueOnce('not an error object')
    const { result } = await renderChatStream()

    await act(async () => {
      await result.current.sendMessage('Map the lead journey')
    })

    expect(result.current.chatError).toBe('Something went wrong')
    // Nothing streamed, so the user's bubble goes back with it.
    expect(contentsOf(result)).toEqual([])
  })

  it('drops the stale user bubble when retrying, rather than duplicating it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(streamErrorAfterTextResponse('Partial thought'))
    const { result } = await renderChatStream()

    await act(async () => {
      await result.current.sendMessage('Map the lead journey')
    })
    expect(result.current.retry).toBeDefined()

    await act(async () => {
      result.current.retry?.()
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2)
    })
    const [, retryInit] = vi.mocked(fetch).mock.calls[1]
    const firstBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))
    const retryBody = JSON.parse(String(retryInit?.body))
    expect(retryBody.message).toBe('Map the lead journey')
    expect(retryBody.turn).toEqual(
      expect.objectContaining({
        turnId: firstBody.turn.turnId,
        userMessageKey: firstBody.turn.userMessageKey,
        changeSetId: firstBody.turn.changeSetId,
        expectedRevision: firstBody.turn.expectedRevision,
        operationIds: firstBody.turn.operationIds,
      }),
    )
    expect(retryBody.turn.assistantMessageKey).not.toBe(firstBody.turn.assistantMessageKey)
    await waitFor(() => {
      expect(result.current.chatError).toBeNull()
    })
    expect(contentsOf(result).filter((content) => content === 'Map the lead journey')).toHaveLength(
      1,
    )
  })

  it('advances the next fresh turn from a committed receipt without changing Retry identity', async () => {
    const committedArtifactVersionId = '66666666-6666-4666-8666-666666666666'
    let receipt: Record<string, unknown> | undefined
    vi.mocked(fetch)
      .mockImplementationOnce((_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          turn: {
            turnId: string
            changeSetId: string
            operationIds: string[]
            expectedRevision: number
          }
        }
        receipt = {
          turnId: body.turn.turnId,
          changeSetId: body.turn.changeSetId,
          operationId: body.turn.operationIds[0],
          sequence: 0,
          status: 'committed',
          expectedRevision: body.turn.expectedRevision,
          committedRevision: body.turn.expectedRevision + 1,
          artifactVersionId: committedArtifactVersionId,
        }
        return Promise.resolve(
          streamResponse([
            toolEventChunk('capture_architecture_map', { __chatTurnReceipt: receipt }),
            'Mapped it.',
          ]),
        )
      })
      .mockResolvedValueOnce(streamResponse(['Refined it.']))

    const { result } = await renderChatStream(
      makeOptions({ planningLink: architecturePlanningLink }),
    )

    await act(async () => {
      await result.current.sendMessage('Build it')
      await result.current.sendMessage('Refine it')
    })

    const secondBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body))
    expect(secondBody.turn).toEqual(
      expect.objectContaining({
        expectedRevision: 8,
        artifactVersionId: committedArtifactVersionId,
      }),
    )
  })

  it('attaches trusted tool metadata to the current assistant message after its receipt commits', async () => {
    const changeSummary = {
      capabilitiesCreated: 4,
      connectionsCreated: 3,
      assumptionsRecorded: 2,
      questionsRecorded: 1,
      provisional: true,
    }
    vi.mocked(fetch).mockImplementationOnce((_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        turn: {
          turnId: string
          changeSetId: string
          operationIds: string[]
          expectedRevision: number
        }
      }
      return Promise.resolve(
        streamResponse([
          toolEventChunk('capture_architecture_map', {
            change_summary: changeSummary,
            __chatTurnReceipt: {
              turnId: body.turn.turnId,
              changeSetId: body.turn.changeSetId,
              operationId: body.turn.operationIds[0],
              sequence: 0,
              status: 'committed',
              expectedRevision: body.turn.expectedRevision,
              committedRevision: body.turn.expectedRevision + 1,
              artifactVersionId: '66666666-6666-4666-8666-666666666666',
            },
          }),
          'Mapped it.',
        ]),
      )
    })
    const getCommittedMessageMetadata = vi.fn((_tool: string, data: Record<string, unknown>) => ({
      change_summary: data.change_summary,
    }))
    const { result } = await renderChatStream(
      makeOptions({ planningLink: architecturePlanningLink, getCommittedMessageMetadata }),
    )

    await act(async () => {
      await result.current.sendMessage('Build it')
    })

    expect(getCommittedMessageMetadata).toHaveBeenCalledTimes(1)
    expect(result.current.messages[1]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        changeSetId: expect.any(String),
        metadata: { change_summary: changeSummary },
      }),
    )
  })

  it('does not attach tool metadata when the claimed receipt did not commit this turn', async () => {
    vi.mocked(fetch).mockImplementationOnce((_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        turn: { changeSetId: string; operationIds: string[]; expectedRevision: number }
      }
      return Promise.resolve(
        streamResponse([
          toolEventChunk('capture_architecture_map', {
            change_summary: { provisional: true },
            __chatTurnReceipt: {
              turnId: '99999999-9999-4999-8999-999999999999',
              changeSetId: body.turn.changeSetId,
              operationId: body.turn.operationIds[0],
              sequence: 0,
              status: 'committed',
              expectedRevision: body.turn.expectedRevision,
              committedRevision: body.turn.expectedRevision + 1,
            },
          }),
          'No committed map.',
        ]),
      )
    })
    const getCommittedMessageMetadata = vi.fn(() => ({ change_summary: {} }))
    const { result } = await renderChatStream(
      makeOptions({ planningLink: architecturePlanningLink, getCommittedMessageMetadata }),
    )

    await act(async () => {
      await result.current.sendMessage('Build it')
    })

    expect(getCommittedMessageMetadata).not.toHaveBeenCalled()
    expect(result.current.messages[1].changeSetId).toBeNull()
    expect(result.current.messages[1].metadata).toBeUndefined()
  })

  it('does not advance from a receipt whose operation identity is out of order', async () => {
    const mismatchedArtifactVersionId = '66666666-6666-4666-8666-666666666666'
    vi.mocked(fetch)
      .mockImplementationOnce((_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          turn: {
            turnId: string
            changeSetId: string
            operationIds: string[]
            expectedRevision: number
          }
        }
        return Promise.resolve(
          streamResponse([
            toolEventChunk('capture_architecture_map', {
              __chatTurnReceipt: {
                turnId: body.turn.turnId,
                changeSetId: body.turn.changeSetId,
                operationId: body.turn.operationIds[1],
                sequence: 0,
                status: 'committed',
                expectedRevision: body.turn.expectedRevision,
                committedRevision: body.turn.expectedRevision + 1,
                artifactVersionId: mismatchedArtifactVersionId,
              },
            }),
            'Mapped it.',
          ]),
        )
      })
      .mockResolvedValueOnce(streamResponse(['Refined it.']))

    const { result } = await renderChatStream(
      makeOptions({ planningLink: architecturePlanningLink }),
    )

    await act(async () => {
      await result.current.sendMessage('Build it')
      await result.current.sendMessage('Refine it')
    })

    const secondBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body))
    expect(secondBody.turn).toEqual(
      expect.objectContaining({
        expectedRevision: architecturePlanningLink.expectedRevision,
        artifactVersionId: architecturePlanningLink.artifactVersionId,
      }),
    )
  })

  it('offers no retry once the caller clears it', async () => {
    const { result } = await renderChatStream()

    await act(async () => {
      await result.current.sendMessage('Map the lead journey')
    })
    expect(result.current.retry).toBeDefined()

    act(() => {
      result.current.clearRetry()
    })

    expect(result.current.retry).toBeUndefined()
  })

  it('does not let server history landing mid-turn wipe the in-flight conversation', async () => {
    vi.mocked(fetch).mockImplementationOnce((_input, init) =>
      Promise.resolve(hangingStreamResponse('Working on it', init?.signal ?? undefined)),
    )
    const { result, rerender } = await renderChatStream()

    await startTurn(result, 'Map the lead journey')
    await waitFor(() => {
      expect(result.current.streamingContent).toBe('Working on it')
    })

    // A refresh re-renders with server-side messages that predate this turn.
    rerender(makeOptions({ initialMessages: [makeServerMessage('Stale server history')] }))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(contentsOf(result)).toEqual(['Map the lead journey'])

    // Once the turn ends, server state is allowed to win again.
    act(() => {
      result.current.stop()
    })
    await waitFor(() => {
      expect(result.current.isSending).toBe(false)
    })
    rerender(makeOptions({ initialMessages: [makeServerMessage('Stale server history')] }))

    await waitFor(() => {
      expect(contentsOf(result)).toEqual(['Stale server history'])
    })
  })

  it('keeps its own empty-state messages when the server has no history', async () => {
    const options = makeOptions({
      emptyStateMessages: () => [makeServerMessage('Welcome aboard')],
    })
    const { result, rerender } = await renderChatStream(options)

    expect(contentsOf(result)).toEqual(['Welcome aboard'])

    rerender(makeOptions({ emptyStateMessages: options.emptyStateMessages }))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(contentsOf(result)).toEqual(['Welcome aboard'])
  })

  it('remembers the auto-decide preference per project', async () => {
    const { result } = await renderChatStream()

    expect(result.current.helperMode).toBe(true)

    act(() => {
      result.current.toggleHelperMode()
    })

    expect(result.current.helperMode).toBe(false)
    expect(window.localStorage.getItem('mermaid:auto-decide:proj-1')).toBe('0')

    const restored = await renderChatStream()
    await waitFor(() => {
      expect(restored.result.current.helperMode).toBe(false)
    })
  })

  it('uses and updates the server preference for a staged Architecture turn', async () => {
    const persistHelperMode = vi.fn().mockResolvedValue({
      success: true,
      expectedRevision: 8,
    })
    const { result } = await renderChatStream(
      makeOptions({
        planningLink: architecturePlanningLink,
        initialHelperMode: false,
        persistHelperMode,
      }),
    )

    expect(result.current.helperMode).toBe(false)

    await act(async () => {
      await result.current.toggleHelperMode()
    })

    expect(result.current.helperMode).toBe(true)
    expect(persistHelperMode).toHaveBeenCalledWith({ enabled: true, expectedRevision: 7 })
    expect(window.localStorage.getItem('mermaid:auto-decide:proj-1')).toBeNull()

    await act(async () => {
      await result.current.sendMessage('Map the booking journey')
    })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.helperMode).toBe(true)
    expect(body.turn.expectedRevision).toBe(8)
  })

  it('rolls back a staged Auto-Decide toggle when persistence fails', async () => {
    const persistHelperMode = vi.fn().mockResolvedValue({
      success: false,
      error: 'Architecture changed. Refresh and try again.',
    })
    const { result } = await renderChatStream(
      makeOptions({
        planningLink: architecturePlanningLink,
        initialHelperMode: true,
        persistHelperMode,
      }),
    )

    await act(async () => {
      await result.current.toggleHelperMode()
    })

    expect(result.current.helperMode).toBe(true)
    expect(result.current.chatError).toBe('Architecture changed. Refresh and try again.')
  })
})
