/**
 * Spans of time: the units, reading one written as text, and the rounding a countdown prints by.
 *
 * Shared by the complication's countdowns and the live activity's time left, which used to keep
 * a copy each of the constants and helpers below, and two duration parsers that disagreed about
 * `1:05`. What each card prints stays its own (`complication/countdown.ts` writes `1h 05m`, the
 * live activity `1 hr 5 min`); what they agree on is here.
 */

export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/** `n` clamped into 0–1, for a fraction drawn as a bar or a ring. */
export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/** `1 minute`, `2 minutes`: English, as the spoken labels are. */
export const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`

/** Whole seconds left, rounded up: a timer at 0.4s still says `0:01`, as the Clock app does. */
export const secondsLeft = (ms: number): number => Math.max(0, Math.ceil(ms / SECOND))

/** `m:ss` for a whole number of seconds: `4:05`, `59:59`, `0:01`. */
export const minutesSeconds = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/**
 * What a clock-shaped duration's two parts mean when it has only two. The one real
 * disagreement between the cards, and so a choice each states rather than a default:
 *
 *  - `hours-minutes`: `1:05` is an hour and five minutes. The live activity's reading: a job
 *    that runs for hours reports in hours, and the only things that report `MM:SS` are kitchen
 *    timers, which always carry the hours too (`0:04:30`).
 *  - `minutes-seconds`: `1:05` is a minute and five seconds. The complication's, for a timer's
 *    `duration` and `remaining` attributes, which Home Assistant writes `H:MM:SS` but which a
 *    template may well shorten to `M:SS`.
 */
export type ClockPair = 'hours-minutes' | 'minutes-seconds'

const ISO_DURATION =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i

const CLOCK_DURATION = /^(?:(\d+)\s+days?,\s*)?(\d+):(\d{1,2}(?:\.\d+)?)(?::(\d{1,2}(?:\.\d+)?))?$/i

/**
 * A duration written as text, in ms, or undefined for anything that is not one: `1:05:00`
 * (H:MM:SS), a two-part clock read as `pair` says, Python's `1 day, 2:03:04`, and ISO 8601's
 * `PT1H5M`. A fraction is allowed only on the seconds.
 */
export const parseDuration = (raw: string, pair: ClockPair): number | undefined => {
  const value = raw.trim()
  const iso = ISO_DURATION.exec(value)
  if (iso && value.length > 1 && value.toUpperCase() !== 'PT') {
    const [, d, h, m, s] = iso
    return (
      Number(d ?? 0) * DAY +
      Number(h ?? 0) * HOUR +
      Number(m ?? 0) * MINUTE +
      Number(s ?? 0) * SECOND
    )
  }
  const clock = CLOCK_DURATION.exec(value)
  if (!clock) return undefined
  const [, days, first, second, third] = clock
  const day = Number(days ?? 0) * DAY
  if (third === undefined && pair === 'minutes-seconds') {
    return day + Number(first) * MINUTE + Number(second) * SECOND
  }
  // The middle part is minutes here, and minutes come whole.
  if (second?.includes('.')) return undefined
  return day + Number(first) * HOUR + Number(second) * MINUTE + Number(third ?? 0) * SECOND
}

/** `Intl.DateTimeFormat` construction is the expensive part, and the cards format per render. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

/** One `Intl.DateTimeFormat` per locale and options, built once and kept. */
export const dateFormat = (
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`
  let found = FORMATTERS.get(key)
  if (!found) {
    found = new Intl.DateTimeFormat(locale, options)
    FORMATTERS.set(key, found)
  }
  return found
}
