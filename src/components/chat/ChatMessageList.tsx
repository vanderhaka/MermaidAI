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

const RECOMMENDATION_PREFIX_RE =
  /^\s*(?:\*\*)?(?:recommended answer|recommendation|my recommendation)(?:\*\*)?\s*:\s*(.+)$/i

function normalizeAssistantSpacing(content: string): string {
  return content
    .replace(/([.!?])(?=(?:Now|Next|Then|Done|I'll)\b)/g, '$1\n\n')
    .replace(/:(?=(?:Now|Next|Then|Done)\b)/g, ':\n\n')
}

function stripQuestionEmphasis(content: string): string {
  return content.replace(/^\*\*(.+)\*\*$/s, '$1').trim()
}

function extractFollowUpQuestion(content: string): {
  body: string
  question: string | null
} {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
  const questionIndex = blocks.findLastIndex((block) => /\?\s*(?:\*\*)?\s*$/.test(block))

  if (questionIndex === -1) {
    return { body: content, question: null }
  }

  const [questionBlock] = blocks.splice(questionIndex, 1)

  return {
    body: blocks.join('\n\n'),
    question: stripQuestionEmphasis(questionBlock),
  }
}

function parseAssistantContent(content: string): {
  body: string
  question: string | null
  recommendation: string | null
} {
  const lines = content.split('\n')
  const recommendationIndex = lines.findIndex((line) => RECOMMENDATION_PREFIX_RE.test(line))

  if (recommendationIndex === -1) {
    const { body, question } = extractFollowUpQuestion(normalizeAssistantSpacing(content))
    return { body, question, recommendation: null }
  }

  const match = lines[recommendationIndex].match(RECOMMENDATION_PREFIX_RE)
  const recommendation = match?.[1]?.trim() ?? ''
  const rawBody = lines
    .filter((_, index) => index !== recommendationIndex)
    .join('\n')
    .trim()
  const { body, question } = extractFollowUpQuestion(
    rawBody ? normalizeAssistantSpacing(rawBody) : '',
  )

  return {
    body,
    question,
    recommendation: recommendation || null,
  }
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

function MessageBubble({
  message,
  onSend,
  isLoading,
}: {
  message: ChatMessage
  onSend?: (message: string) => void
  isLoading: boolean
}) {
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

  const { body, question, recommendation } = parseAssistantContent(message.content)

  return (
    <article aria-label="assistant message" data-role="assistant" className="w-full">
      {body && (
        <div className="prose prose-sm max-w-none text-gray-900 prose-p:my-2">
          <Markdown>{body}</Markdown>
        </div>
      )}
      {question && (
        <div
          data-testid="assistant-question"
          className="mt-3 rounded-xl bg-slate-950 px-4 py-3 text-white shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">Question</p>
          <p className="mt-1 text-base font-semibold leading-relaxed text-white">{question}</p>
        </div>
      )}
      {recommendation && (
        <div
          data-testid="assistant-recommendation"
          className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Recommended answer
          </p>
          <p className="mt-1 text-sm leading-relaxed text-blue-950">{recommendation}</p>
          {onSend && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onSend(`Accept suggestion: ${recommendation}`)}
              className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              Accept suggestion
            </button>
          )}
        </div>
      )}
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
  const containerRef = useRef<HTMLDivElement>(null)
  const pinnedToBottomRef = useRef(true)

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    pinnedToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  useEffect(() => {
    // Sending a message re-pins; otherwise respect the user scrolling up to read.
    const last = messages[messages.length - 1]
    if (last?.role === 'user') pinnedToBottomRef.current = true
    if (!pinnedToBottomRef.current) return
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
    <div
      role="log"
      aria-live="polite"
      ref={containerRef}
      onScroll={handleScroll}
      className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
    >
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} onSend={onSend} isLoading={isLoading} />
      ))}
      {isLoading && !streamingContent && !toolActivity && <ThinkingIndicator />}
      {showCompletedTools && !isLoading && <ToolCallsSummary calls={toolCalls} />}
      {streamingMessage && (
        <MessageBubble message={streamingMessage} onSend={onSend} isLoading={isLoading} />
      )}
      {showLiveActivity && <ToolActivityIndicator activity={toolActivity} />}
      <div ref={scrollRef} data-testid="scroll-anchor" />
    </div>
  )
}
