'use client'

import { useState } from 'react'

import type { ChatMessage } from '@/types/chat'
import {
  ChangeSetUndoControl,
  type ChangeSetUndoHandler,
} from '@/components/planning/change-receipt'
import { INTERRUPTED_MARKER } from '@/lib/chat-turn'
import { readArchitectureChangeSummary } from '@/lib/planning/architecture-change-summary'

export { readArchitectureChangeSummary } from '@/lib/planning/architecture-change-summary'

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function ArchitectureActivity({ activity }: { activity: string }) {
  return (
    <div data-role="assistant" className="flex justify-start">
      <div
        data-testid="architecture-turn-activity"
        aria-label="Architecture progress"
        className="flex max-w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
      >
        <span className="thinking-dot h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />
        <span className="min-w-0 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Building a provisional map</span>
          <span className="mx-1.5 text-slate-300" aria-hidden>
            ·
          </span>
          <span>{activity}…</span>
        </span>
      </div>
    </div>
  )
}

export function ArchitectureChangeReceipt({
  message,
  canUndo = false,
  onUndo,
  onContinue,
}: {
  message: ChatMessage
  canUndo?: boolean
  onUndo?: ChangeSetUndoHandler
  onContinue?: () => void
}) {
  const [isReviewOpen, setIsReviewOpen] = useState(false)
  if (message.role !== 'assistant' || !message.changeSetId) return null
  const summary = readArchitectureChangeSummary(message.metadata)
  if (!summary) return null
  const isPartial =
    message.metadata?.turn_status === 'partial' || message.content.includes(INTERRUPTED_MARKER)

  const counts: string[] = []
  if (summary.capabilitiesCreated > 0) {
    counts.push(`Created ${countLabel(summary.capabilitiesCreated, 'capability', 'capabilities')}`)
  }
  if (summary.connectionsCreated > 0) {
    counts.push(`Connected ${countLabel(summary.connectionsCreated, 'handoff')}`)
  }
  const otherCreated = Math.max(
    0,
    summary.created -
      summary.capabilitiesCreated -
      summary.connectionsCreated -
      summary.questionsRecorded,
  )
  if (otherCreated > 0) counts.push(`Created ${countLabel(otherCreated, 'item')}`)
  const recorded = [
    summary.assumptionsRecorded > 0 ? countLabel(summary.assumptionsRecorded, 'assumption') : null,
    summary.questionsRecorded > 0 ? countLabel(summary.questionsRecorded, 'question') : null,
  ].filter((label): label is string => label !== null)
  if (recorded.length > 0) counts.push(`Recorded ${recorded.join(' and ')}`)
  if (summary.updated > 0) counts.push(`Updated ${countLabel(summary.updated, 'item')}`)
  if (summary.deleted > 0) counts.push(`Deleted ${countLabel(summary.deleted, 'item')}`)
  if (summary.resolved > 0) {
    counts.push(`Resolved ${countLabel(summary.resolved, 'question')}`)
  }

  if (counts.length === 0) return null

  return (
    <div
      data-testid="architecture-change-receipt"
      aria-label="Architecture change receipt"
      className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-2 text-xs text-slate-600"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">
          Provisional
        </span>
        {isPartial && (
          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-800">
            Partially committed
          </span>
        )}
        <span>{counts.join(' · ')}</span>
      </div>
      {isPartial ? (
        <>
          <div className="mt-2.5 flex flex-wrap items-start gap-2">
            <button
              type="button"
              aria-expanded={isReviewOpen}
              onClick={() => setIsReviewOpen((open) => !open)}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 font-semibold text-amber-900 hover:bg-amber-50"
            >
              Review
            </button>
            {onContinue && (
              <button
                type="button"
                onClick={onContinue}
                className="rounded-lg bg-slate-950 px-2.5 py-1.5 font-semibold text-white hover:bg-slate-800"
              >
                Continue
              </button>
            )}
            <ChangeSetUndoControl
              targetChangeSetId={message.changeSetId}
              canUndo={canUndo}
              unavailableReason="A newer Architecture change is active. This receipt is review-only."
              onUndo={onUndo}
              compact
              label="Undo"
            />
          </div>
          {isReviewOpen && (
            <div className="mt-2.5 rounded-lg border border-amber-200 bg-white/70 p-2.5 leading-5">
              <p>The committed part is safe. Continue starts a fresh turn from the current map.</p>
              <p className="mt-1 font-medium text-slate-700">
                Created {summary.created} · Updated {summary.updated} · Deleted {summary.deleted} ·
                Assumed {summary.assumed} · Resolved {summary.resolved}
              </p>
            </div>
          )}
        </>
      ) : (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-amber-900 marker:text-amber-500">
            Review change
          </summary>
          <p className="mt-2 leading-5">
            Created {summary.created} · Updated {summary.updated} · Deleted {summary.deleted} ·
            Assumed {summary.assumed} · Resolved {summary.resolved}
          </p>
          <p className="mt-1 leading-5">
            This is the committed server receipt. Undo is available only while it remains the latest
            Architecture change.
          </p>
          <ChangeSetUndoControl
            targetChangeSetId={message.changeSetId}
            canUndo={canUndo}
            unavailableReason="A newer Architecture change is active. This receipt is review-only."
            onUndo={onUndo}
          />
        </details>
      )}
    </div>
  )
}
