'use client'

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import ChatInput from '@/components/chat/ChatInput'
import ChatMessageList from '@/components/chat/ChatMessageList'
import type { ChatMessage } from '@/types/chat'

type FloatingChatProps = {
  messages: ChatMessage[]
  isLoading: boolean
  streamingContent: string
  toolActivity: string | null
  toolCalls?: string[]
  onSend: (message: string) => void | Promise<boolean | void>
  onAttachFile?: (file: File, note: string) => void | Promise<boolean | void>
  isOpen: boolean
  onToggle: () => void
  subtitle?: string
  isPeeking?: boolean
  examplePrompts?: string[]
}

const DEFAULT_CHAT_SIZE = {
  width: 760,
  height: 640,
}
const MIN_CHAT_WIDTH = 360
const MIN_CHAT_HEIGHT = 360
const DESKTOP_GUTTER = 48
const MOBILE_GUTTER = 32
const VERTICAL_RESERVED_SPACE = 120
const CHAT_SIZE_STORAGE_KEY = 'mermaidai.assistantChatSize'

type ChatSize = typeof DEFAULT_CHAT_SIZE
type ResizeAxis = 'width' | 'height' | 'both'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getChatSizeLimits(): ChatSize {
  if (typeof window === 'undefined') return DEFAULT_CHAT_SIZE

  const horizontalGutter = window.innerWidth >= 640 ? DESKTOP_GUTTER : MOBILE_GUTTER
  return {
    width: Math.max(MIN_CHAT_WIDTH, window.innerWidth - horizontalGutter),
    height: Math.max(MIN_CHAT_HEIGHT, window.innerHeight - VERTICAL_RESERVED_SPACE),
  }
}

function clampChatSize(size: ChatSize): ChatSize {
  const limits = getChatSizeLimits()

  return {
    width: clamp(size.width, Math.min(MIN_CHAT_WIDTH, limits.width), limits.width),
    height: clamp(size.height, Math.min(MIN_CHAT_HEIGHT, limits.height), limits.height),
  }
}

function readStoredChatSize(): ChatSize {
  if (typeof window === 'undefined') return DEFAULT_CHAT_SIZE

  try {
    const raw = window.localStorage.getItem(CHAT_SIZE_STORAGE_KEY)
    if (!raw) return clampChatSize(DEFAULT_CHAT_SIZE)

    const parsed = JSON.parse(raw) as Partial<ChatSize>
    if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
      return clampChatSize(DEFAULT_CHAT_SIZE)
    }

    return clampChatSize({ width: parsed.width, height: parsed.height })
  } catch {
    return clampChatSize(DEFAULT_CHAT_SIZE)
  }
}

function storeChatSize(size: ChatSize) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(CHAT_SIZE_STORAGE_KEY, JSON.stringify(size))
  } catch {
    // Ignore storage failures; resizing should still work.
  }
}

