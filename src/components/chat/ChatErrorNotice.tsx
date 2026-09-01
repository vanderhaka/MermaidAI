'use client'

interface ChatErrorNoticeProps {
  message: string
  /** Re-sends the last user message. Omitted when there is nothing to retry. */
  onRetry?: () => void
  onDismiss?: () => void
}

/**
 * Failure notice rendered inside the chat panel. The panel is fixed and can
 * cover anything below it, so errors have to live where the user is looking.
 */
export default function ChatErrorNotice({ message, onRetry, onDismiss }: ChatErrorNoticeProps) {
  return (
    <div
      role="alert"
      data-testid="chat-error-notice"
      className="flex shrink-0 items-center gap-2 border-t border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700"
    >
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="shrink-0 rounded p-0.5 text-red-500 hover:bg-red-100 hover:text-red-800"
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
      )}
    </div>
  )
}
