'use client'

import { useId, useState } from 'react'

import type { PlanningDecisionView } from '@/types/planning-ui'

type PlanningDecisionActionType = 'accept' | 'reject' | 'edit' | 'supersede'

export type PlanningDecisionAction = {
  type: PlanningDecisionActionType
  decisionId: string
  reason: string
  statement?: string
}

export type PlanningDecisionActionResult =
  | {
      success: true
      receipt: {
        changeSetId: string
        committedRevision: number
        replayed: boolean
      }
    }
  | { success: false; error: string; conflict?: boolean }

type PlanningDecisionsPanelProps = {
  decisions: PlanningDecisionView[]
  onAction: (action: PlanningDecisionAction) => Promise<PlanningDecisionActionResult>
}

type EditorState = {
  decisionId: string
  type: PlanningDecisionActionType
  reason: string
  statement: string
  failed: boolean
}

const STATE_LABELS = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  superseded: 'Superseded',
} as const

const STATE_STYLES = {
  proposed: 'border-amber-200 bg-amber-50 text-amber-800',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-slate-200 bg-slate-50 text-slate-600',
  superseded: 'border-slate-200 bg-white text-slate-500',
} as const

function actionVerb(type: PlanningDecisionActionType): string {
  return type === 'supersede' ? 'superseding' : `${type}ing`
}

function actionButton(
  type: PlanningDecisionActionType,
  decision: PlanningDecisionView,
  onClick: () => void,
) {
  const label = type[0].toUpperCase() + type.slice(1)
  return (
    <button
      key={type}
      type="button"
      aria-label={`${label}: ${decision.statement}`}
      onClick={onClick}
      className="min-h-8 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
    >
      {label}
    </button>
  )
}

export function PlanningDecisionsPanel({ decisions, onAction }: PlanningDecisionsPanelProps) {
  const editorId = useId()
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [committedRevision, setCommittedRevision] = useState<number | null>(null)

  function openEditor(decision: PlanningDecisionView, type: PlanningDecisionActionType) {
    setEditor({
      decisionId: decision.id,
      type,
      reason: '',
      statement: type === 'edit' || type === 'supersede' ? decision.statement : '',
      failed: false,
    })
    setError(null)
    setCommittedRevision(null)
  }

  async function submitAction() {
    if (!editor || !editor.reason.trim()) return
    if ((editor.type === 'edit' || editor.type === 'supersede') && !editor.statement.trim()) return

    setIsSubmitting(true)
    setError(null)
    const result = await onAction({
      type: editor.type,
      decisionId: editor.decisionId,
      reason: editor.reason.trim(),
      ...(editor.type === 'edit' || editor.type === 'supersede'
        ? { statement: editor.statement.trim() }
        : {}),
    })
    setIsSubmitting(false)

    if (!result.success) {
      setError(result.error)
      setEditor((current) => (current ? { ...current, failed: true } : current))
      return
    }

    setCommittedRevision(result.receipt.committedRevision)
    setEditor(null)
  }

  return (
    <section
      className="mt-4 border-t border-slate-100 pt-4"
      aria-labelledby="planning-decisions-title"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id="planning-decisions-title" className="text-xs font-semibold text-slate-900">
            Assumptions and decisions
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Review durable choices before creating a Work Plan.
          </p>
        </div>
        <span className="text-xs text-slate-400">
          {`${decisions.length} ${decisions.length === 1 ? 'item' : 'items'}`}
        </span>
      </div>

      {committedRevision !== null && (
        <p
          role="status"
          className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          Decision committed at revision {committedRevision}.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {decisions.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          No assumptions or decisions have been recorded for this Architecture version.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {decisions.map((decision) => {
            const isEditing = editor?.decisionId === decision.id
            const canSupersede = decision.state === 'accepted' || decision.state === 'rejected'

            return (
              <li key={decision.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATE_STYLES[decision.state]}`}
                      >
                        {STATE_LABELS[decision.state]}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {decision.category} · {decision.provenance}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-800">
                      {decision.statement}
                    </p>
                    {decision.latest_event && (
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        {decision.latest_event.actor_label}: {decision.latest_event.reason}
                      </p>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex flex-wrap gap-1.5">
                      {decision.state === 'proposed' && (
                        <>
                          {actionButton('accept', decision, () => openEditor(decision, 'accept'))}
                          {actionButton('reject', decision, () => openEditor(decision, 'reject'))}
                          {actionButton('edit', decision, () => openEditor(decision, 'edit'))}
                        </>
                      )}
                      {canSupersede &&
                        actionButton('supersede', decision, () =>
                          openEditor(decision, 'supersede'),
                        )}
                    </div>
                  )}
                </div>

                {isEditing && editor && (
                  <div
                    id={editorId}
                    className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    {(editor.type === 'edit' || editor.type === 'supersede') && (
                      <div>
                        <label
                          htmlFor={`${editorId}-statement`}
                          className="block text-xs font-medium text-slate-700"
                        >
                          Replacement decision
                        </label>
                        <textarea
                          id={`${editorId}-statement`}
                          rows={3}
                          value={editor.statement}
                          onChange={(event) =>
                            setEditor((current) =>
                              current ? { ...current, statement: event.target.value } : current,
                            )
                          }
                          className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor={`${editorId}-reason`}
                        className="block text-xs font-medium text-slate-700"
                      >
                        Reason for {actionVerb(editor.type)}
                      </label>
                      <textarea
                        id={`${editorId}-reason`}
                        rows={2}
                        value={editor.reason}
                        onChange={(event) =>
                          setEditor((current) =>
                            current ? { ...current, reason: event.target.value } : current,
                          )
                        }
                        className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditor(null)
                          setError(null)
                        }}
                        disabled={isSubmitting}
                        className="min-h-8 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitAction()}
                        disabled={
                          isSubmitting ||
                          !editor.reason.trim() ||
                          ((editor.type === 'edit' || editor.type === 'supersede') &&
                            !editor.statement.trim())
                        }
                        className="min-h-8 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSubmitting
                          ? 'Committing…'
                          : editor.failed
                            ? `Try ${editor.type} again`
                            : `Confirm ${editor.type}`}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
