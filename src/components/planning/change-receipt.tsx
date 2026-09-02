import { useState } from 'react'

import type { ChatMessage } from '@/types/chat'

type WorkPlanReceipt = {
  changeSetId: string | null
  previousWorkPlanVersionId: string | null
  workPlanVersionId: string | null
  previousVersion: number
  committedVersion: number
  summary: string
  commands: Array<{ type: string }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function readWorkPlanReceipt(message: ChatMessage): WorkPlanReceipt | null {
  const candidate = message.metadata?.work_plan_receipt
  if (!isRecord(candidate)) return null
  if (
    candidate.kind !== 'work_plan_revision' ||
    !Number.isInteger(candidate.previousVersion) ||
    !Number.isInteger(candidate.committedVersion) ||
    typeof candidate.summary !== 'string' ||
    !Array.isArray(candidate.commands)
  ) {
    return null
  }
  const commands = candidate.commands.flatMap((command) =>
    isRecord(command) && typeof command.type === 'string' ? [{ type: command.type }] : [],
  )
  if (commands.length !== candidate.commands.length) return null
  return {
    changeSetId: typeof candidate.changeSetId === 'string' ? candidate.changeSetId : null,
    previousWorkPlanVersionId:
      typeof candidate.previousWorkPlanVersionId === 'string'
        ? candidate.previousWorkPlanVersionId
        : null,
    workPlanVersionId:
      typeof candidate.workPlanVersionId === 'string' ? candidate.workPlanVersionId : null,
    previousVersion: candidate.previousVersion as number,
    committedVersion: candidate.committedVersion as number,
    summary: candidate.summary,
    commands,
  }
}

export type ChangeSetUndoResult = { success: true } | { success: false; error: string }
export type ChangeSetUndoHandler = (targetChangeSetId: string) => Promise<ChangeSetUndoResult>

export function ChangeSetUndoControl({
  targetChangeSetId,
  canUndo,
  unavailableReason,
  onUndo,
  compact = false,
  label = 'Undo this change',
}: {
  targetChangeSetId: string
  canUndo: boolean
  unavailableReason?: string
  onUndo?: ChangeSetUndoHandler
  compact?: boolean
  label?: string
}) {
  const [isUndoing, setIsUndoing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUndo() {
    if (!canUndo || !onUndo || isUndoing) return
    setError(null)
    setIsUndoing(true)
    const result = await onUndo(targetChangeSetId)
    if (!result.success) setError(result.error)
    setIsUndoing(false)
  }

  if (!onUndo) return null

  return (
    <div className={compact ? '' : 'mt-3 border-t border-blue-200/70 pt-2.5'}>
      <button
        type="button"
        disabled={!canUndo || isUndoing}
        onClick={() => void handleUndo()}
        className="rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 font-semibold text-blue-800 transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
      >
        {isUndoing ? 'Restoring…' : error ? 'Try Undo again' : label}
      </button>
      {!canUndo && unavailableReason && (
        <p className="mt-1.5 text-slate-500">{unavailableReason}</p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-red-700">
          {error}. Your newer work was left unchanged.
        </p>
      )}
    </div>
  )
}

function commandLabel(type: string): string {
  return type.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

export function WorkPlanChangeReceipt({
  message,
  canUndo = false,
  onUndo,
}: {
  message: ChatMessage
  canUndo?: boolean
  onUndo?: ChangeSetUndoHandler
}) {
  if (message.role !== 'assistant' || message.planningStage !== 'work_plan') return null
  const receipt = readWorkPlanReceipt(message)
  if (!receipt) return null

  return (
    <div
      data-testid="work-plan-change-receipt"
      aria-label="Work Plan change receipt"
      className="mt-2 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2.5 text-xs text-slate-700"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-blue-100 px-2 py-1 font-semibold text-blue-800">
          Work Plan v{receipt.committedVersion}
        </span>
        <span>
          {receipt.commands.length} edit{receipt.commands.length === 1 ? '' : 's'} committed
        </span>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer font-semibold text-blue-800 marker:text-blue-400">
          Review changes
        </summary>
        <p className="mt-2 leading-5 text-slate-700">{receipt.summary}</p>
        <ul className="mt-1.5 space-y-1 text-slate-600">
          {receipt.commands.map((command, index) => (
            <li key={`${command.type}-${index}`}>• {commandLabel(command.type)}</li>
          ))}
        </ul>
        <p className="mt-2 text-slate-500">
          Based on v{receipt.previousVersion}. The earlier version is preserved.
        </p>
        {message.changeSetId && (
          <ChangeSetUndoControl
            targetChangeSetId={message.changeSetId}
            canUndo={canUndo}
            unavailableReason="A newer plan version is active. This receipt is review-only."
            onUndo={onUndo}
          />
        )}
      </details>
    </div>
  )
}
