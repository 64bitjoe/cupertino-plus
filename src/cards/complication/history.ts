/**
 * The sparkline: an entity's recent history, as the small line the Stocks and Weather widgets
 * and the Watch's graph complications draw beside a reading.
 *
 * Everything here is pure — the request, the parse, the resampling, the geometry — so the node
 * tests reach all of it. `history-feed.ts` is the one file that speaks the websocket, the same
 * one-file-per-protocol split `core/templates.ts` makes.
 *
 * ## What it is for, and what it is not
 *
 * A trend, not a chart. There are no axes, no gridlines and no tooltip: the line says "rising,
 * falling or flat" and the dot at its end says "and this is where it is now", which is all a
 * glance can carry. The high and the low of the window are the one pair of numbers worth
 * printing beside it, and only the graph face has room to.
 *
 * Only for a numeric reading. A state that is a word ("Running") has no line to draw, and a
 * gauge-less `circular` face has nowhere to put one; see `SPARKLINE_STYLES`.
 */

import { HOUR } from '../../core/duration'
import { historyMessage, historyRows } from '../../core/history'

/**
 * One reading at one moment: `t` in epoch milliseconds.
 *
 * A point that stands for several readings (`reducePoints`) carries their mean as `v`, how many
 * there were as `n`, and the newest of them as `last` — the value in force once the bucket
 * closes, which is what a sample with nothing in it carries forward. A raw reading has neither.
 */
export interface HistoryPoint {
  t: number
  v: number
  n?: number
  last?: number
}

export const SPARKLINE_HOURS_MIN = 1
export const SPARKLINE_HOURS_MAX = 48
export const DEFAULT_SPARKLINE_HOURS = 24

/**
 * How many samples the line is drawn from, whatever the window. Enough that a day reads as a
 * curve rather than a staircase, few enough that a minute-by-minute sensor does not put
 * thousands of points into the DOM for a line 120 pixels wide.
 */
export const SPARKLINE_SAMPLES = 48

/** The configured hours, clamped and whole; anything unreadable is the default. */
export const sparklineHoursFor = (value: unknown): number => {
  const hours = typeof value === 'string' ? Number(value) : value
  if (typeof hours !== 'number' || !Number.isFinite(hours)) return DEFAULT_SPARKLINE_HOURS
  return Math.min(SPARKLINE_HOURS_MAX, Math.max(SPARKLINE_HOURS_MIN, Math.round(hours)))
}

/**
 * How long a fetched history stays good before the next update asks again.
 *
 * One sample's width, so the line never falls more than a sample behind, between a minute (a
 * one-hour window, where a sample is 75 seconds) and a quarter of an hour (two days). The live
 * reading is spliced onto the end in between (`withLive`), so the dot at the end of the line is
 * never stale even while the line behind it is.
 */
export const refreshMsFor = (hours: number): number =>
  Math.min(15 * 60_000, Math.max(60_000, Math.round((hours * HOUR) / SPARKLINE_SAMPLES)))

/**
 * The websocket message (`core/history.ts`'s): a sparkline needs a number and a time and nothing
 * else. `significant_changes_only` is left at Home Assistant's default (true), which for a sensor
 * is every change anyway.
 *
 * With `since`, only what changed after it: the refresh of a window already held, so a sensor
 * reporting every second is downloaded once rather than once per refresh. The state in force at
 * `since` is already the last point held, so it is not asked for again.
 */
export const historyRequest = (
  entityIds: readonly string[],
  hours: number,
  now: number,
  since?: number,
): Record<string, unknown> =>
  historyMessage(
    entityIds,
    since ?? now - hours * HOUR,
    now,
    since !== undefined ? { includeStartTimeState: false } : {},
  )

/**
 * The long-term statistics' period for a window: five-minute rows up to a day (at most 288),
 * hourly beyond (at most 48). Either is a fixed, small download whatever the sensor's rate.
 */
export const statisticsPeriodFor = (hours: number): '5minute' | 'hour' =>
  hours <= 24 ? '5minute' : 'hour'

