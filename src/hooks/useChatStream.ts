import { useEffect, useRef, useState } from 'react'

import {
  GRAPH_MUTATION_TOOLS,
  readToolEventReceipt,
} from '@/components/dashboard/tool-event-applier'
import {
  INTERRUPTED_MARKER,
  formatToolName,
  makeLocalMessage,
  readAutoDecidePreference,
  writeAutoDecidePreference,
} from '@/lib/chat-turn'
import { createStreamParser } from '@/lib/stream-parser'
import { useGraphStore } from '@/store/graph-store'
import {
  CHAT_TURN_OPERATION_LIMIT,
  type ChatContext,
  type ChatMessage,
  type ChatMode,
  type ChatPlanningLink,
  type ChatToolReceipt,
  type ChatTurnIdentity,
} from '@/types/chat'

/** What the workspace varies about a single request to /api/chat. */
export type ChatTurnRequest = {
  mode: ChatMode
  context: ChatContext
}

/** How the turn ended, for the refresh and bookkeeping each workspace does. */
export type ChatTurnOutcome<TExtra> = {
  message: string
  extra: TExtra | undefined
  completedSuccessfully: boolean
  /** A tool that changes persisted graph state ran during the turn. */
  graphChanged: boolean
  /** Tools whose results were applied this turn, in arrival order. */
  appliedTools: string[]
}

export type UseChatStreamOptions<TExtra> = {
  projectId: string
  initialMessages: ChatMessage[]
  /** Present only for the staged Architecture path; legacy modes stay unchanged. */
  planningLink?: ChatPlanningLink
  /** Server-owned Auto-Decide state for staged planning; legacy modes omit it. */
  initialHelperMode?: boolean
  /** Persists staged Auto-Decide and returns the revision future turns must use. */
  persistHelperMode?: (input: {
    enabled: boolean
    expectedRevision: number
  }) => Promise<{ success: true; expectedRevision: number } | { success: false; error: string }>
  /** Seeds the panel when the server has no history yet — e.g. a welcome line. */
  emptyStateMessages?: () => ChatMessage[]
  /** Shown when a turn fails without an error message of its own. */
  fallbackErrorMessage: string
  buildTurnRequest: (message: string, extra: TExtra | undefined) => ChatTurnRequest
  applyToolEvent: (
    tool: string,
    data: Record<string, unknown>,
    recordToolCall: (label: string) => void,
  ) => void
  /** Optional workspace wording for a tool while it is actively running. */
  getToolActivityLabel?: (tool: string, phase: 'start' | 'committed') => string | undefined
  /** Metadata copied to the local assistant row only after this event's receipt is verified. */
  getCommittedMessageMetadata?: (
    tool: string,
    data: Record<string, unknown>,
  ) => Record<string, unknown> | null
  /** Messages the server never saw, so the model should not read them back. */
  isLocalOnlyMessage?: (entry: ChatMessage) => boolean
  onTurnEnd?: (outcome: ChatTurnOutcome<TExtra>) => void
}

export type ChatStream<TExtra> = {
  messages: ChatMessage[]
  isSending: boolean
  streamingContent: string
  toolActivity: string | null
  toolCalls: string[]
  chatError: string | null
  setChatError: (message: string | null) => void
  helperMode: boolean
  toggleHelperMode: () => Promise<void>
  sendMessage: (message: string, extra?: TExtra) => Promise<boolean>
  stop: () => void
  /** Undefined until there is a message worth re-sending. */
  retry: (() => void) | undefined
  /** Marks the panel busy for work that runs before a send — e.g. parsing an upload. */
  setSending: (value: boolean) => void
  /** Forgets the last send, so a failure that never reached the API offers no retry. */
  clearRetry: () => void
}

type LastSend<TExtra> = {
  message: string
  extra: TExtra | undefined
  userMessageId: string
  turnIdentity?: ChatTurnIdentity
}

