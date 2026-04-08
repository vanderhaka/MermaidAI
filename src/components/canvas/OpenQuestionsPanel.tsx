'use client'

import { useMemo, useState } from 'react'
import type { OpenQuestion } from '@/types/graph'

interface OpenQuestionsPanelProps {
  questions: OpenQuestion[]
}

export default function OpenQuestionsPanel({ questions }: OpenQuestionsPanelProps) {
  const openCount = useMemo(() => questions.filter((q) => q.status === 'open').length, [questions])

  const [isOpen, setIsOpen] = useState(true)

  const grouped = useMemo(() => {
    const map = new Map<string, OpenQuestion[]>()
    for (const q of questions) {
      const list = map.get(q.section) ?? []
      list.push(q)
      map.set(q.section, list)
    }
    return map
  }, [questions])

  return (
    <div data-testid="open-questions-panel" className="border-t border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
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
          {questions.length === 0 ? (
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
                      <li key={q.id} className="flex items-start gap-2 text-sm">
                        {q.status === 'open' ? (
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-white">
                            ?
                          </span>
                        ) : (
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white">
                            {'\u2713'}
                          </span>
                        )}
                        <span
                          className={
                            q.status === 'resolved'
                              ? 'text-slate-400 line-through'
                              : 'text-slate-700'
                          }
                        >
                          {q.question}
                          {q.status === 'resolved' && q.resolution && (
                            <span className="ml-1 text-green-700 no-underline">
                              — {q.resolution}
                            </span>
                          )}
                        </span>
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
  )
}