const PERIOD_MS = { '5minute': 5 * 60_000, hour: HOUR } as const

/**
 * The recorder's statistics for an entity with a `state_class`: Home Assistant has already
 * averaged the raw readings into fixed periods, so a power sensor reporting every second costs a
 * few hundred rows a day here instead of tens of thousands. `mean` is the line for a
 * measurement; a `total` or `total_increasing` sensor has no mean, and its `state` (the meter's
 * reading at the period's end) is what its live value is too. Units are left as the entity
 * reports them, so the line and the printed reading agree.
 */
export const statisticsRequest = (
  entityIds: readonly string[],
  hours: number,
  now: number,
): Record<string, unknown> => ({
  type: 'recorder/statistics_during_period',
  start_time: new Date(now - hours * HOUR).toISOString(),
  end_time: new Date(now).toISOString(),
  statistic_ids: [...entityIds],
  period: statisticsPeriodFor(hours),
  types: ['mean', 'state'],
})

/** Whether an entity's history is better asked of the statistics: it has a `state_class`. */
export const hasStatistics = (attributes: Record<string, unknown> | undefined): boolean =>
  typeof attributes?.state_class === 'string' && attributes.state_class !== ''

const msOf = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

/**
 * One entity's statistics rows as points, oldest first, each at the middle of its period.
 * `start` and `end` arrive as epoch milliseconds from a current core, or as ISO strings from an
 * older one. A row with neither a mean nor a state is skipped, as an unreadable state is.
 */
export const parseStatistics = (
  response: unknown,
  entityId: string,
  hours: number,
): HistoryPoint[] => {
  if (!response || typeof response !== 'object') return []
  const rows = (response as Record<string, unknown>)[entityId]
  if (!Array.isArray(rows)) return []
  const period = PERIOD_MS[statisticsPeriodFor(hours)]
  const points: HistoryPoint[] = []
  for (const row of rows as Record<string, unknown>[]) {
    if (!row || typeof row !== 'object') continue
    const start = msOf(row.start)
    if (start === null) continue
    const end = msOf(row.end) ?? start + period
    const value = typeof row.mean === 'number' ? row.mean : row.state
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    points.push({ t: (start + end) / 2, v: value })
  }
  return points.sort((a, b) => a.t - b.t)
}

/**
 * The width a window's readings are pooled into on arrival: a quarter of one sample, so every
 * sample still averages several buckets and the line is drawn as it would be from the raw
 * readings, while what is kept is bounded by the window rather than by the sensor's rate.
 */
export const bucketMsFor = (hours: number): number => (hours * HOUR) / SPARKLINE_SAMPLES / 4

/**
 * Pool sorted readings into one point per `bucketMs`-wide slot of the clock, each at the mean
 * time of what it holds and carrying the mean, the count and the newest value (see
 * `HistoryPoint`). A slot holding one raw reading keeps that reading as it is, so a sensor that
 * reports less often than a bucket loses nothing at all.
 */
export const reducePoints = (points: readonly HistoryPoint[], bucketMs: number): HistoryPoint[] => {
  const out: HistoryPoint[] = []
  let i = 0
  while (i < points.length) {
    const first = points[i] as HistoryPoint
    const slot = Math.floor(first.t / bucketMs)
    let j = i + 1
    while (j < points.length && Math.floor((points[j] as HistoryPoint).t / bucketMs) === slot) {
      j += 1
    }
    if (j === i + 1) {
      out.push(first)
    } else {
      let n = 0
      let tSum = 0
      let vSum = 0
      for (let k = i; k < j; k += 1) {
        const point = points[k] as HistoryPoint
        const weight = point.n ?? 1
        n += weight
        tSum += point.t * weight
        vSum += point.v * weight
      }
      const newest = points[j - 1] as HistoryPoint
      out.push({ t: tSum / n, v: vSum / n, n, last: newest.last ?? newest.v })
    }
    i = j
  }
  return out
}

