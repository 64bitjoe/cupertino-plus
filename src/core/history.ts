/**
 * The recorder's `history/history_during_period`: the message, and the rows of its answer.
 *
 * Two cards ask it two different questions. The complication's sparkline wants a reading at each
 * moment it was recorded; the live activity wants to know when a job entered each state, to find
 * where a run ended. Both are the same call and the same wire shape, so the asking and the
 * reading live here, and which of a row's two times a caller wants is a stated choice (see
 * `HistoryTime`) rather than a detail each parser picked on its own.
 */

/**
 * Which time a row is read at.
 *
 *  - `changed`: `last_changed`, when the entity entered this state. What "when did it start
 *    doing this?" means, and the live activity's reading: a status sensor whose attributes
 *    update mid-cycle has not started the cycle again.
 *  - `updated`: `last_updated`, when this reading was last written. The sparkline's: a sensor
 *    re-reporting the same number is a fresh sample of the line, at the moment it was taken.
 *
 * Either falls back to the other when its own is missing; with `minimal_response`, Home Assistant
 * leaves `lc` out whenever it equals `lu`.
 */
export type HistoryTime = 'changed' | 'updated'

/** One state, and the time it was read at (`HistoryTime`), in epoch milliseconds. */
export interface HistoryRow {
  state: string
  at: number
}

export interface HistoryOptions {
  /**
   * Home Assistant's default is true, which for a sensor is every change anyway. False for a
   * status sensor, whose every change matters to the question even when the recorder's notion of
   * significance (which is about numbers) would drop it.
   */
  significantChangesOnly?: boolean
  /**
   * Home Assistant's default is true: the state in force at `start` arrives as the first row. False
   * for a refresh of a window already held, whose state at `start` is already the last point.
   */
  includeStartTimeState?: boolean
}

/**
 * The websocket message, states only: `minimal_response` and `no_attributes`, because neither
 * card needs more than a state and a time, and on a busy sensor the attributes are most of the
 * bytes. An option left out is left at Home Assistant's default, and off the wire.
 */
export const historyMessage = (
  entityIds: readonly string[],
  start: number,
  end: number,
  options: HistoryOptions = {},
): Record<string, unknown> => ({
  type: 'history/history_during_period',
  start_time: new Date(start).toISOString(),
  end_time: new Date(end).toISOString(),
  entity_ids: [...entityIds],
  minimal_response: true,
  no_attributes: true,
  ...(options.significantChangesOnly !== undefined
    ? { significant_changes_only: options.significantChangesOnly }
    : {}),
  ...(options.includeStartTimeState !== undefined
    ? { include_start_time_state: options.includeStartTimeState }
    : {}),
})

/**
 * One state in the response. With `minimal_response` Home Assistant sends the compressed shape
 * — `s` for the state, `lu` and `lc` for the times, in epoch *seconds* — but the long shape is
 * read too, because a proxy or an older core may answer with it.
 */
interface WireState {
  s?: unknown
  lu?: unknown
  lc?: unknown
  state?: unknown
  last_updated?: unknown
  last_changed?: unknown
}

const secondsOf = (value: unknown): number | null => (typeof value === 'number' ? value : null)

const isoOf = (value: unknown): number | null => {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

const timeOf = (row: WireState, time: HistoryTime): number | null => {
  const [compressed, long] =
    time === 'changed'
      ? [
          [row.lc, row.lu],
          [row.last_changed, row.last_updated],
        ]
      : [
          [row.lu, row.lc],
          [row.last_updated, row.last_changed],
        ]
  const seconds = secondsOf(compressed[0]) ?? secondsOf(compressed[1])
  if (seconds !== null) return Number.isFinite(seconds) ? seconds * 1000 : null
  return isoOf(long[0]) ?? isoOf(long[1])
}

/**
 * Rows as the recorder wrote them, oldest first, each read at `time`. A row with no state or no
 * readable time is skipped; a numeric state arrives as its text.
 */
export const readHistoryRows = (rows: readonly unknown[], time: HistoryTime): HistoryRow[] => {
  const out: HistoryRow[] = []
  for (const row of rows as readonly WireState[]) {
    if (!row || typeof row !== 'object') continue
    const raw = row.s ?? row.state
    const state = typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : undefined
    const at = timeOf(row, time)
    if (state === undefined || at === null) continue
    out.push({ state, at })
  }
  return out.sort((a, b) => a.at - b.at)
}

/** One entity's rows out of the response (`readHistoryRows`); an answer with no list is none. */
export const historyRows = (
  response: unknown,
  entityId: string,
  time: HistoryTime,
): HistoryRow[] => {
  if (!response || typeof response !== 'object') return []
  const rows = (response as Record<string, unknown>)[entityId]
  return Array.isArray(rows) ? readHistoryRows(rows, time) : []
}
