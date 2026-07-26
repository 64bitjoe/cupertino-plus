/**
 * Text formatting for the calendar widget, following Apple's typographic habits
 * rather than a plain `toLocaleTimeString`:
 *
 *  - a whole hour drops its `:00`            -> `5 – 6PM`, not `5:00 – 6:00 PM`
 *  - AM/PM prints once for a range that stays in one half of the day
 *  - the range separator is a spaced en dash
 *  - the meridiem is rendered smaller than the digits, which is why it comes back as
 *    its own token instead of being baked into the string
 *
 * All of it stays locale-driven: a 24-hour locale gets `17:00 – 18:00`, and the
 * meridiem can legitimately come *before* the digits (`午後1:00`), which the token
 * carries as a flag.
 */

import { dayNumber } from './datetime'

export interface TimeToken {
  /** The digits, e.g. `6` or `6:15`. */
  text: string
  /** `AM` / `PM` and their localised equivalents. Absent on a 24-hour clock. */
  meridiem?: string
  /** True in locales that put the day period first. */
  meridiemFirst?: boolean
}

export type ItemTime =
  | { kind: 'none' }
  | { kind: 'point'; at: TimeToken }
  | { kind: 'range'; from: TimeToken; to: TimeToken }

export interface FormatContext {
  locale: string | undefined
  timeZone: string | undefined
  hour12: boolean
}

/** Range separator: en dash, spaced, as on the phone. */
export const TIME_DASH = '–'

const formatters = new Map<string, Intl.DateTimeFormat>()

const formatter = (key: string, build: () => Intl.DateTimeFormat): Intl.DateTimeFormat => {
  let cached = formatters.get(key)
  if (!cached) {
    cached = build()
    formatters.set(key, cached)
  }
  return cached
}

const zone = (timeZone: string | undefined): { timeZone?: string } => (timeZone ? { timeZone } : {})

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>()

const relativeDay = (locale: string | undefined): Intl.RelativeTimeFormat => {
  const key = locale ?? ''
  let cached = relativeFormatters.get(key)
  if (!cached) {
    cached = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    relativeFormatters.set(key, cached)
  }
  return cached
}

const timeToken = (date: Date, ctx: FormatContext): TimeToken => {
  const { locale, timeZone, hour12 } = ctx
  const parts = formatter(
    `time|${locale}|${timeZone}|${hour12}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: '2-digit',
        hourCycle: hour12 ? 'h12' : 'h23',
        ...zone(timeZone),
      }),
  ).formatToParts(date)

  const hourIndex = parts.findIndex(part => part.type === 'hour')
  const periodIndex = parts.findIndex(part => part.type === 'dayPeriod')
  const hour = parts[hourIndex]?.value ?? ''
  const minute = parts.find(part => part.type === 'minute')?.value ?? ''
  // en-GB and friends hand back a lowercase "pm"; the phone sets it in capitals whatever
  // the locale thinks, and the card renders it a size down to match.
  const rawMeridiem = periodIndex === -1 ? undefined : parts[periodIndex]?.value
  const meridiem = rawMeridiem?.toLocaleUpperCase(locale)
  // The locale's own hour/minute separator: ":" almost everywhere, "." in a few places.
  const afterHour = parts[hourIndex + 1]
  const separator = afterHour?.type === 'literal' ? afterHour.value : ':'

  // Dropping ":00" is a 12-hour-clock idiom; "17 – 18" would read as a range of
  // numbers, not of times, so a 24-hour clock keeps its minutes.
  const text = hour12 && minute === '00' ? hour : `${hour}${separator}${minute}`

  return {
    text,
    ...(meridiem ? { meridiem } : {}),
    ...(meridiem && periodIndex < hourIndex ? { meridiemFirst: true } : {}),
  }
}

/**
 * How an item's time reads on the card.
 *
 * All-day items print no time at all, and anything without a real duration — a
 * reminder, a zero-length event — prints a single time.
 */
export const itemTime = (
  item: { start: Date; end?: Date; allDay?: boolean },
  ctx: FormatContext,
): ItemTime => {
  if (item.allDay) return { kind: 'none' }
  if (!item.end || item.end.getTime() <= item.start.getTime()) {
    return { kind: 'point', at: timeToken(item.start, ctx) }
  }

  const from = timeToken(item.start, ctx)
  const to = timeToken(item.end, ctx)

  // `12 – 1PM`: one meridiem is enough while both ends share a half of the same day.
  // Across days it is not — `5 – 6PM` for a five-day trip would read as one hour.
  const sameDay = dayNumber(item.start, ctx.timeZone) === dayNumber(item.end, ctx.timeZone)
  if (sameDay && from.meridiem && from.meridiem === to.meridiem) {
    // Locales that print the day period first keep it in front of the range, not
    // stranded in the middle of it: `午後1:05 – 2`, never `1:05 – 午後2`.
    return from.meridiemFirst
      ? { kind: 'range', from, to: { text: to.text } }
      : { kind: 'range', from: { text: from.text }, to }
  }

  return { kind: 'range', from, to }
}

/**
 * A section heading inside the flow: `TOMORROW`, else `SUNDAY, 26 JUL`.
 *
 * Never called for today — today's section is implicitly headed by the widget's own
 * date block.
 */
export const sectionHeading = (date: Date, today: Date, ctx: FormatContext): string => {
  const { locale, timeZone } = ctx
  const upper = (value: string): string => value.toLocaleUpperCase(locale)

  if (dayNumber(date, timeZone) - dayNumber(today, timeZone) === 1) {
    // Localised for free, and "tomorrow" rather than "in 1 day" thanks to `auto`.
    return upper(relativeDay(locale).format(1, 'day'))
  }

  const weekday = formatter(
    `weekday|${locale}|${timeZone}`,
    () => new Intl.DateTimeFormat(locale, { weekday: 'long', ...zone(timeZone) }),
  ).format(date)

  // Day and month in the locale's own order: `26 Jul` here, `Jul 26` in en-US.
  const dayMonth = formatter(
    `daymonth|${locale}|${timeZone}`,
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', ...zone(timeZone) }),
  ).format(date)

  return upper(`${weekday}, ${dayMonth}`)
}

/**
 * The tail indicator: `1 more event`, `2 more events`.
 *
 * English-only, like `No Events Today` — Home Assistant has no string for either and the
 * widget being copied says exactly this. Kept in one place because one open question ends
 * here: whether a tail of nothing but reminders should read `2 more items`. It is always
 * `events`, uglier though that is when everything hidden is a to-do.
 *
 * What the number means is settled and lives in `addMoreRow`: the rest of the one day the
 * row is drawn inside, never the rest of the loaded window.
 */
export const moreLabel = (count: number): string =>
  `${count} more ${count === 1 ? 'event' : 'events'}`

/** The always-present date block in the widget's top-left corner. */
export const widgetDate = (today: Date, ctx: FormatContext): { weekday: string; day: string } => {
  const { locale, timeZone } = ctx
  const weekday = formatter(
    `weekday|${locale}|${timeZone}`,
    () => new Intl.DateTimeFormat(locale, { weekday: 'long', ...zone(timeZone) }),
  ).format(today)
  const day = formatter(
    `day|${locale}|${timeZone}`,
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', ...zone(timeZone) }),
  ).format(today)

  return { weekday: weekday.toLocaleUpperCase(locale), day }
}
