'use client'

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

interface ChatInputProps {
  onSend: (message: string) => void | Promise<boolean | void>
  isLoading: boolean
  /**
   * Focuses the textarea on mount and whenever this flips back to true — the
   * chat panel stays mounted when hidden, so remount can't do it for us.
   */
  autoFocus?: boolean
  /**
   * Cancels the in-flight response. When provided, a Stop control replaces the
   * inert "Sending" button while a response streams.
   */
  onStop?: () => void
  /**
   * Optional handler for file attachments. When provided, a paperclip button
   * is rendered next to Send. If a file is attached at submit time, this
   * handler is invoked instead of `onSend` with the file and any typed note.
   */
  onAttachFile?: (file: File, note: string) => void | Promise<boolean | void>
  /**
   * Accept attribute passed through to the hidden file input. Defaults to
   * the formats the scope upload endpoint supports.
   */
  acceptedFileTypes?: string
  /** Persists an unfinished draft across workspace navigation and refreshes. */
  draftStorageKey?: string
  /** Requests a conditional clear after a separate retry action succeeds. */
  resetSignal?: number
  /** Only clear when the current composer still exactly matches this submitted draft. */
  resetValue?: string
}

const DEFAULT_ACCEPT =
  '.pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ChatInput({
  onSend,
  isLoading,
  autoFocus,
  onStop,
  onAttachFile,
  acceptedFileTypes = DEFAULT_ACCEPT,
  draftStorageKey,
  resetSignal = 0,
  resetValue,
}: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null)
  const [observedResetSignal, setObservedResetSignal] = useState(resetSignal)
  const [queued, setQueued] = useState<string[]>([])
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  if (observedResetSignal !== resetSignal) {
    setObservedResetSignal(resetSignal)
    if (resetValue !== undefined && message === resetValue) setMessage('')
  }

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!draftStorageKey) {
        setMessage('')
        setLoadedDraftKey(null)
        return
      }
      try {
        setMessage(window.sessionStorage.getItem(draftStorageKey) ?? '')
      } catch {
        setMessage('')
      }
      setLoadedDraftKey(draftStorageKey)
    }, 0)
    return () => clearTimeout(timer)
  }, [draftStorageKey])

  useEffect(() => {
    if (!draftStorageKey || loadedDraftKey !== draftStorageKey) return
    try {
      if (message) window.sessionStorage.setItem(draftStorageKey, message)
      else window.sessionStorage.removeItem(draftStorageKey)
    } catch {
      // Storage may be unavailable; the in-memory draft still works.
    }
  }, [draftStorageKey, loadedDraftKey, message])

  // Flush queued messages once the in-flight response finishes. Messages typed
  // during a stream must never be dropped — scope mode is used live on calls.
  // Deferred via setTimeout so the flush runs as a callback (with cleanup
  // preventing double-sends), not as a cascading render inside the effect.
  useEffect(() => {
    if (isLoading || queued.length === 0) return
    const combined = queued.join('\n\n')
    const timer = setTimeout(() => {
      setQueued([])
      void (async () => {
        const didSend = await onSend(combined)
        if (didSend === false) {
          setMessage((current) => (current ? `${combined}\n\n${current}` : combined))
        }
      })()
    }, 0)
    return () => clearTimeout(timer)
  }, [isLoading, queued, onSend])

  async function send() {
    const trimmed = message.trim()
    if (attachedFile && onAttachFile) {
      if (isLoading) return
      const didAttach = await onAttachFile(attachedFile, trimmed)
      if (didAttach === false) return
      setMessage('')
      setAttachedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (!trimmed) return
    if (isLoading) {
      setQueued((current) => [...current, trimmed])
      setMessage('')
      return
    }
    // The message has been accepted for delivery, so free the composer now.
    // Waiting for the full assistant turn leaves the submitted prompt looking
    // unsent and makes an accidental duplicate queue much too easy.
    setMessage('')
    const didSend = await onSend(trimmed)
    if (didSend === false) {
      setMessage((current) => (current ? `${trimmed}\n\n${current}` : trimmed))
    }
  }

  function cancelQueued() {
    const combined = queued.join('\n\n')
    setQueued([])
    setMessage((current) => (current ? `${combined}\n\n${current}` : combined))
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void send()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setAttachedFile(file)
  }

  function clearFile() {
    setAttachedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const hasText = message.trim().length > 0
  const canSend = attachedFile ? !isLoading : hasText
  const showStop = isLoading && Boolean(onStop)
  // Stop takes over the button slot only when there is nothing to queue, so
  // clicking Queue mid-stream keeps working.
  const showSubmit = !showStop || hasText || Boolean(attachedFile)

  return (
    <form onSubmit={handleSubmit} aria-label="Chat input">
      <label htmlFor="chat-message" className="sr-only">
        Message
      </label>

      {queued.length > 0 && (
        <div
          data-testid="queued-messages-pill"
          className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
        >
          <span className="flex-1 truncate font-medium">
            {queued.length === 1 ? '1 message queued' : `${queued.length} messages queued`} — sends
            when the assistant finishes
          </span>
          <button
            type="button"
            onClick={cancelQueued}
            aria-label="Cancel queued messages"
            className="shrink-0 rounded p-0.5 text-amber-500 hover:bg-amber-100 hover:text-amber-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
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
      )}

      {attachedFile && (
        <div
          data-testid="attached-file-pill"
          className="mb-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800"
        >
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
          <span className="flex-1 truncate font-medium">{attachedFile.name}</span>
          <span className="shrink-0 text-blue-500">{formatFileSize(attachedFile.size)}</span>
          <button
            type="button"
            onClick={clearFile}
            aria-label={`Remove ${attachedFile.name}`}
            className="shrink-0 rounded p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
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
      )}

      <div className="flex items-center gap-2">
        {onAttachFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptedFileTypes}
              onChange={handleFileChange}
              className="hidden"
              data-testid="chat-file-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              aria-label="Attach document"
              title="Attach a document (PDF, DOCX, TXT, MD)"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 transition hover:border-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                  d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </>
        )}

        <textarea
          id="chat-message"
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isLoading
              ? 'Keep typing — sends when the assistant finishes'
              : attachedFile
                ? 'Add a note (optional) and press Send'
                : 'Describe what you want to build...'
          }
          rows={1}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 disabled:placeholder:text-gray-400"
        />
        {showStop && (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop response"
            title="Stop the assistant"
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 ${
              showSubmit ? 'h-9 w-9 justify-center' : 'px-4 py-2'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <rect x="5" y="5" width="10" height="10" rx="1.5" />
            </svg>
            {!showSubmit && 'Stop'}
          </button>
        )}
        {showSubmit && (
          <button
            type="submit"
            disabled={!canSend}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isLoading && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  opacity="0.25"
                />
                <path
                  d="M12 2a10 10 0 0110 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            )}
            {isLoading ? (hasText ? 'Queue' : 'Sending') : 'Send'}
          </button>
        )}
      </div>
    </form>
  )
}
