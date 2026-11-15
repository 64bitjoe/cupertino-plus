/**
 * Whether a job that is not running now was running just before, asked of the recorder.
 *
 * The card's own memory (`ActivityTrack` in `model.ts`) only knows what it saw: a dashboard
 * opened ten minutes after the wash finished never saw it running, so it could not say Done.
 * And a done state on its own is not proof either: every entity's `last_changed` moves at a Home
 * Assistant restart, so a printer that has sat in `finish` for a week claims to have finished at
 * the restart. Both are the same question, "what was it doing just before this?", and the
 * recorder can answer it. This file is the asking and the reading of the answer, without a DOM.
 */

import { MINUTE } from '../../core/duration'
import { historyMessage, readHistoryRows, type HistoryRow as Point } from '../../core/history'
import type { HassEntity } from '../../core/types/ha'
import {
  kindOfState,
  normalState,
  type ActivityConfig,
  type ActivityTrack,
  type RawKind,
} from './model'

/**
 * One row of `history/history_during_period` with `minimal_response`: state and times in s. The
 * long shape (`state`, `last_changed`) is read as well; see `core/history.ts`.
 */
export interface HistoryRow {
  s: string
  /** last_changed, present only when it differs from `lu`. */
  lc?: number
  /** last_updated. */
  lu?: number
}

/**
 * What the recorder said about the moment an activity stopped running.
 *
 * - `pending`: asked, not answered. Nothing is shown as Done in the meantime, so a restart
 *   cannot flash a Done the answer would take back. Also what an answer that has not caught up
 *   with the entity reads as (its last row is not the state the entity is in now: the browser's
 *   clock is behind the server's, so the query ended before the change), which the card asks
 *   again rather than keeping.
 * - `ended`: it was running until `at`.
 * - `none`: it was not running just before, or the history passes through `unavailable`
 *   (a restart, or a device that dropped off): no Done.
 * - `unknown`: the recorder had nothing (the entity is excluded from it) or the call failed.
 *   The card then falls back to the state alone: a done state is Done from its own
 *   `last_changed`, as it was before this check existed, and an idle state is not.
 */
export type HistoryVerdict =
  | { status: 'pending' }
  | { status: 'ended'; at: number }
  | { status: 'none' }
  | { status: 'unknown' }

/** A minute of slack either side of the linger, so a run that ended right at its edge is seen. */
const SLACK_MS = MINUTE

/** One query per state change: the entity, and the `last_changed` the verdict is about. */
export const historyKey = (entity: HassEntity): string =>
  `${entity.entity_id}|${entity.last_changed}`

/**
 * Whether the card has to ask: the job is not running, the card did not see it stop, and the
 * state it is in now began recently enough for a Done to still be showing. Anything older could
 * not be Done whatever the history says, so it costs no query.
 */
export const needsHistory = (
  raw: RawKind,
  entity: HassEntity | undefined,
  now: number,
  lingerMs: number,
  track: ActivityTrack | undefined,
): entity is HassEntity => {
  if (!entity || raw === 'active' || lingerMs <= 0) return false
  if (track?.endedAt !== undefined) return false
  const changed = Date.parse(entity.last_changed)
  return Number.isFinite(changed) && now - changed < lingerMs && now >= changed - SLACK_MS
}

/**
 * The query: this one entity, from a little before the linger began until a little after now,
 * states only. The slack past now is for a browser clock behind the server's: a query that ended
 * at the browser's now could stop short of the change it is asking about.
 * `significant_changes_only: false` because a status sensor's every change is significant to
 * this question, and the recorder's notion of significance is about numbers. The recorder
 * includes the state at `start_time` as the first row, so a run that began before the window
 * still shows as the row the window opens on.
 */
export const historyRequest = (
  entity: HassEntity,
  now: number,
  lingerMs: number,
): Record<string, unknown> => {
  const changed = Date.parse(entity.last_changed)
  const from = Math.min(Number.isFinite(changed) ? changed : now, now - lingerMs) - SLACK_MS
  return historyMessage([entity.entity_id], from, now + SLACK_MS, {
    significantChangesOnly: false,
  })
}

/**
 * When the run before the current state ended, or undefined if there was no run just before.
 *
 * Read backwards from the current state (the last row). Done states are part of an ending and
 * are walked through: a washer goes `spinning`, `end`, `power_off`, and its run ended at `end`.
 * The first running state found ends the walk, and the ending is the row after it. Anything idle
 * on the way, `unavailable` included, ends the walk with no run: that is what a restart looks
 * like (`finish`, `unavailable`, `finish`), and what a job someone switched off before it started
 * looks like (`initial`, `power_off`). Reaching the first row without a run is no run as well: a
 * window that opens on `finish` and stays there is a printer that finished long ago.
 */
// `changed`: when the entity entered each state, which is where a run starts and ends; an
// attribute update mid-cycle is not a new state (see `HistoryTime`).
const historyPoints = (rows: readonly unknown[]): Point[] => readHistoryRows(rows, 'changed')

export const historyEndedAt = (
  rows: readonly HistoryRow[],
  row: ActivityConfig,
): number | undefined => {
  const points = historyPoints(rows)

  for (let index = points.length - 2; index >= 0; index--) {
    const point = points[index] as Point
    const kind = kindOfState(point.state, row)
    if (kind === 'active') return (points[index + 1] as { at: number }).at
    if (kind === 'idle') return undefined
  }
  return undefined
}

/**
 * The recorder's answer, read into a verdict. Anything unreadable is `unknown`. Given the state
 * the entity is in now, an answer whose last row is some other state has not caught up with it
 * (see `pending` above) and is `pending`, not a verdict.
 */
export const historyVerdict = (
  response: unknown,
  entityId: string,
  row: ActivityConfig,
  current?: string,
): HistoryVerdict => {
  const rows =
    response && typeof response === 'object'
      ? (response as Record<string, unknown>)[entityId]
      : undefined
  if (!Array.isArray(rows) || rows.length === 0) return { status: 'unknown' }
  if (current !== undefined) {
    const last = historyPoints(rows).at(-1)
    if (!last || normalState(last.state) !== normalState(current)) return { status: 'pending' }
  }
  const at = historyEndedAt(rows, row)
  return at === undefined ? { status: 'none' } : { status: 'ended', at }
}

/**
 * What the card does with an answer: keep it, or, for one that had not caught up with the
 * entity (`pending`), ask once more; a second such answer falls back to the state alone.
 */
export const settleVerdict = (
  verdict: HistoryVerdict,
  alreadyRetried: boolean,
): HistoryVerdict | 'retry' => {
  if (verdict.status !== 'pending') return verdict
  return alreadyRetried ? { status: 'unknown' } : 'retry'
}
