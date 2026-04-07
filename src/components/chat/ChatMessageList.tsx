'use client'

import { useEffect, useRef } from 'react'
import Markdown from 'react-markdown'
import type { ChatMessage } from '@/types/chat'

interface ChatMessageListProps {
  messages: ChatMessage[]
  isLoading: boolean
  streamingContent?: string
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

  return (
    <div role="log" aria-live="polite" className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isLoading && !streamingContent && <ThinkingIndicator />}
      {streamingMessage && <MessageBubble message={streamingMessage} />}
      <div ref={scrollRef} data-testid="scroll-anchor" />
    </div>
  )
}
