'use client'

import { useState, type FormEvent, type KeyboardEvent } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  isLoading: boolean
  autoFocus?: boolean
}

export default function ChatInput({ onSend, isLoading, autoFocus }: ChatInputProps) {
  const [message, setMessage] = useState('')

  function send() {
    const trimmed = message.trim()
    if (!trimmed) return
    onSend(trimmed)
    setMessage('')
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    send()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Chat input">
      <label htmlFor="chat-message" className="sr-only">
        Message
      </label>
      <div className="flex items-center gap-2">
        <textarea
          id="chat-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want to build..."
          disabled={isLoading}
          autoFocus={autoFocus}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </form>
  )
}
