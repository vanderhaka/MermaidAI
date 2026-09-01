import { useEffect, useRef, useState } from 'react'

import { GRAPH_MUTATION_TOOLS } from '@/components/dashboard/tool-event-applier'
import {
  INTERRUPTED_MARKER,
  formatToolName,
  makeLocalMessage,
  readAutoDecidePreference,
  writeAutoDecidePreference,
} from '@/lib/chat-turn'
import { createStreamParser } from '@/lib/stream-parser'
import { useGraphStore } from '@/store/graph-store'
import type { ChatContext, ChatMessage, ChatMode } from '@/types/chat'

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
  toggleHelperMode: () => void
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
}

/**
 * One assistant turn, end to end: the optimistic bubble, the streamed answer,
 * the tool events it applies, and every way the turn can end. Workspaces supply
 * what varies — the request they build and what they do once the turn is over.
 */
export function useChatStream<TExtra = void>({
  projectId,
  initialMessages,
  emptyStateMessages,
  fallbackErrorMessage,
  buildTurnRequest,
  applyToolEvent,
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
  // On by default; the stored preference is read after mount so the server and
  // first client render agree.
  const [helperMode, setHelperMode] = useState(true)
  const [lastSend, setLastSend] = useState<LastSend<TExtra> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const turnInFlightRef = useRef(false)
  // Ref, not state: the refresh effect below runs from a timeout and would
  // otherwise read a stale `isSending`.
  const isSendingRef = useRef(false)
  // Mirrors `currentToolCalls` so the send closure can read the turn's calls at
  // commit time — the state value it captured is a render behind.
  const turnToolCallsRef = useRef<string[]>([])

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
    const restoreStoredPreference = window.setTimeout(() => {
      const stored = readAutoDecidePreference(projectId)
      if (stored !== null) setHelperMode(stored)
    }, 0)
    return () => window.clearTimeout(restoreStoredPreference)
  }, [projectId])

  function toggleHelperMode() {
    const next = !helperMode
    setHelperMode(next)
    writeAutoDecidePreference(projectId, next)
  }

  function addToolCall(label: string) {
    setToolActivity(label)
    turnToolCallsRef.current = [...turnToolCallsRef.current, label]
    setCurrentToolCalls(turnToolCallsRef.current)
  }

  /** Whatever the assistant said before the turn broke is still worth keeping. */
  function commitPartialAssistantText(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    setMessages((current) => [
      ...current,
      makeLocalMessage(
        'assistant',
        `${trimmed}\n\n${INTERRUPTED_MARKER}`,
        turnToolCallsRef.current,
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
    void sendMessage(lastSend.message, lastSend.extra)
  }

  async function sendMessage(message: string, extra?: TExtra): Promise<boolean> {
    if (turnInFlightRef.current) return false
    turnInFlightRef.current = true

    const optimisticUserMessage = makeLocalMessage('user', message)

    setMessages((current) => [...current, optimisticUserMessage])
    setLastSend({ message, extra, userMessageId: optimisticUserMessage.id })
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
          helperMode,
          context,
          history: messages
            .filter((entry) => !isLocalOnlyMessage?.(entry))
            .map((entry) => ({
              role: entry.role,
              content: entry.content,
            })),
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
            setToolActivity(formatToolName(event.tool))
          } else if (event.data) {
            if (GRAPH_MUTATION_TOOLS.has(event.tool)) {
              graphChanged = true
            }
            appliedTools.push(event.tool)
            applyToolEvent(event.tool, event.data, addToolCall)
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
          makeLocalMessage('assistant', assistantText.trim(), turnToolCallsRef.current),
        ])
      }
      completedSuccessfully = true
      return true
    } catch (err) {
      if (!streamStarted) {
        setMessages((current) => current.filter((entry) => entry.id !== optimisticUserMessage.id))
      }
      commitPartialAssistantText(assistantText)

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
