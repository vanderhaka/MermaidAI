'use client'

import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import ReactMarkdown from 'react-markdown'

import { moduleNotesFileSlug } from '@/lib/module-notes-slug'

type ModuleNotesSheetProps = {
  moduleName: string
  open: boolean
  onClose: () => void
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; markdown: string; source: 'module' | 'default' | 'help' }

const fetchCache = new Map<string, { markdown: string; source: 'module' | 'default' | 'help' }>()

async function fetchText(path: string): Promise<string | null> {
  const res = await fetch(path, { cache: 'no-store' })
  if (!res.ok) return null
  return res.text()
}

let storeState: LoadState = { status: 'idle' }
const listeners = new Set<() => void>()

function getSnapshot() {
  return storeState
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function emit(next: LoadState) {
  storeState = next
  listeners.forEach((cb) => cb())
}

async function loadNotes(slug: string) {
  const cached = fetchCache.get(slug)
  if (cached) {
    emit({ status: 'ok', ...cached })
    return
  }

  emit({ status: 'loading' })
  const primaryPath = `/module-notes/${slug}.md`
  const primary = await fetchText(primaryPath)
  if (primary !== null) {
    const entry = { markdown: primary, source: 'module' as const }
    fetchCache.set(slug, entry)
    emit({ status: 'ok', ...entry })
    return
  }
  const fallback = await fetchText('/module-notes/default.md')
  if (fallback !== null) {
    const entry = { markdown: fallback, source: 'default' as const }
    fetchCache.set(slug, entry)
    emit({ status: 'ok', ...entry })
    return
  }
  const entry = {
    markdown:
      'No notes file found. Add `public/module-notes/' +
      slug +
      '.md`, or add `public/module-notes/default.md` as a fallback.',
    source: 'help' as const,
  }
  fetchCache.set(slug, entry)
  emit({ status: 'ok', ...entry })
}

export default function ModuleNotesSheet({ moduleName, open, onClose }: ModuleNotesSheetProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const slug = moduleNotesFileSlug(moduleName)
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (open) {
      void loadNotes(slug)
    }
  }, [open, slug])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    function handleClose() {
      onClose()
    }
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 m-0 ml-auto h-full w-full max-w-lg border-l border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <p id={titleId} className="truncate text-sm font-semibold text-gray-900">
              Module notes
            </p>
            <p className="truncate text-xs text-gray-500">
              {moduleName}
              {state.status === 'ok' && state.source === 'module' ? (
                <span className="text-gray-400"> &middot; {slug}.md</span>
              ) : null}
              {state.status === 'ok' && state.source === 'default' ? (
                <span className="text-gray-400"> &middot; default.md</span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {state.status === 'loading' || state.status === 'idle' ? (
            <p className="text-sm text-gray-500">Loading notes&hellip;</p>
          ) : (
            <div className="prose prose-sm max-w-none text-gray-800 prose-headings:scroll-mt-4 prose-headings:font-semibold prose-a:text-blue-700 prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-pre:bg-gray-900 prose-pre:text-gray-100">
              <ReactMarkdown>{state.markdown}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </dialog>
  )
}