/**
 * The window held so far with what arrived since, trimmed to the window: everything from
 * `windowStart` on, and the one reading before it that was in force when the window opened.
 */
export const mergeHistory = (
  held: readonly HistoryPoint[],
  fresh: readonly HistoryPoint[],
  windowStart: number,
  bucketMs: number,
): HistoryPoint[] => {
  const newest = held.length > 0 ? (held[held.length - 1] as HistoryPoint).t : -Infinity
  const all = [...held, ...fresh.filter(point => point.t > newest)]
  let first = 0
  while (first + 1 < all.length && (all[first + 1] as HistoryPoint).t < windowStart) first += 1
  return reducePoints(all.slice(first), bucketMs)
}

/**
 * One entity's numeric readings out of the response, oldest first.
 *
 * A state that is not a number (`unavailable`, `unknown`, a word) is skipped rather than drawn
 * as zero: a sensor that dropped off the network for an hour did not read nought for an hour,
 * and the line simply bridges the gap.
 */
export const parseHistory = (response: unknown, entityId: string): HistoryPoint[] => {
  const points: HistoryPoint[] = []
  // `updated`: a sensor re-reporting the same number is a fresh sample, at the moment it was
  // taken (see `HistoryTime`).
  for (const { state, at } of historyRows(response, entityId, 'updated')) {
    const v = Number(state)
    if (state.trim() === '' || !Number.isFinite(v)) continue
    points.push({ t: at, v })
  }
  return points
}

/**
 * The fetched history with the live reading on the end, so the line's last point is always the
 * number printed beside it, whatever the age of the fetch.
 */
export const withLive = (
  points: readonly HistoryPoint[],
  value: number | null,
  now: number,
): HistoryPoint[] => {
  const kept = points.filter(point => point.t <= now)
  return value === null ? kept : [...kept, { t: now, v: value }]
}

/**
 * The readings as `samples` evenly spaced values across `[start, end]`.
 *
 * A sensor reports when it changes, not on a clock, so the raw points are bunched where things
 * happened and sparse where they did not. Each sample is the mean of the points inside it, or,
 * for a sample nothing landed in, the last reading before it — a state holds until it changes,
 * which is what Home Assistant's own history graph assumes too. Samples before the first known
 * reading are `null`, and the line starts where the data does.
 */
export const resample = (
  points: readonly HistoryPoint[],
  start: number,
  end: number,
  samples: number = SPARKLINE_SAMPLES,
  live?: HistoryPoint,
): (number | null)[] => {
  const count = Math.max(2, Math.round(samples))
  const step = (end - start) / count
  const out: (number | null)[] = []
  let last: number | null = null
  let index = 0
  // With a live reading, it stands in for everything after it: `withLive`'s splice, without
  // copying the history to make it.
  const stop = live ? upTo(points, live.t) : points.length
  let tail = live

  // Whatever was in force when the window opened.
  while (index < stop && (points[index] as HistoryPoint).t < start) {
    const point = points[index] as HistoryPoint
    last = point.last ?? point.v
    index += 1
  }

  for (let sample = 0; sample < count; sample += 1) {
    const to = sample === count - 1 ? Infinity : start + (sample + 1) * step
    let sum = 0
    let n = 0
    while (index < stop && (points[index] as HistoryPoint).t < to) {
      const point = points[index] as HistoryPoint
      const weight = point.n ?? 1
      sum += point.v * weight
      n += weight
      last = point.last ?? point.v
      index += 1
    }
    if (tail && tail.t < to) {
      sum += tail.v
      n += 1
      last = tail.v
      tail = undefined
    }
    out.push(n > 0 ? sum / n : last)
  }
  return out
}

/** How many of the sorted points are at or before `t`. */
const upTo = (points: readonly HistoryPoint[], t: number): number => {
  let low = 0
  let high = points.length
  while (low < high) {
    const mid = (low + high) >> 1
    if ((points[mid] as HistoryPoint).t <= t) low = mid + 1
    else high = mid
  }
  return low
}