function createTurnIdentity(planningLink?: ChatPlanningLink): ChatTurnIdentity {
  const operationIds = new Set<string>()
  while (operationIds.size < CHAT_TURN_OPERATION_LIMIT) operationIds.add(crypto.randomUUID())

  return {
    turnId: crypto.randomUUID(),
    userMessageKey: crypto.randomUUID(),
    assistantMessageKey: crypto.randomUUID(),
    changeSetId: crypto.randomUUID(),
    expectedRevision: planningLink?.expectedRevision ?? 0,
    operationIds: [...operationIds],
    planningStage: planningLink?.stage ?? null,
    artifactId: planningLink?.artifactId ?? null,
    artifactVersionId: planningLink?.artifactVersionId ?? null,
  }
}

function withTurnIdentity(
  message: ChatMessage,
  turnIdentity: ChatTurnIdentity | undefined,
  role: 'user' | 'assistant',
  committedReceipt?: ChatToolReceipt | null,
  metadata?: Record<string, unknown> | null,
): ChatMessage {
  if (!turnIdentity) return message

  return {
    ...message,
    turnId: turnIdentity.turnId,
    messageKey: role === 'user' ? turnIdentity.userMessageKey : turnIdentity.assistantMessageKey,
    planningStage: turnIdentity.planningStage,
    artifactId: turnIdentity.artifactId,
    artifactVersionId:
      committedReceipt?.status === 'committed' && committedReceipt.artifactVersionId
        ? committedReceipt.artifactVersionId
        : turnIdentity.artifactVersionId,
    changeSetId: committedReceipt?.status === 'committed' ? turnIdentity.changeSetId : null,
    ...(metadata ? { metadata } : {}),
  }
}

/**
 * One assistant turn, end to end: the optimistic bubble, the streamed answer,
 * the tool events it applies, and every way the turn can end. Workspaces supply
 * what varies — the request they build and what they do once the turn is over.
 */
