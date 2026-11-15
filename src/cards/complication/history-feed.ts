/**
 * The one file in the complication card that speaks to the recorder: `history/history_during_period`
 * and `recorder/statistics_during_period`.
 *
 * A cache rather than a call, shared by every complication card on the page: two cards drawing
 * the same sensor over the same window ask once, and a card re-rendering because a template
 * answered does not ask again. An entry is refetched only once it is older than
 * `refreshMsFor(hours)` — between a minute and a quarter of an hour — and only when an update
 * actually happens, which a card does only while its entities change or its clock ticks. The
 * live reading is spliced onto the end at draw time, so the line's last point is never as old as
 * the fetch behind it.
 *
 * ## What it costs
 *
 * A sensor reporting every second is 86,000 rows a day, and the window is asked for again every
 * refresh. Three things keep that bounded:
 *
 *  - **Statistics first.** An entity with a `state_class` has long-term statistics, which the
 *    recorder has already averaged into five-minute (or hourly) rows: at most a few hundred,
 *    whatever the sensor's rate. Only when the statistics answer nothing (a sensor too new to
 *    have any, a core without them) does it fall back to the raw history.
 *  - **Incremental history.** For the rest, a refresh asks only for what changed since the last
 *    fetch and appends it, trimming what has slid out of the window.
 *  - **Pooled on arrival.** Whatever arrives is pooled into quarter-sample buckets
 *    (`reducePoints`) once, so what is held — and walked on every repaint — is bounded by the
 *    window, not by the sensor. The drawn geometry is memoised per entry, by the points, the
 *    live reading and the minute, so a repaint that changes none of them redraws nothing.
 *
 * An entry nobody has read for two refresh periods is dropped (a card removed, a window
 * changed), and the cache never holds more than `MAX_ENTRIES`.
 *
 * A failed fetch is remembered as an empty history for the same span as a good one, so a core
 * without the `history` integration is asked once per refresh, not once per render.
 */

import type { HomeAssistant } from '../../core/types/ha'
import {
  bucketMsFor,
  hasStatistics,
  historyRequest,
  mergeHistory,
  parseHistory,
  parseStatistics,
  reducePoints,
  refreshMsFor,
  sparklineFor,
  statisticsRequest,
  type HistoryPoint,
  type SparklineGeometry,
} from './history'

const HOUR = 3_600_000

/** The most entries the cache holds; the least recently read go first past it. */
export const MAX_ENTRIES = 200

interface Entry {
  hours: number
  points?: HistoryPoint[]
  /** Where the points came from, so a refresh of raw history can ask only for what is new. */
  source?: 'history' | 'statistics'
  fetchedAt: number
  /** When a card last drew from it, for eviction. */
  readAt: number
  /** While a fetch is in flight: every feed waiting on it, told once when it lands. */
  waiting?: Set<() => void>
  /** The last geometry drawn from `points`, and what it was drawn for. */
  memo?: {
    points: HistoryPoint[]
    live: number | null
    minute: number
    geometry: SparklineGeometry | null
  }
}

/** Shared across cards; keyed by entity and window. */
const CACHE = new Map<string, Entry>()

const keyOf = (entityId: string, hours: number): string => `${entityId}|${hours}`

/** Forget everything: the tests' reset, and nothing else's. */
export const clearHistoryCache = (): void => CACHE.clear()

/** How many entries are held; for the tests. */
export const historyCacheSize = (): number => CACHE.size

/**
 * Drop the entries nobody has read for two of their refresh periods, then, past `MAX_ENTRIES`,
 * the least recently read. An entry with a fetch in flight is kept: a card is waiting on it.
 */
const evict = (now: number): void => {
  for (const [key, entry] of CACHE) {
    if (!entry.waiting && now - entry.readAt > 2 * refreshMsFor(entry.hours)) CACHE.delete(key)
  }
  if (CACHE.size <= MAX_ENTRIES) return
  const idle = [...CACHE].filter(([, entry]) => !entry.waiting)
  idle.sort(([, a], [, b]) => a.readAt - b.readAt)
  for (const [key] of idle.slice(0, CACHE.size - MAX_ENTRIES)) CACHE.delete(key)
}

