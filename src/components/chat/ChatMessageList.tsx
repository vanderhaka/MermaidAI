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
}

function ThinkingIndicator() {
  return (
    <div data-role="assistant" className="flex justify-start">
      <div aria-label="Thinking" className="rounded-lg bg-gray-100 px-4 py-2 text-gray-500">
        <span className="animate-pulse">...</span>
      </div>
    </div>
  )
}

function ToolActivityIndicator({ activity }: { activity: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <div className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />
      <span className="text-xs font-medium text-purple-600">{activity}</span>
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  if (isUser) {
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

export default function ChatMessageList({
  messages,
  isLoading,
  streamingContent,
  toolActivity,
  toolCalls = [],
}: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const showEmpty = messages.length === 0 && !isLoading

  if (showEmpty) {
    return (
      <div role="log" aria-live="polite" className="flex flex-1 items-center justify-center p-8">
        <p className="text-center text-gray-500">Describe what you want to build</p>
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
      {showLiveActivity && <ToolActivityIndicator activity={toolActivity} />}
      {isLoading && !streamingContent && !toolActivity && <ThinkingIndicator />}
      {showCompletedTools && !isLoading && <ToolCallsSummary calls={toolCalls} />}
      {streamingMessage && <MessageBubble message={streamingMessage} />}
      <div ref={scrollRef} data-testid="scroll-anchor" />
    </div>
  )
}
