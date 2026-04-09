'use client'

import { useMemo, useState } from 'react'
import type { OpenQuestion } from '@/types/graph'

const SKIP_CONFIRM_KEY = 'question-resolve-skip-confirm'

interface OpenQuestionsPanelProps {
  questions: OpenQuestion[]
  onResolve?: (question: string) => void
}

export default function OpenQuestionsPanel({ questions, onResolve }: OpenQuestionsPanelProps) {
  const openCount = useMemo(() => questions.filter((q) => q.status === 'open').length, [questions])

  const [isOpen, setIsOpen] = useState(true)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [skipConfirm, setSkipConfirm] = useState(false)

  const openOnly = useMemo(() => questions.filter((q) => q.status === 'open'), [questions])

  const grouped = useMemo(() => {
    const map = new Map<string, OpenQuestion[]>()
    for (const q of openOnly) {
      const list = map.get(q.section) ?? []
      list.push(q)
      map.set(q.section, list)
    }
    return map
  }, [openOnly])

  function handleQuestionClick(question: string) {
    if (!onResolve) return
    const shouldSkip = localStorage.getItem(SKIP_CONFIRM_KEY) === '1'
    if (shouldSkip) {
      onResolve(question)
      return
    }
    setPendingQuestion(question)
  }

  function handleConfirm() {
    if (!pendingQuestion || !onResolve) return
    if (skipConfirm) {
      localStorage.setItem(SKIP_CONFIRM_KEY, '1')
    }
    onResolve(pendingQuestion)
    setPendingQuestion(null)
    setSkipConfirm(false)
  }

  function handleCancel() {
    setPendingQuestion(null)
    setSkipConfirm(false)
  }

  return (
    <>
      <div data-testid="open-questions-panel" className="border-t border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <span className="flex items-center gap-2">
            Open Questions
            {openCount > 0 && (
              <span
                data-testid="open-count"
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-white"
              >
                {openCount}
              </span>
            )}
          </span>
          <span className="text-slate-400">{isOpen ? '\u25BC' : '\u25B2'}</span>
        </button>

        {isOpen && (
          <div className="max-h-64 overflow-y-auto px-4 pb-3">
            {openOnly.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">No open questions yet.</p>
            ) : (
              <div className="space-y-3">
                {Array.from(grouped.entries()).map(([section, items]) => (
                  <div key={section}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      {section}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {items.map((q) => (
                        <li key={q.id}>
                          {onResolve ? (
                            <button
                              type="button"
                              onClick={() => handleQuestionClick(q.question)}
                              className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left text-sm transition hover:bg-amber-50"
                              title="Click to resolve with AI"
                            >
                              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">
                                ?
                              </span>
                              <span className="text-slate-700">{q.question}</span>
                            </button>
                          ) : (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">
                                ?
                              </span>
                              <span className="text-slate-700">{q.question}</span>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {pendingQuestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Resolve question"
        >
          <div className="mx-4 w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
            <h2 className="text-sm font-semibold text-gray-900">Resolve with AI?</h2>
            <p className="mt-2 text-sm text-gray-600">
              This will send the question to the chat assistant to help resolve it:
            </p>
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              &ldquo;{pendingQuestion}&rdquo;
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-500">
              <input
                type="checkbox"
                checked={skipConfirm}
                onChange={(e) => setSkipConfirm(e.target.checked)}
                className="rounded border-gray-300"
              />
              Don&apos;t ask me again
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