export class HistoryFeed {
  /** Called when a fetch this feed asked for has landed, so the card can `requestUpdate()`. */
  public constructor(private readonly _onChange: () => void) {}

  /** The last fetched history, or `undefined` before the first answer. */
  public read(
    entityId: string,
    hours: number,
    now: number = Date.now(),
  ): HistoryPoint[] | undefined {
    const entry = CACHE.get(keyOf(entityId, hours))
    if (!entry) return undefined
    entry.readAt = now
    return entry.points
  }

  /**
   * The line for one entity, memoised: drawn again only when the points, the live reading or
   * the minute have changed since the last time anybody asked. `null` while there is none.
   */
  public geometry(
    entityId: string,
    hours: number,
    live: number | null,
    now: number,
  ): SparklineGeometry | null {
    const entry = CACHE.get(keyOf(entityId, hours))
    if (!entry?.points) return null
    entry.readAt = now
    const minute = Math.floor(now / 60_000)
    const memo = entry.memo
    if (memo && memo.points === entry.points && memo.live === live && memo.minute === minute) {
      return memo.geometry
    }
    const geometry = sparklineFor(entry.points, live, now, hours)
    entry.memo = { points: entry.points, live, minute, geometry }
    return geometry
  }

  /** Ask for whatever is missing or stale; a fresh or in-flight entry is left alone. */
  public sync(hass: HomeAssistant, entityIds: readonly string[], hours: number, now: number): void {
    evict(now)
    for (const entityId of entityIds) {
      const key = keyOf(entityId, hours)
      const entry = CACHE.get(key)
      if (entry?.waiting) {
        entry.waiting.add(this._onChange)
        continue
      }
      if (entry && now - entry.fetchedAt < refreshMsFor(hours)) continue

      // Claimed before the await, so a second sync in the same tick does not ask twice. The
      // old points stay readable meanwhile, so a refresh never blanks the line.
      const waiting = new Set([this._onChange])
      CACHE.set(key, {
        hours,
        fetchedAt: now,
        readAt: entry?.readAt ?? now,
        waiting,
        ...(entry?.points ? { points: entry.points } : {}),
        ...(entry?.source ? { source: entry.source } : {}),
      })
      const statistics = hasStatistics(hass.states?.[entityId]?.attributes)
      void this._fetch(hass, entityId, hours, now, statistics, entry).then(({ points, source }) => {
        const current = CACHE.get(key)
        CACHE.set(key, {
          hours,
          points,
          ...(source ? { source } : {}),
          fetchedAt: now,
          readAt: current?.readAt ?? now,
        })
        for (const notify of waiting) notify()
      })
    }
  }

  private async _fetch(
    hass: HomeAssistant,
    entityId: string,
    hours: number,
    now: number,
    statistics: boolean,
    prior: Entry | undefined,
  ): Promise<{ points: HistoryPoint[]; source?: 'history' | 'statistics' }> {
    const bucket = bucketMsFor(hours)
    const windowStart = now - hours * HOUR
    try {
      if (statistics) {
        const response = await hass.callWS<unknown>(statisticsRequest([entityId], hours, now))
        const points = parseStatistics(response, entityId, hours)
        if (points.length >= 2)
          return { points: reducePoints(points, bucket), source: 'statistics' }
      }
      // Only what is new, when the window held is raw history still overlapping this one. A
      // failed fetch records no source, so the one after it asks for the whole window again.
      const since =
        prior?.source === 'history' && prior.points && prior.fetchedAt > windowStart
          ? prior.fetchedAt
          : undefined
      const response = await hass.callWS<unknown>(historyRequest([entityId], hours, now, since))
      const fresh = parseHistory(response, entityId)
      const points =
        since !== undefined && prior?.points
          ? mergeHistory(prior.points, fresh, windowStart, bucket)
          : reducePoints(fresh, bucket)
      return { points, source: 'history' }
    } catch {
      console.warn(`[cupertino-plus] could not read the history of ${entityId}`)
      return { points: [] }
    }
  }
}