/**
 * Each value placed between the window's low (0) and high (1). A line that never moved sits in
 * the middle rather than along the floor, since flat is a reading of its own and not "nothing".
 */
export const normalise = (values: readonly (number | null)[]): (number | null)[] => {
  const known = values.filter((value): value is number => value !== null)
  if (known.length === 0) return values.map(() => null)
  const low = Math.min(...known)
  const high = Math.max(...known)
  const span = high - low
  return values.map(value => (value === null ? null : span === 0 ? 0.5 : (value - low) / span))
}

export interface SparklineGeometry {
  /** The stroke, in a `0 0 width height` box. */
  line: string
  /** The same curve closed down to the floor, for the soft fill under it. */
  area: string
  /** Where the line ends, as fractions of the box: the "now" dot. */
  end: { x: number; y: number }
  /** The window's lowest and highest reading, for the graph face's labels. */
  low: number
  high: number
}

const round = (n: number): number => Math.round(n * 100) / 100

/**
 * The path for a run of resampled values, or `null` when there are fewer than two to join.
 *
 * Smoothed through the midpoints between samples with quadratic curves: it reads as the soft
 * line Apple's charts draw, and unlike a Catmull-Rom spline it can never overshoot past a real
 * reading, so the line's top is the window's true high. `inset` keeps the stroke off the box's
 * top and bottom edges, which would otherwise clip half of it.
 */
export const sparklineGeometry = (
  values: readonly (number | null)[],
  width: number,
  height: number,
  inset = 2,
): SparklineGeometry | null => {
  const known = values.filter((value): value is number => value !== null)
  if (known.length < 2) return null

  const levels = normalise(values)
  const span = values.length - 1
  const usable = height - 2 * inset
  const points: { x: number; y: number }[] = []
  levels.forEach((level, index) => {
    if (level === null) return
    points.push({ x: round((index / span) * width), y: round(inset + (1 - level) * usable) })
  })

  const first = points[0] as { x: number; y: number }
  const last = points[points.length - 1] as { x: number; y: number }
  let line = `M${first.x} ${first.y}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const here = points[i] as { x: number; y: number }
    const next = points[i + 1] as { x: number; y: number }
    line += ` Q${here.x} ${here.y} ${round((here.x + next.x) / 2)} ${round((here.y + next.y) / 2)}`
  }
  line += ` L${last.x} ${last.y}`

  return {
    line,
    area: `${line} L${last.x} ${height} L${first.x} ${height} Z`,
    end: { x: last.x / width, y: last.y / height },
    low: Math.min(...known),
    high: Math.max(...known),
  }
}

/**
 * Everything the face needs, from the fetched points: the live reading spliced on, the window
 * resampled, and the geometry. `null` whenever there is no line worth drawing.
 */
export const sparklineFor = (
  points: readonly HistoryPoint[] | undefined,
  live: number | null,
  now: number,
  hours: number,
  width = 100,
  height = 32,
): SparklineGeometry | null => {
  if (!points) return null
  const start = now - hours * HOUR
  // Equivalent to resampling `withLive(points, live, now)`, without the copy.
  const values =
    live === null
      ? resample(points.slice(0, upTo(points, now)), start, now)
      : resample(points, start, now, SPARKLINE_SAMPLES, { t: now, v: live })
  return sparklineGeometry(values, width, height)
}

/**
 * The high or low printed beside the graph, at the precision the entity itself reports in, so a
 * sensor reading `21.4` labels its high `22.1`, not `22.083333`.
 */
export const formatExtreme = (
  value: number,
  decimals: number,
  unit: string | undefined,
  locale?: string,
): string => {
  const places = Math.min(2, Math.max(0, decimals))
  const text = new Intl.NumberFormat(locale, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(value)
  if (!unit) return text
  return unit === '%' || unit.startsWith('°') ? `${text}${unit}` : `${text} ${unit}`
}

/** How many decimals a state string carries: `21.40` is two, `72` none. */
export const decimalsOf = (state: string): number => {
  const dot = state.indexOf('.')
  return dot === -1 ? 0 : state.length - dot - 1
}
