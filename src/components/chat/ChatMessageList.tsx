'use client'

import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import type { ChatMessage } from '@/types/chat'

interface ChatMessageListProps {
  messages: ChatMessage[]
  isLoading: boolean
  streamingContent?: string
  toolActivity?: string | null
  toolCalls?: string[]
  onSend?: (message: string) => void
  examplePrompts?: string[]
}

function ThinkingIndicator() {
  return (
    <div data-role="assistant" className="flex justify-start">
      <div
        aria-label="Thinking"
        className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-4 py-3"
      >
        <span className="thinking-dot h-2 w-2 rounded-full bg-purple-400" />
        <span className="thinking-dot h-2 w-2 rounded-full bg-purple-400" />
        <span className="thinking-dot h-2 w-2 rounded-full bg-purple-400" />
      </div>
    </div>
  )
}

function ToolActivityIndicator({ activity }: { activity: string }) {
  return (
    <div data-role="assistant" className="flex justify-start">
      <div className="flex items-center gap-2.5 rounded-lg bg-purple-50 px-4 py-2.5">
        <div className="flex items-center gap-1">
          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-purple-400" />
          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-purple-400" />
          <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-purple-400" />
        </div>
        <span className="text-xs font-medium text-purple-600">{activity}…</span>
      </div>
    </div>
  )
}

function ToolCallsSummary({ calls }: { calls: string[] }) {
  const [isOpen, setIsOpen] = useState(false)

  if (calls.length === 0) return null

  if (calls.length === 1) {
    return (
      <div className="flex items-center gap-2 px-1 py-1">
        <div className="h-2 w-2 rounded-full bg-purple-400" />
        <span className="text-xs font-medium text-purple-600">{calls[0]}</span>
      </div>
    )
  }

  return (
    <div className="px-1 py-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium text-purple-600 hover:text-purple-800"
      >
        <div className="h-2 w-2 rounded-full bg-purple-400" />
        <span>{calls.length} tools used</span>
        <svg
          className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <ul className="mt-1.5 space-y-1 border-l-2 border-purple-200 pl-3">
          {calls.map((call, i) => (
            <li key={i} className="text-xs text-purple-500">
              {call}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Detects the scope-upload message marker. Upload messages are persisted as:
 *   📎 <filename>
 *
 *   <optional user note>
 *
 *   -----BEGIN SCOPE DOCUMENT-----
 *   <parsed text>
 *   -----END SCOPE DOCUMENT-----
 */
const DOC_PREFIX = '📎 '
const DOC_START = '-----BEGIN SCOPE DOCUMENT-----'
const DOC_END = '-----END SCOPE DOCUMENT-----'

function parseUploadedDoc(content: string): { filename: string; note: string } | null {
  if (!content.startsWith(DOC_PREFIX)) return null
  const newlineIdx = content.indexOf('\n')
  if (newlineIdx === -1) return null
  const startIdx = content.indexOf(DOC_START)
  const endIdx = content.indexOf(DOC_END, startIdx + DOC_START.length)
  if (startIdx === -1 || endIdx === -1) return null

  const header = content.slice(DOC_PREFIX.length, newlineIdx)
  const filename = header.trim()
  if (!filename) return null

  const between = content.slice(newlineIdx + 1, startIdx).trim()
  return { filename, note: between }
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  if (isUser) {
    const uploaded = parseUploadedDoc(message.content)
    if (uploaded) {
      return (
        <article
          aria-label="user message"
          data-role="user"
          data-upload
          className="flex justify-end"
        >
          <div className="max-w-[80%] space-y-2">
            <div className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4 shrink-0"
                aria-hidden
              >
                <path
                  fillRule="evenodd"
                  d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="truncate font-medium">{uploaded.filename}</span>
            </div>
            {uploaded.note && (
              <div className="rounded-lg bg-blue-600 px-4 py-2 text-white">
                <p className="whitespace-pre-wrap">{uploaded.note}</p>
              </div>
            )}
          </div>
        </article>
      )
    }

    return (
      <article aria-label="user message" data-role="user" className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-blue-600 px-4 py-2 text-white">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </article>
    )
  }

  return (
    <article aria-label="assistant message" data-role="assistant" className="w-full">
      <div className="prose prose-sm max-w-none text-gray-900">
        <Markdown>{message.content}</Markdown>
      </div>
    </article>
  )
}

const EXAMPLE_PROMPTS = [
  'We need a user signup flow with email verification',
  'Map out a payment processing system',
  'Build an order tracking pipeline',
]

export default function ChatMessageList({
  messages,
  isLoading,
  streamingContent,
  toolActivity,
  toolCalls = [],
  onSend,
  examplePrompts,
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const showEmpty = messages.length === 0 && !isLoading

  if (showEmpty) {
    return (
      <div
        role="log"
        aria-live="polite"
        className="flex flex-1 flex-col items-center justify-center gap-4 p-6"
      >
        <p className="text-center text-sm text-gray-500">Describe what you want to build</p>
        {onSend && (
          <div className="flex flex-col gap-1.5">
            {(examplePrompts ?? EXAMPLE_PROMPTS).map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onSend(prompt)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-left text-xs text-gray-500 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <div ref={scrollRef} data-testid="scroll-anchor" />
      </div>
    )
  }

  const streamingMessage: ChatMessage | null =
    isLoading && streamingContent
      ? {
          id: '__streaming__',
          role: 'assistant',
          content: streamingContent,
          operations: [],
          createdAt: '',
        }
      : null

  // Show live activity while streaming, or completed summary after
  const showLiveActivity = isLoading && toolActivity
  const showCompletedTools = toolCalls.length > 0

  return (
    <div role="log" aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isLoading && !streamingContent && !toolActivity && <ThinkingIndicator />}
      {showCompletedTools && !isLoading && <ToolCallsSummary calls={toolCalls} />}
      {streamingMessage && <MessageBubble message={streamingMessage} />}
      {showLiveActivity && <ToolActivityIndicator activity={toolActivity} />}
      <div ref={scrollRef} data-testid="scroll-anchor" />
    </div>
  )
}