export function useChatStream<TExtra = void>({
  projectId,
  initialMessages,
  planningLink,
  initialHelperMode,
  persistHelperMode,
  emptyStateMessages,
  fallbackErrorMessage,
  buildTurnRequest,
  applyToolEvent,
  getToolActivityLabel,
  getCommittedMessageMetadata,
  isLocalOnlyMessage,
  onTurnEnd,
}: UseChatStreamOptions<TExtra>): ChatStream<TExtra> {
  const [isSending, setIsSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  const [currentToolCalls, setCurrentToolCalls] = useState<string[]>([])
  const [chatError, setChatError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages.length > 0 ? initialMessages : (emptyStateMessages?.() ?? initialMessages),
  )
  const [helperMode, setHelperMode] = useState(initialHelperMode ?? true)
  const [lastSend, setLastSend] = useState<LastSend<TExtra> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const turnInFlightRef = useRef(false)
  // Ref, not state: the refresh effect below runs from a timeout and would
  // otherwise read a stale `isSending`.
  const isSendingRef = useRef(false)
  // Mirrors `currentToolCalls` so the send closure can read the turn's calls at
  // commit time — the state value it captured is a render behind.
  const turnToolCallsRef = useRef<string[]>([])
  const planningLinkRef = useRef(planningLink)
  const helperModeRef = useRef(initialHelperMode ?? true)
  const helperModeUpdateRef = useRef<Promise<void> | null>(null)

  const hasEmptyStateMessages = Boolean(emptyStateMessages)

  useEffect(() => {
    // An empty server history is no reason to drop our own empty-state seed.
    if (hasEmptyStateMessages && initialMessages.length === 0) return

    const timeout = window.setTimeout(() => {
      // A refresh landing mid-turn must not wipe the optimistic user bubble or
      // anything the current turn has already committed.
      if (isSendingRef.current) return
      setMessages(initialMessages)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [hasEmptyStateMessages, initialMessages])

  // Restored after mount, never during render: the server has no localStorage,
  // so reading it inline would make the first client render disagree with it.
  useEffect(() => {
    if (initialHelperMode !== undefined) {
      helperModeRef.current = initialHelperMode
      setHelperMode(initialHelperMode)
      return
    }

    const restoreStoredPreference = window.setTimeout(() => {
      const stored = readAutoDecidePreference(projectId)
      if (stored !== null) {
        helperModeRef.current = stored
        setHelperMode(stored)
      }
    }, 0)
    return () => window.clearTimeout(restoreStoredPreference)
  }, [initialHelperMode, projectId])

  useEffect(() => {
    planningLinkRef.current = planningLink
  }, [planningLink])

  async function toggleHelperMode(): Promise<void> {
    if (helperModeUpdateRef.current) return helperModeUpdateRef.current

    const previous = helperModeRef.current
    const next = !previous
    helperModeRef.current = next
    setHelperMode(next)

    if (!persistHelperMode) {
      writeAutoDecidePreference(projectId, next)
      return
    }

    const expectedRevision = planningLinkRef.current?.expectedRevision
    if (expectedRevision === undefined) {
      helperModeRef.current = previous
      setHelperMode(previous)
      setChatError('Auto-Decide could not be saved because planning state is unavailable.')
      return
    }

    const update = (async () => {
      try {
        const result = await persistHelperMode({ enabled: next, expectedRevision })
        if (!result.success) {
          helperModeRef.current = previous
          setHelperMode(previous)
          setChatError(result.error)
          return
        }

        if (planningLinkRef.current) {
          planningLinkRef.current = {
            ...planningLinkRef.current,
            expectedRevision: result.expectedRevision,
          }
        }
      } catch {
        helperModeRef.current = previous
        setHelperMode(previous)
        setChatError('Auto-Decide could not be saved. Try again.')
      }
    })()
    helperModeUpdateRef.current = update
    await update.finally(() => {
      if (helperModeUpdateRef.current === update) helperModeUpdateRef.current = null
    })
  }

  function addToolCall(label: string) {
    setToolActivity(label)
    turnToolCallsRef.current = [...turnToolCallsRef.current, label]
    setCurrentToolCalls(turnToolCallsRef.current)
  }

  /** Whatever the assistant said before the turn broke is still worth keeping. */
  function commitPartialAssistantText(
    text: string,
    turnIdentity: ChatTurnIdentity | undefined,
    committedReceipt: ChatToolReceipt | null,
    committedMessageMetadata: Record<string, unknown> | null,
  ) {
    const trimmed = text.trim()
    if (!trimmed) return

    setMessages((current) => [
      ...current,
      withTurnIdentity(
        makeLocalMessage(
          'assistant',
          `${trimmed}\n\n${INTERRUPTED_MARKER}`,
          turnToolCallsRef.current,
        ),
        turnIdentity,
        'assistant',
        committedReceipt,
        turnIdentity && committedReceipt
          ? { ...(committedMessageMetadata ?? {}), turn_status: 'partial' }
          : committedMessageMetadata,
      ),
    ])
  }

  function stop() {
    abortControllerRef.current?.abort()
  }

  function retry() {
    if (!lastSend) return
    setChatError(null)
    setMessages((current) => current.filter((entry) => entry.id !== lastSend.userMessageId))
    const retryIdentity = lastSend.turnIdentity
      ? { ...lastSend.turnIdentity, assistantMessageKey: crypto.randomUUID() }
      : undefined
    void sendMessageWithIdentity(lastSend.message, lastSend.extra, retryIdentity)
  }

  async function sendMessage(message: string, extra?: TExtra): Promise<boolean> {
    return sendMessageWithIdentity(message, extra)
  }

  async function sendMessageWithIdentity(
    message: string,
    extra: TExtra | undefined,
    retryIdentity?: ChatTurnIdentity,
  ): Promise<boolean> {
    if (helperModeUpdateRef.current) await helperModeUpdateRef.current
    if (turnInFlightRef.current) return false
    turnInFlightRef.current = true

    const turnIdentity = retryIdentity ?? createTurnIdentity(planningLinkRef.current)
    const optimisticUserMessage = withTurnIdentity(
      makeLocalMessage('user', message),
      turnIdentity,
      'user',
    )

    setMessages((current) => [...current, optimisticUserMessage])
    setLastSend({ message, extra, userMessageId: optimisticUserMessage.id, turnIdentity })
    setIsSending(true)
    isSendingRef.current = true
    setStreamingContent('')
    setToolActivity(null)
    turnToolCallsRef.current = []
    setCurrentToolCalls(turnToolCallsRef.current)
    useGraphStore.getState().beginTurnChanges()
    setChatError(null)

    const controller = new AbortController()
    abortControllerRef.current = controller

    let streamStarted = false
    let completedSuccessfully = false
    let graphChanged = false
    const appliedTools: string[] = []
    let assistantText = ''
    let committedReceipt: ChatToolReceipt | null = null
    let committedMessageMetadata: Record<string, unknown> | null = null

    try {
      const { mode, context } = buildTurnRequest(message, extra)

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          projectId,
          message,
          mode,
          helperMode: helperModeRef.current,
          context,
          history: messages
            .filter((entry) => !turnIdentity || entry.turnId !== turnIdentity.turnId)
            .filter((entry) => !isLocalOnlyMessage?.(entry))
            .map((entry) => ({
              role: entry.role,
              content: entry.content,
            })),
          ...(turnIdentity ? { turn: turnIdentity } : {}),
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to send chat message')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Assistant response stream was unavailable')
      }
      streamStarted = true

      const decoder = new TextDecoder()
      const parser = createStreamParser()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const { text, events } = parser.push(chunk)

        assistantText += text
        setStreamingContent(assistantText)

        for (const event of events) {
          if (event.status === 'start') {
            setToolActivity(
              getToolActivityLabel?.(event.tool, 'start') ?? formatToolName(event.tool),
            )
          } else if (event.data) {
            const receipt = readToolEventReceipt(event.data)
            let eventCommitted = false
            if (
              receipt?.status === 'committed' &&
              turnIdentity &&
              receipt.turnId === turnIdentity.turnId &&
              receipt.changeSetId === turnIdentity.changeSetId &&
              receipt.expectedRevision === turnIdentity.expectedRevision &&
              turnIdentity.operationIds[receipt.sequence] === receipt.operationId
            ) {
              eventCommitted = true
              committedReceipt = receipt
              const nextMetadata = getCommittedMessageMetadata?.(event.tool, event.data)
              if (nextMetadata) {
                committedMessageMetadata = {
                  ...(committedMessageMetadata ?? {}),
                  ...nextMetadata,
                }
              }
              const currentLink = planningLinkRef.current
              if (currentLink) {
                planningLinkRef.current = {
                  ...currentLink,
                  expectedRevision: receipt.committedRevision!,
                  artifactVersionId: receipt.artifactVersionId ?? currentLink.artifactVersionId,
                }
              }
            }
            if (GRAPH_MUTATION_TOOLS.has(event.tool)) {
              graphChanged = true
            }
            appliedTools.push(event.tool)
            applyToolEvent(event.tool, event.data, addToolCall)
            if (eventCommitted) {
              const committedActivity = getToolActivityLabel?.(event.tool, 'committed')
              if (committedActivity) setToolActivity(committedActivity)
            }
          }
        }
      }

      // Flush remaining
      const { text: remaining } = parser.flush()
      assistantText += remaining
      setStreamingContent(assistantText)

      if (assistantText.trim()) {
        setMessages((current) => [
          ...current,
          withTurnIdentity(
            makeLocalMessage('assistant', assistantText.trim(), turnToolCallsRef.current),
            turnIdentity,
            'assistant',
            committedReceipt,
            committedMessageMetadata,
          ),
        ])
      }
      completedSuccessfully = true
      return true
    } catch (err) {
      if (!streamStarted) {
        setMessages((current) => current.filter((entry) => entry.id !== optimisticUserMessage.id))
      }
      commitPartialAssistantText(
        assistantText,
        turnIdentity,
        committedReceipt,
        committedMessageMetadata,
      )

      // Stopping is a deliberate end to the turn, not a failure.
      if (controller.signal.aborted) return streamStarted

      setChatError(err instanceof Error ? err.message : fallbackErrorMessage)
      return false
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null
      turnInFlightRef.current = false
      isSendingRef.current = false
      setIsSending(false)
      setStreamingContent('')
      setToolActivity(null)
      onTurnEnd?.({ message, extra, completedSuccessfully, graphChanged, appliedTools })
    }
  }

  return {
    messages,
    isSending,
    streamingContent,
    toolActivity,
    toolCalls: currentToolCalls,
    chatError,
    setChatError,
    helperMode,
    toggleHelperMode,
    sendMessage,
    stop,
    retry: lastSend ? retry : undefined,
    setSending: (value: boolean) => {
      isSendingRef.current = value
      setIsSending(value)
    },
    clearRetry: () => setLastSend(null),
  }
}
