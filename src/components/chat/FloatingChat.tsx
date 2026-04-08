'use client'

import { useEffect } from 'react'
import ChatInput from '@/components/chat/ChatInput'
import ChatMessageList from '@/components/chat/ChatMessageList'
import type { ChatMessage } from '@/types/chat'

type FloatingChatProps = {
  messages: ChatMessage[]
  isLoading: boolean
  streamingContent: string
  toolActivity: string | null
  toolCalls?: string[]
  onSend: (message: string) => void
  isOpen: boolean
  onToggle: () => void
  subtitle?: string
  isPeeking?: boolean
  examplePrompts?: string[]
}

export default function FloatingChat({
  messages,
  isLoading,
  streamingContent,
  toolActivity,
  toolCalls = [],
  onSend,
  isOpen,
  onToggle,
  subtitle = 'Ask MermaidAI to sketch modules or refine the active module flow.',
  isPeeking = false,
  examplePrompts,
}: FloatingChatProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onToggle()
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onToggle])

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] flex flex-col gap-3 sm:left-auto sm:right-6 sm:w-[min(400px,calc(100vw-3rem))]">
      {isOpen && (
        <section
          id="assistant-chat-panel"
          className={`flex max-h-[min(70vh,560px)] min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 transition-all duration-150 ${
            isPeeking ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100'
          }`}
          data-testid="chat-panel"
          role="dialog"
          aria-label="Assistant"
          aria-modal="false"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Assistant
              </h2>
              <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
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
            <ChatInput onSend={onSend} isLoading={isLoading} autoFocus />
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'assistant-chat-panel' : undefined}
        className={`ml-auto flex items-center justify-center shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
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
