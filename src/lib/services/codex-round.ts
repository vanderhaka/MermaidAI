import { randomUUID } from 'node:crypto'

import {
  codexFailureMessage,
  isRecord,
  outputItemText,
  readCodexEvents,
} from '@/lib/services/codex-sse'
import type { CodexOutputItem } from '@/lib/services/codex-sse'

/**
 * A `reasoning` item echoed back verbatim on a continuation round, with
 * `summary` defaulted — the backend 400s if it is missing entirely.
 */
export type CodexReasoningEchoItem = { type: 'reasoning'; summary: unknown[] } & Record<
  string,
  unknown
>

export type CodexToolCall = {
  callId: string
  name: string
  arguments: string
}

export type CodexRound = {
  /** Every `final_answer` fragment this round, live-streamed or not. */
  finalText: string
  /**
   * The slice of `finalText` that could NOT be live-streamed because the
   * backend never announced its item with `output_item.added`. The caller has
   * to enqueue this itself; everything else already reached the user.
   */
  bufferedFinalText: string
  /** Narration the model produced alongside tool calls. */
  narrationText: string
  toolCalls: CodexToolCall[]
  /** Raw `reasoning` items, in emission order — echoed back on tool-call rounds. */
  reasoningItems: Record<string, unknown>[]
}

export type CodexRoundHandlers = {
  /** Receives `final_answer` deltas the instant the backend emits them. */
  onFinalDelta?: (delta: string) => void
}

type MessageItemState = { phase: string; streamed: boolean }

const DEFAULT_PHASE = 'final_answer'

/**
 * The `done` event's own label wins; the `added` state is the fallback for
 * items the backend only labels once, at the start.
 */
function resolvePhase(item: CodexOutputItem, states: Map<string, MessageItemState>): string {
  if (item.phase) return item.phase
  const registered = item.id ? states.get(item.id) : undefined
  return registered?.phase ?? DEFAULT_PHASE
}

export async function readCodexRound(
  body: ReadableStream<Uint8Array>,
  handlers: CodexRoundHandlers = {},
): Promise<CodexRound> {
  const round: CodexRound = {
    finalText: '',
    bufferedFinalText: '',
    narrationText: '',
    toolCalls: [],
    reasoningItems: [],
  }
  // `output_item.added` lands before the item's first delta and carries its
  // phase, so each delta can be routed to the user or held back as narration
  // the moment it arrives instead of at the end of the round.
  const messageItems = new Map<string, MessageItemState>()

  for await (const event of readCodexEvents(body)) {
    if (event.type === 'response.failed') {
      throw new Error(codexFailureMessage(event))
    }

    if (event.type === 'response.output_item.added') {
      const added = event.item
      if (added?.type === 'message' && added.id) {
        messageItems.set(added.id, { phase: added.phase ?? DEFAULT_PHASE, streamed: false })
      }
      continue
    }

    if (event.type === 'response.output_text.delta') {
      const state = event.item_id ? messageItems.get(event.item_id) : undefined
      // A delta for an unannounced item falls through to the buffered path —
      // its text still arrives on `output_item.done`, so nothing is dropped.
      if (!state || !event.delta) continue
      if (state.phase === DEFAULT_PHASE) {
        state.streamed = true
        handlers.onFinalDelta?.(event.delta)
      }
      continue
    }

    if (event.type !== 'response.output_item.done') continue

    const item = event.item
    if (!item) continue

    if (item.type === 'function_call') {
      round.toolCalls.push({
        callId: item.call_id ?? randomUUID(),
        name: item.name ?? '',
        arguments: item.arguments ?? '{}',
      })
      continue
    }

    if (item.type === 'reasoning') {
      // Carried through as the raw parsed object (not rebuilt field-by-field)
      // so unknown fields the backend expects echoed survive the round trip.
      if (isRecord(item)) round.reasoningItems.push(item)
      continue
    }

    if (item.type !== 'message') continue

    const text = outputItemText(item)
    if (!text) continue

    if (resolvePhase(item, messageItems) === 'commentary') {
      round.narrationText += text
      continue
    }

    round.finalText += text
    const streamed = item.id ? (messageItems.get(item.id)?.streamed ?? false) : false
    if (!streamed) round.bufferedFinalText += text
  }

  return round
}

/** Echoes a raw `reasoning` item back verbatim, defaulting `summary` when absent. */
export function reasoningEchoItem(item: Record<string, unknown>): CodexReasoningEchoItem {
  return { ...item, type: 'reasoning', summary: (item.summary ?? []) as unknown[] }
}