export default function FloatingChat({
  messages,
  isLoading,
  streamingContent,
  toolActivity,
  toolCalls = [],
  onSend,
  onAttachFile,
  isOpen,
  onToggle,
  subtitle = 'Ask MermaidAI to sketch modules or refine the active module flow.',
  isPeeking = false,
  examplePrompts,
}: FloatingChatProps) {
  const [chatSize, setChatSize] = useState<ChatSize>(DEFAULT_CHAT_SIZE)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onToggle()
      }
      if (e.key === 'Escape' && isOpen) {
        // Closing unmounts the panel (and any draft in the input) — don't do it
        // while the user is focused in a form field.
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return
        e.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onToggle])

  useEffect(() => {
    const restoreStoredSize = window.setTimeout(() => {
      const next = readStoredChatSize()
      storeChatSize(next)
      setChatSize(next)
    }, 0)

    function handleWindowResize() {
      setChatSize((current) => {
        const next = clampChatSize(current)
        storeChatSize(next)
        return next
      })
    }

    window.addEventListener('resize', handleWindowResize)
    return () => {
      window.clearTimeout(restoreStoredSize)
      window.removeEventListener('resize', handleWindowResize)
    }
  }, [])

  function startResize(axis: ResizeAxis, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return

    event.preventDefault()

    const startX = event.clientX
    const startY = event.clientY
    const startSize = chatSize
    const originalCursor = document.body.style.cursor
    const originalUserSelect = document.body.style.userSelect

    document.body.style.cursor =
      axis === 'both' ? 'nwse-resize' : axis === 'width' ? 'ew-resize' : 'ns-resize'
    document.body.style.userSelect = 'none'

    function handlePointerMove(moveEvent: PointerEvent) {
      setChatSize(() => {
        const next = clampChatSize({
          width:
            axis === 'width' || axis === 'both'
              ? startSize.width + startX - moveEvent.clientX
              : startSize.width,
          height:
            axis === 'height' || axis === 'both'
              ? startSize.height + startY - moveEvent.clientY
              : startSize.height,
        })
        storeChatSize(next)
        return next
      })
    }

    function handlePointerUp() {
      document.body.style.cursor = originalCursor
      document.body.style.userSelect = originalUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-3 sm:right-6"
      style={{ width: chatSize.width }}
    >
      {isOpen && (
        <section
          id="assistant-chat-panel"
          className={`pointer-events-auto relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 transition-all duration-150 ${
            isPeeking ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100'
          }`}
          style={{ height: chatSize.height }}
          data-testid="chat-panel"
          role="dialog"
          aria-label="Assistant"
          aria-modal="false"
        >
          <button
            type="button"
            aria-label="Resize assistant height and width"
            title="Drag to resize assistant"
            data-testid="chat-resize-handle"
            onPointerDown={(event) => startResize('both', event)}
            className="absolute left-1 top-1 z-20 h-6 w-6 cursor-nwse-resize rounded-md text-gray-300 transition hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="absolute left-1.5 top-1.5 block h-3.5 w-3.5 rounded-tl border-l-2 border-t-2 border-current" />
          </button>
          <button
            type="button"
            aria-label="Resize assistant height"
            title="Drag to resize assistant height"
            onPointerDown={(event) => startResize('height', event)}
            className="absolute left-8 right-8 top-0 z-10 h-2 cursor-ns-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <button
            type="button"
            aria-label="Resize assistant width"
            title="Drag to resize assistant width"
            onPointerDown={(event) => startResize('width', event)}
            className="absolute bottom-8 left-0 top-8 z-10 w-2 cursor-ew-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Assistant
              </h2>
              <p className="mt-1 text-pretty text-sm text-gray-500">{subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onToggle}
                className="shrink-0 rounded-lg p-2 text-gray-500 transition-[background-color,color,scale] duration-150 ease-out hover:bg-gray-100 hover:text-gray-900 active:scale-[0.96]"
                aria-label="Minimize assistant"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          <ChatMessageList
            messages={messages}
            isLoading={isLoading}
            streamingContent={streamingContent}
            toolActivity={toolActivity}
            toolCalls={toolCalls}
            onSend={onSend}
            examplePrompts={examplePrompts}
          />

          <div className="shrink-0 border-t border-gray-200 p-4">
            <ChatInput
              onSend={onSend}
              onAttachFile={onAttachFile}
              isLoading={isLoading}
              autoFocus
            />
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'assistant-chat-panel' : undefined}
        className={`pointer-events-auto ml-auto flex items-center justify-center shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
          isOpen
            ? 'h-14 w-14 rounded-full bg-black text-white hover:bg-gray-800'
            : 'h-14 gap-2.5 rounded-full bg-black pl-5 pr-6 text-white hover:bg-gray-800'
        }`}
        title={isOpen ? 'Hide assistant' : 'Open assistant'}
      >
        {isOpen ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-7 w-7"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-6 w-6"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">Ask AI</span>
          </>
        )}
        <span className="sr-only">{isOpen ? 'Hide assistant' : 'Open assistant'}</span>
      </button>
    </div>
  )
}
